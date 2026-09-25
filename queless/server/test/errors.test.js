import { describe, expect, it } from 'vitest';
import { fromDb } from '../src/lib/errors.js';

describe('fromDb', () => {
  it('maps queue-engine errors (hint=queless) to their HTTP status', () => {
    const e = fromDb({ message: 'TOKEN_LIMIT_REACHED', detail: 'max 2', hint: 'queless' });
    expect([e.status, e.code, e.message]).toEqual([429, 'TOKEN_LIMIT_REACHED', 'max 2']);
  });
  it('maps STATE_CONFLICT to 409 and PREREQ_MISSING to 400', () => {
    expect(fromDb({ message: 'STATE_CONFLICT', hint: 'queless' }).status).toBe(409);
    expect(fromDb({ message: 'PREREQ_MISSING', hint: 'queless' }).status).toBe(400);
  });
  it('maps unique violations to DUPLICATE and unknown errors to 500', () => {
    expect(fromDb({ message: 'dup', code: '23505' }).code).toBe('DUPLICATE');
    expect(fromDb({ message: 'boom' }).status).toBe(500);
  });
});
