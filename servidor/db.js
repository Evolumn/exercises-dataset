const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const PROJECT_ROOT = path.join(__dirname, '..');

const CREATE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    body_part TEXT,
    equipment TEXT,
    instructions_en TEXT,
    instructions_es TEXT,
    instructions_pt_br TEXT,
    instruction_steps TEXT NOT NULL DEFAULT '{}',
    muscle_group TEXT,
    secondary_muscles TEXT NOT NULL DEFAULT '[]',
    target TEXT,
    image TEXT,
    gif_url TEXT,
    media_id TEXT,
    attribution TEXT,
    created_at TEXT
  );

  CREATE INDEX IF NOT EXISTS exercises_category_idx ON exercises(category);
  CREATE INDEX IF NOT EXISTS exercises_body_part_idx ON exercises(body_part);
  CREATE INDEX IF NOT EXISTS exercises_equipment_idx ON exercises(equipment);
  CREATE INDEX IF NOT EXISTS exercises_muscle_group_idx ON exercises(muscle_group);
  CREATE INDEX IF NOT EXISTS exercises_target_idx ON exercises(target);
`;

const INSTRUCTION_LANGUAGES = ['en', 'es', 'pt-br'];
const REMOVED_INSTRUCTION_COLUMNS = [
  'instructions_it',
  'instructions_tr',
  'instructions_ru',
  'instructions_zh',
  'instructions_hi',
  'instructions_pl',
  'instructions_ko',
  'instructions_fr',
];

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
  db.exec(CREATE_SCHEMA);
  migrateInstructionColumns(db);
  return db;
}

function migrateInstructionColumns(db) {
  const columns = new Set(db.prepare('PRAGMA table_info(exercises)').all().map((column) => column.name));
  const columnsToRemove = REMOVED_INSTRUCTION_COLUMNS.filter((column) => columns.has(column));

  if (columnsToRemove.length === 0) {
    return;
  }

  const migrate = db.transaction(() => {
    for (const column of columnsToRemove) {
      db.exec(`ALTER TABLE exercises DROP COLUMN ${column}`);
    }
  });
  migrate();
}

function asJson(value, fallback) {
  return JSON.stringify(value === undefined || value === null ? fallback : value);
}

function onlyAllowedLanguages(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    INSTRUCTION_LANGUAGES
      .filter((language) => value[language] !== undefined)
      .map((language) => [language, value[language]]),
  );
}

function importExercises(db, dataPath = process.env.DATA_PATH || './data/exercises.json') {
  const resolvedPath = resolvePath(dataPath);
  const rawData = fs.readFileSync(resolvedPath, 'utf8');
  const exercises = JSON.parse(rawData);

  if (!Array.isArray(exercises)) {
    throw new Error('The exercise data file must contain a JSON array');
  }

  const upsert = db.prepare(`
    INSERT INTO exercises (
      id, name, category, body_part, equipment,
      instructions_en, instructions_es, instructions_pt_br, instruction_steps,
      muscle_group, secondary_muscles, target, image, gif_url, media_id,
      attribution, created_at
    ) VALUES (
      @id, @name, @category, @body_part, @equipment,
      @instructions_en, @instructions_es, @instructions_pt_br, @instruction_steps,
      @muscle_group, @secondary_muscles, @target, @image, @gif_url, @media_id,
      @attribution, @created_at
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      body_part = excluded.body_part,
      equipment = excluded.equipment,
      instructions_en = excluded.instructions_en,
      instructions_es = excluded.instructions_es,
      instructions_pt_br = excluded.instructions_pt_br,
      instruction_steps = excluded.instruction_steps,
      muscle_group = excluded.muscle_group,
      secondary_muscles = excluded.secondary_muscles,
      target = excluded.target,
      image = excluded.image,
      gif_url = excluded.gif_url,
      media_id = excluded.media_id,
      attribution = excluded.attribution,
      created_at = excluded.created_at
  `);

  const insertAll = db.transaction((records) => {
    for (const exercise of records) {
      if (!exercise || typeof exercise.id !== 'string' || !exercise.id || typeof exercise.name !== 'string') {
        throw new Error('Every exercise must have a string id and name');
      }

      const instructions = exercise.instructions || {};
      const instructionValues = Object.fromEntries(
        INSTRUCTION_LANGUAGES.map((language) => [
          `instructions_${language.replace('-', '_')}`,
          instructions[language] ?? null,
        ]),
      );

      upsert.run({
        id: exercise.id,
        name: exercise.name,
        category: exercise.category ?? null,
        body_part: exercise.body_part ?? null,
        equipment: exercise.equipment ?? null,
        ...instructionValues,
        instruction_steps: asJson(onlyAllowedLanguages(exercise.instruction_steps), {}),
        muscle_group: exercise.muscle_group ?? null,
        secondary_muscles: asJson(exercise.secondary_muscles, []),
        target: exercise.target ?? null,
        image: exercise.image ?? null,
        gif_url: exercise.gif_url ?? null,
        media_id: exercise.media_id ?? null,
        attribution: exercise.attribution ?? null,
        created_at: exercise.created_at ?? null,
      });
    }
  });

  insertAll(exercises);
  return exercises.length;
}

module.exports = { createDatabase, importExercises };
