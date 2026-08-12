const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const PROJECT_ROOT = path.join(__dirname, '..');
const LANGUAGES = ['en', 'es', 'pt-br'];

const CREATE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    body_part TEXT,
    equipment TEXT,
    muscles TEXT NOT NULL DEFAULT '{"primary":[],"secondary":[]}',
    i18n TEXT NOT NULL DEFAULT '{}',
    media TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS exercises_body_part_idx ON exercises(body_part);
  CREATE INDEX IF NOT EXISTS exercises_equipment_idx ON exercises(equipment);
`;

function resolvePath(value, fallback) {
  if (value && path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(PROJECT_ROOT, value || fallback);
}

function createDatabase(databasePath = process.env.DB_PATH || './data/exercises.db') {
  const resolvedPath = databasePath === ':memory:' ? databasePath : resolvePath(databasePath);

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  ensureSchema(db);
  return db;
}

function ensureSchema(db) {
  const columns = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'exercises'").get()
      ? db.prepare('PRAGMA table_info(exercises)').all().map((column) => column.name)
      : [],
  );

  if (columns.size > 0 && !columns.has('i18n')) {
    db.exec('DROP TABLE IF EXISTS exercises');
  }

  db.exec(CREATE_SCHEMA);
}

function asJson(value, fallback) {
  return JSON.stringify(value === undefined || value === null ? fallback : value);
}

function onlyAllowedLanguages(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    LANGUAGES
      .filter((language) => value[language] !== undefined)
      .map((language) => [language, value[language]]),
  );
}

function importExercises(db, dataPath = process.env.DATA_PATH || './data/exercises.json') {
  const resolvedPath = resolvePath(dataPath);
  const exercises = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  if (!Array.isArray(exercises)) {
    throw new Error('The exercise data file must contain a JSON array');
  }

  const upsert = db.prepare(`
    INSERT INTO exercises (id, body_part, equipment, muscles, i18n, media)
    VALUES (@id, @body_part, @equipment, @muscles, @i18n, @media)
    ON CONFLICT(id) DO UPDATE SET
      body_part = excluded.body_part,
      equipment = excluded.equipment,
      muscles = excluded.muscles,
      i18n = excluded.i18n,
      media = excluded.media
  `);

  const insertAll = db.transaction((records) => {
    for (const exercise of records) {
      if (!exercise || typeof exercise.id !== 'string' || !exercise.id) {
        throw new Error('Every exercise must have a string id');
      }
      if (!exercise.i18n?.['pt-br']?.name) {
        throw new Error(`Exercise ${exercise.id} must have i18n.pt-br.name`);
      }

      upsert.run({
        id: exercise.id,
        body_part: exercise.body_part ?? null,
        equipment: exercise.equipment ?? null,
        muscles: asJson(exercise.muscles, { primary: [], secondary: [] }),
        i18n: asJson(onlyAllowedLanguages(exercise.i18n), {}),
        media: asJson(exercise.media, {}),
      });
    }
  });

  insertAll(exercises);
  return exercises.length;
}

module.exports = { createDatabase, importExercises };
