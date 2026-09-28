import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { AppError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { csrfGuard } from './middleware/csrf.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { sessionMiddleware } from './middleware/session.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { businessRouter } from './routes/business.js';
import { filesRouter } from './routes/files.js';
import { kioskRouter } from './routes/kiosk.js';
import { publicRouter } from './routes/public.js';
import { queueRouter } from './routes/queue.js';
import { staffRouter } from './routes/staff.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render/Railway/Vercel proxies → correct IPs + secure cookies

  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendOrigins,
      credentials: true, // send the session cookie
      allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-Device-Id', 'X-Kiosk-Key'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(sessionMiddleware);

  const health = (_req, res) => res.json({ ok: true, service: 'queless-api', time: new Date().toISOString() });
  app.get('/health', health);
  app.get('/api/health', health);

  const api = express.Router();
  api.use(apiLimiter);
  api.use(csrfGuard);
  api.use(authRouter);
  api.use(publicRouter);
  api.use(queueRouter);
  api.use(filesRouter);
  api.use(kioskRouter);
  api.use(adminRouter);
  api.use(staffRouter);
  api.use(businessRouter);
  app.use('/api', api);

  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found' }));

  // Central error handler → { code, message }
  // eslint-disable-next-line no-unused-vars
  app.use((e, _req, res, _next) => {
    if (e instanceof AppError) {
      if (e.status >= 500) logger.error(e.cause ?? e);
      return res.status(e.status).json({ code: e.code, message: e.status >= 500 && env.isProd ? 'Something went wrong' : e.message });
    }
    if (e?.type === 'entity.parse.failed') return res.status(400).json({ code: 'VALIDATION', message: 'Malformed JSON' });
    logger.error(e);
    return res.status(500).json({ code: 'INTERNAL', message: 'Something went wrong' });
  });

  return app;
}
