import { describe, expect, it } from 'vitest';
import { etaSeconds, formatDuration, positionOf, trafficFor } from '../traffic';

describe('crowd colour (same thresholds as the database)', () => {
  it('0-3 green, 4-9 yellow, 10+ red', () => {
    expect([0, 3, 4, 9, 10].map(trafficFor)).toEqual(['GREEN', 'GREEN', 'YELLOW', 'YELLOW', 'RED']);
  });
});

describe('tracker position', () => {
  const waiting = ['E-003', 'E-004', 'E-012'];
  it('is index + 1 in queue_live.waiting', () => expect(positionOf(waiting, 'E-012')).toBe(3));
  it('is 0 when my token is no longer waiting', () => expect(positionOf(waiting, 'E-001')).toBe(0));
  it('moves up when someone ahead leaves', () => expect(positionOf(['E-004', 'E-012'], 'E-012')).toBe(2));
});

describe('ETA = ceil(position / counters) x avg service', () => {
  it('one counter', () => expect(etaSeconds(4, 1, 180)).toBe(720));
  it('two counters share the line', () => expect(etaSeconds(4, 2, 180)).toBe(360));
  it('rounds partial rounds up', () => expect(etaSeconds(3, 2, 180)).toBe(360));
  it('formats', () => expect([formatDuration(720), formatDuration(3900), formatDuration(0)]).toEqual(['12 min', '1h 5m', 'now']));
});
