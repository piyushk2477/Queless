#!/usr/bin/env bash
# Queue-engine tests against a Postgres that has the migrations + seed applied.
# Usage: PGURL=postgres://postgres:postgres@127.0.0.1:54322/postgres ./engine_tests.sh
set -euo pipefail
PGURL="${PGURL:-postgres://postgres:postgres@127.0.0.1:54322/postgres}"
q() { psql "$PGURL" -v ON_ERROR_STOP=1 -qtAc "$1"; }
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; exit 1; }

Q=a0000000-0000-4000-8000-000000000003   # Dental OPD (no prerequisites)
echo "1) 200 concurrent joins -> seq 1..200, unique"
q "update queues set daily_capacity = 1000, status = 'open' where id = '$Q'"
q "delete from queue_entries where queue_id = '$Q'; delete from queue_day_seq where queue_id = '$Q'"
seq 1 200 | xargs -P 50 -I{} psql "$PGURL" -qtAc \
  "select public.join_queue('$Q', null, 'Load {}', null, 'kiosk', '[]'::jsonb, '{}'::jsonb)" >/dev/null
R=$(q "select count(*), count(distinct seq), min(seq), max(seq) from queue_entries where queue_id = '$Q' and service_date = app_today()")
[ "$R" = "200|200|1|200" ] && pass "tokens 1..200, no duplicates, no gaps ($R)" || fail "got $R"
R=$(q "select waiting_count from queue_live where queue_id = '$Q'")
[ "$R" = "200" ] && pass "queue_live.waiting_count = 200" || fail "queue_live says $R"

echo "2) concurrent call_next on two counters never picks the same entry"
C2=$(q "insert into counters (business_id, name) select business_id, 'Chair 2' from queues where id = '$Q' returning id")
q "insert into counter_queues values ('$C2', '$Q')"
C1=c0000000-0000-4000-8000-000000000004
for i in $(seq 1 20); do
  psql "$PGURL" -qtAc "select call_next('$C1')->>'id'" > /tmp/ql_c1_$i &
  psql "$PGURL" -qtAc "select call_next('$C2')->>'id'" > /tmp/ql_c2_$i &
  wait
  A=$(cat /tmp/ql_c1_$i); B=$(cat /tmp/ql_c2_$i)
  [ "$A" != "$B" ] || fail "both counters called $A"
  q "select transition_entry('$A','SKIPPED'), transition_entry('$B','SKIPPED')" >/dev/null
done
pass "20 rounds, always different people"

echo "3) illegal transitions raise STATE_CONFLICT"
E=$(q "select id from queue_entries where queue_id = '$Q' and status = 'WAITING' order by seq limit 1")
for to in SERVING COMPLETED SKIPPED NO_SHOW; do
  OUT=$(psql "$PGURL" -qtAc "select transition_entry('$E', '$to')" 2>&1 || true)
  echo "$OUT" | grep -q STATE_CONFLICT && pass "WAITING -> $to rejected" || fail "WAITING -> $to allowed"
done

echo "4) token limit: max 2 active per category"
U=$(q "insert into users (email, password_hash) values ('limit-test-' || floor(random()*1e9) || '@x.dev', 'x') returning id")
q "select join_queue('a0000000-0000-4000-8000-000000000003', '$U')" >/dev/null
q "select join_queue('a0000000-0000-4000-8000-000000000004', '$U')" >/dev/null
OUT=$(psql "$PGURL" -qtAc "select join_queue('a0000000-0000-4000-8000-000000000002', '$U', null, null, 'app', '[\"id_proof\"]')" 2>&1 || true)
echo "$OUT" | grep -q TOKEN_LIMIT_REACHED && pass "3rd healthcare token rejected" || fail "$OUT"

# cleanup
q "delete from queue_entries where queue_id = '$Q'; delete from queue_day_seq where queue_id = '$Q'; delete from counters where id = '$C2'; update queues set daily_capacity = 80 where id = '$Q'; delete from users where id = '$U'"
q "select refresh_queue_live('$Q')" >/dev/null
echo "All engine tests passed."
