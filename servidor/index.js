const path = require('node:path');
const { createDatabase, importExercises } = require('./db');
const { createApp } = require('./app');
const logger = require('./logger');

const port = Number.parseInt(process.env.PORT || '3030', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const db = createDatabase();
const dataPath = process.env.DATA_PATH || path.join(__dirname, '..', 'data', 'exercises.json');
const importedCount = importExercises(db, dataPath);
const app = createApp(db);
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'exercises.db');
const server = app.listen(port, () => {
  logger.info('API listening', { port, url: `http://localhost:${port}` });
  logger.info('Exercises imported', { count: importedCount, db: dbPath });
});

function shutdown(signal) {
  logger.info('Shutting down', { signal });
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, db, server };
