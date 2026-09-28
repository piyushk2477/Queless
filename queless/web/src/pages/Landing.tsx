import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Clock, EyeOff, FileCheck2, LocateFixed, Search, Timer, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Reveal } from '../components/Motion';
import { Avatar, ButtonLink, CheckList, IconTile } from '../components/ui';
import { api } from '../lib/api';
import { formatDuration } from '../lib/traffic';
import { useApp } from '../store/app';

const STEPS = [
  { icon: Search, title: 'Find', text: 'Search by need, like "ear pain" or "home loan", and see how crowded each place is.' },
  { icon: FileCheck2, title: 'Join', text: 'Tick the documents you need, then join from anywhere. You get a token like E-014.' },
  { icon: Clock, title: 'Wait anywhere', text: 'Your place updates live. We alert you when you are 3 away.' },
  { icon: Bell, title: 'Walk in', text: 'Your phone shows "Go to Counter 2" the moment you are called.' },
];

const RULES = [
  { icon: Users, text: 'Max 2 active tokens per category' },
  { icon: FileCheck2, text: 'Required documents are confirmed before joining' },
  { icon: Timer, text: 'No-shows are skipped after the grace period' },
  { icon: EyeOff, text: 'Public screens show token numbers, never names' },
];

const FAQ = [
  ['Do I need to install an app?', 'No. QueLess works in any phone browser. Guests can join by scanning the QR poster at the door, without an account.'],
  ['How accurate is the wait time?', 'It uses how long each counter actually took today, divided across the counters that are open, and improves with every person served.'],
  ["What if I'm late?", "When you're called you get a grace period (usually 5 minutes). After that the next person is called."],
  ['Is it free?', 'Free for customers. Businesses are in a free beta.'],
];

