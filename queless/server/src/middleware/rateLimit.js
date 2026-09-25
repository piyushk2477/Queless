import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const handler = (_req, res) => res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' });
const make = (windowMs, limit) =>
  rateLimit({ windowMs, limit: env.isTest ? 10_000 : limit, standardHeaders: true, legacyHeaders: false, handler });

export const loginLimiter = make(15 * 60_000, 10); // brute-force protection
export const registerLimiter = make(60 * 60_000, 20);
export const joinLimiter = make(60_000, 20); // joining a queue
export const kioskSetupLimiter = make(15 * 60_000, 10);
export const apiLimiter = make(60_000, 300); // everything else
