import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.isTest ? 'silent' : 'info',
  transport: env.isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
