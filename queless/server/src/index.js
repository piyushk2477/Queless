import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { startJobs } from './jobs/index.js';
import { logger } from './lib/logger.js';
import { sessionMiddleware } from './middleware/session.js';
import { initRealtime } from './services/realtime.js';

const app = createApp();
const server = createServer(app);
initRealtime(server, sessionMiddleware); // Socket.IO on the same port

server.listen(env.PORT, () => {
  logger.info(`🚦 QueLess API on http://localhost:${env.PORT}  (web: ${env.frontendOrigins.join(', ')})`);
  if (env.jobsEnabled) startJobs();
});
