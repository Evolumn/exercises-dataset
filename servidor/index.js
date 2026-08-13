const path = require('node:path');
const { createDatabase, importExercises } = require('./db');
const { createApp } = require('./app');
const { createCache } = require('./cache');
const logger = require('./logger');

const port = Number.parseInt(process.env.PORT || '3030', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

async function start() {
  const cache = await createCache(process.env.REDIS_URL);
  const db = createDatabase();
  const dataPath = process.env.DATA_PATH || path.join(__dirname, '..', 'data', 'exercises.json');
  const importedCount = importExercises(db, dataPath);
  const app = createApp(db, cache);
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'exercises.db');

  const server = app.listen(port, () => {
    logger.info('API listening', { port, url: `http://localhost:${port}` });
    logger.info('Exercises imported', { count: importedCount, db: dbPath });
  });

  function shutdown(signal) {
    logger.info('Shutting down', { signal });
    server.close(() => {
      db.close();
      Promise.resolve(cache.close()).finally(() => process.exit(0));
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { app, db, server };
}

start().catch((error) => {
  logger.error(error.message, { stack: error.stack });
  process.exit(1);
});