/** Soft pink illustration: a blob with a phone-style token card and floating badges. */
function HeroArt() {
  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-[560px]" aria-hidden>
      <div className="blob absolute inset-[6%_4%_2%_6%]" />
      <div className="absolute left-[30%] top-[4%] h-[46%] w-[46%] rounded-full border-2 border-dashed border-accent/40" />
      <span className="absolute left-[14%] top-[20%] h-3.5 w-3.5 rounded-full bg-bad" />
      <span className="absolute left-[20%] top-[36%] h-10 w-10 rounded-full border-2 border-white/80" />

      {/* token card */}
      <div className="float-slow absolute left-[27%] top-[26%] w-[48%] rotate-[-4deg] rounded-3xl bg-surface p-5 shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>ENT OPD</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent-ink">Waiting</span>
        </div>
        <p className="token mt-2 text-4xl">E-014</p>
        <p className="mt-1 text-sm font-semibold">You're #4 · ~12 min</p>
        <div className="mt-3 flex gap-1">
          {Array.from({ length: 8 }, (_, i) => <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < 5 ? 'var(--accent)' : 'var(--line)' }} />)}
        </div>
      </div>

      {/* floating badges */}
      <span className="absolute right-[6%] top-[34%] inline-flex h-16 w-16 items-center justify-center rounded-full bg-bad text-white shadow-[var(--shadow)]">
        <Bell size={26} />
      </span>
      <span className="absolute bottom-[14%] left-[8%] inline-flex h-20 w-20 items-center justify-center rounded-full bg-surface shadow-[var(--shadow)]">
        <Clock size={30} className="text-ink" />
      </span>
      <span className="absolute bottom-[4%] right-[4%] flex items-center gap-2.5 rounded-full bg-surface py-2 pl-2 pr-4 shadow-[var(--shadow)]">
        <Avatar name="Sahyadri ENT" size={34} />
        <span className="text-sm font-medium">Sahyadri ENT Clinic</span>
      </span>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const setLocation = useApp((s) => s.setLocation);
  const [tab, setTab] = useState('customer');
  const [pincode, setPincode] = useState('');
  const { data: stats } = useQuery({ queryKey: ['public-stats'], queryFn: () => api('/stats/public'), refetchInterval: 20_000 });
  const { data: cats } = useQuery({ queryKey: ['categories'], queryFn: () => api('/categories') });

  const goPincode = (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pincode)) return void toast.error('Enter a 6-digit pincode');
    navigate(`/discover?pincode=${pincode}`);
  };
  const gps = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setLocation({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'My location' });
        navigate('/discover');
      },
      () => toast.error('Location permission denied. Use your pincode instead.'),
      { timeout: 10000 },
    );

  const business = tab === 'business';

  return (
    <>
      {/* ------------------------------------------------ hero */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div>
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={!business} className={!business ? 'on' : ''} onClick={() => setTab('customer')}>Find a queue</button>
            <button role="tab" aria-selected={business} className={business ? 'on' : ''} onClick={() => setTab('business')}>For business</button>
          </div>

          <h1 className="display mt-8 text-5xl sm:text-6xl lg:text-7xl">
            {business ? (
              <>Run calmer queues at your <span className="accent-text">front desk</span></>
            ) : (
              <>Join the queue, not the <span className="accent-text">crowd</span></>
            )}
          </h1>

          <CheckList
            className="mt-8"
            items={
              business
                ? ['Counter console with one-key shortcuts', 'TV "Now Serving" board and walk-in kiosk', 'QR posters, broadcasts and analytics — free beta']
                : ['Get a token from your phone, for free', 'See live wait times before you leave home', 'Walk in only when it is your turn']
            }
          />

          {business ? (
            <div className="mt-10 flex flex-wrap gap-3">
              <ButtonLink to="/biz/onboard" variant="primary" size="lg">Register your business <ArrowRight size={18} /></ButtonLink>
              <ButtonLink to="/login" size="lg">Log in</ButtonLink>
            </div>
          ) : (
            <form onSubmit={goPincode} className="mt-10 flex max-w-md flex-wrap gap-2.5">
              <label htmlFor="pin" className="sr-only">Pincode</label>
              <input id="pin" className="input !w-auto flex-1 !rounded-full !px-5" inputMode="numeric" maxLength={6} placeholder="Enter pincode, e.g. 411038" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} />
              <button type="submit" className="btn btn-primary btn-lg">Find queues</button>
              <button type="button" onClick={gps} className="btn btn-ghost btn-sm mt-1 !pl-2"><LocateFixed size={15} /> Use my location</button>
            </form>
          )}
        </div>
        <Reveal delay={100}>
          <HeroArt />
        </Reveal>
      </section>

      {/* ------------------------------------------------ live numbers */}
      <section className="mx-auto max-w-7xl px-5">
        <Reveal className="card-soft grid grid-cols-2 gap-6 px-6 py-8 sm:grid-cols-4 sm:px-10">
          {[
            [stats?.waiting_now ?? '—', 'people waiting now'],
            [stats?.served_today ?? '—', 'served today'],
            [stats?.queues_open ?? '—', 'queues open'],
            [stats?.avg_wait_sec ? formatDuration(stats.avg_wait_sec) : '—', 'average wait today'],
          ].map(([v, l]) => (
            <div key={l}>
              <p className="text-3xl font-bold tracking-tight">{v}</p>
              <p className="mt-1 text-sm text-muted">{l}</p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ------------------------------------------------ how it works */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-24 px-5 py-24">
        <Reveal className="max-w-2xl">
          <p className="kicker">How it works</p>
          <h2 className="mt-2 text-4xl sm:text-5xl">Four steps. No waiting room.</h2>
        </Reveal>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 80} className="card p-6">
              <IconTile><s.icon size={20} /></IconTile>
              <h3 className="mt-5 text-lg">{i + 1}. {s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ categories */}
      <section className="mx-auto max-w-7xl px-5">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-4xl sm:text-5xl">What do you need today?</h2>
          <Link to="/discover" className="link-arrow">Browse all <ArrowRight size={16} /></Link>
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
          {(cats?.categories ?? []).map((c, i) => (
            <Reveal key={c.id} delay={(i % 3) * 60}>
              <Link to={`/discover?category=${c.slug}`} className="card card-hover flex items-center gap-4 p-5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xl">{c.icon}</span>
                <span className="font-semibold leading-tight">{c.name}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ rules */}
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-24 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <p className="kicker">Fair by design</p>
          <h2 className="mt-2 text-4xl sm:text-5xl">Rules everyone can trust</h2>
          <p className="lede mt-4 text-lg">The system enforces these automatically — for every clinic, bank and office.</p>
        </Reveal>
        <div className="grid gap-3">
          {RULES.map((r, i) => (
            <Reveal key={r.text} delay={i * 70} className="card flex items-center gap-4 p-5">
              <IconTile><r.icon size={20} /></IconTile>
              <p className="font-medium">{r.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ faq */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-5">
        <Reveal><h2 className="text-center text-4xl sm:text-5xl">Questions</h2></Reveal>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                {q}
                <span className="text-2xl font-light text-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ cta */}
      <section className="mx-auto max-w-7xl px-5 pt-24">
        <Reveal className="card-accent flex flex-col items-start justify-between gap-6 p-10 sm:flex-row sm:items-center sm:p-14">
          <div>
            <h2 className="text-3xl sm:text-4xl">Your time is worth more than a line.</h2>
            <p className="mt-2 text-ink-2">Find a queue near you in seconds.</p>
          </div>
          <ButtonLink to="/discover" variant="primary" size="lg">Find a queue <ArrowRight size={18} /></ButtonLink>
        </Reveal>
      </section>
    </>
  );
}
