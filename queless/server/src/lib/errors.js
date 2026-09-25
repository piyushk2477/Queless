// One error shape for the whole API: { code, message }.

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// HTTP status for every business-rule code raised by Postgres (raise_app) or Node.
export const STATUS_BY_CODE = {
  VALIDATION: 400,
  PREREQ_MISSING: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CSRF: 403,
  NOT_FOUND: 404,
  QUEUE_CLOSED: 409,
  QUEUE_PAUSED: 409,
  QUEUE_FULL: 409,
  BUSINESS_NOT_APPROVED: 409,
  ALREADY_IN_QUEUE: 409,
  STATE_CONFLICT: 409,
  COUNTER_BUSY: 409,
  COUNTER_INACTIVE: 409,
  DUPLICATE: 409,
  EMAIL_TAKEN: 409,
  TOKEN_LIMIT_REACHED: 429,
  RATE_LIMITED: 429,
};

export const err = {
  validation: (msg) => new AppError(400, 'VALIDATION', msg),
  unauthorized: (msg = 'Please log in') => new AppError(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'You do not have access to this') => new AppError(403, 'FORBIDDEN', msg),
  notFound: (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`),
};

/**
 * Postgres functions raise: message = CODE, detail = human text, hint = 'queless'.
 * Other Postgres errors are mapped by SQLSTATE.
 */
export function fromDb(e) {
  if (e instanceof AppError) return e;
  if (e.hint === 'queless') {
    return new AppError(STATUS_BY_CODE[e.message] ?? 400, e.message, e.detail ?? e.message);
  }
  if (e.code === '23505') return new AppError(409, 'DUPLICATE', 'That value is already taken');
  if (e.code === '23503') return new AppError(409, 'STATE_CONFLICT', 'This item is still in use');
  if (e.code === '23514') return err.validation('A value is out of the allowed range');
  if (e.code === '22P02') return err.validation('Invalid id');
  const wrapped = new AppError(500, 'DB_ERROR', e.message);
  wrapped.cause = e;
  return wrapped;
}
