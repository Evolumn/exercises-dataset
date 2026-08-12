const path = require('node:path');
const express = require('express');

const FILTER_COLUMNS = {
  category: 'category',
  body_part: 'body_part',
  equipment: 'equipment',
  muscle_group: 'muscle_group',
  target: 'target',
};

const LANGUAGE_CODES = ['en', 'es', 'pt-br'];
const SEARCH_COLUMNS = ['name', 'category', 'target', 'equipment', 'muscle_group'];

const SELECT_COLUMNS = `
  id, name, category, body_part, equipment,
  instructions_en, instructions_es, instructions_pt_br, instruction_steps,
  muscle_group, secondary_muscles, target, image, gif_url, media_id,
  attribution, created_at
`;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parsePositiveInteger(value, field) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }

  return parsed;
}

function getSingleQueryValue(query, key) {
  const value = query[key];
  if (Array.isArray(value)) {
    throw new HttpError(400, `${key} must be a single value`);
  }
  return value;
}

function getFilterValues(query, key) {
  const value = query[key];
  if (value === undefined) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  if (values.some((item) => typeof item !== 'string')) {
    throw new HttpError(400, `${key} must contain only strings`);
  }

  return values
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function parseStoredJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function serializeExercise(row) {
  const instructions = Object.fromEntries(
    LANGUAGE_CODES.map((language) => [
      language,
      row[`instructions_${language.replace('-', '_')}`],
    ]),
  );

  const instructionSteps = parseStoredJson(row.instruction_steps, {});

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    body_part: row.body_part,
    equipment: row.equipment,
    instructions_en: row.instructions_en,
    instructions_es: row.instructions_es,
    instructions_pt_br: row.instructions_pt_br,
    instructions,
    instruction_steps: Object.fromEntries(
      LANGUAGE_CODES
        .filter((language) => instructionSteps[language] !== undefined)
        .map((language) => [language, instructionSteps[language]]),
    ),
    muscle_group: row.muscle_group,
    secondary_muscles: parseStoredJson(row.secondary_muscles, []),
    target: row.target,
    image: row.image,
    gif_url: row.gif_url,
    media_id: row.media_id,
    attribution: row.attribution,
    created_at: row.created_at,
  };
}

function buildFilters(query) {
  const clauses = [];
  const params = [];

  const search = getSingleQueryValue(query, 'q') ?? getSingleQueryValue(query, 'search');
  if (search !== undefined) {
    if (typeof search !== 'string') {
      throw new HttpError(400, 'q must be a string');
    }

    const searchTerm = search.trim();
    if (searchTerm) {
      clauses.push(`(${SEARCH_COLUMNS.map((column) => `LOWER(${column}) LIKE LOWER(?) ESCAPE '\\'`).join(' OR ')})`);
      params.push(...SEARCH_COLUMNS.map(() => `%${escapeLike(searchTerm)}%`));
    }
  }

  for (const [queryKey, column] of Object.entries(FILTER_COLUMNS)) {
    const values = getFilterValues(query, queryKey);
    if (values.length === 0) {
      continue;
    }

    clauses.push(`(${values.map(() => `LOWER(${column}) LIKE LOWER(?) ESCAPE '\\'`).join(' OR ')})`);
    params.push(...values.map((value) => `%${escapeLike(value)}%`));
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

function createCorsMiddleware() {
  const configuredOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : null;

  return (req, res, next) => {
    const requestOrigin = req.get('Origin');
    if (!configuredOrigins) {
      res.set('Access-Control-Allow-Origin', '*');
    } else if (requestOrigin && configuredOrigins.includes(requestOrigin)) {
      res.set('Access-Control-Allow-Origin', requestOrigin);
      res.set('Vary', 'Origin');
    }

    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    return next();
  };
}

function createApp(db) {
  const app = express();

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const requestPath = req.originalUrl.split('?')[0];
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      console.log(`${req.method} ${requestPath} ${res.statusCode} ${durationMs.toFixed(2)} ms`);
    });
    next();
  });
  const projectRoot = path.join(__dirname, '..');

  app.use(createCorsMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use('/images', express.static(path.join(projectRoot, 'images')));
  app.use('/videos', express.static(path.join(projectRoot, 'videos')));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(projectRoot, 'index.html'));
  });
  app.get('/setup.html', (_req, res) => {
    res.sendFile(path.join(projectRoot, 'setup.html'));
  });

  app.get('/exercises/random', (req, res) => {
    const row = db.prepare(`SELECT ${SELECT_COLUMNS} FROM exercises ORDER BY RANDOM() LIMIT 1`).get();
    if (!row) {
      throw new HttpError(404, 'Exercise not found');
    }
    res.json(serializeExercise(row));
  });

  app.get('/exercises/:id', (req, res) => {
    const row = db.prepare(`SELECT ${SELECT_COLUMNS} FROM exercises WHERE id = ?`).get(req.params.id);
    if (!row) {
      throw new HttpError(404, 'Exercise not found');
    }
    res.json(serializeExercise(row));
  });

  app.get('/exercises', (req, res) => {
    const page = parsePositiveInteger(getSingleQueryValue(req.query, 'page'), 'page') ?? 1;
    const limit = parsePositiveInteger(getSingleQueryValue(req.query, 'limit'), 'limit') ?? 20;
    if (limit > 100) {
      throw new HttpError(400, 'limit must not be greater than 100');
    }
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) {
      throw new HttpError(400, 'page is too large');
    }

    const filters = buildFilters(req.query);
    const total = db.prepare(`SELECT COUNT(*) AS total FROM exercises ${filters.sql}`).get(...filters.params).total;
    const rows = db.prepare(`
      SELECT ${SELECT_COLUMNS}
      FROM exercises
      ${filters.sql}
      ORDER BY id
      LIMIT ? OFFSET ?
    `).all(...filters.params, limit, offset);

    res.json({
      data: rows.map(serializeExercise),
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    });
  });

  const getDistinctValues = (column) => {
    const rows = db.prepare(`
      SELECT DISTINCT ${column} AS value
      FROM exercises
      WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''
      ORDER BY ${column} COLLATE NOCASE
    `).all();
    return rows.map((row) => row.value);
  };

  const distinctRoute = (column) => (_req, res) => {
    res.json(getDistinctValues(column));
  };

  app.get('/categories', distinctRoute('category'));
  app.get('/body-parts', distinctRoute('body_part'));
  app.get('/equipment', distinctRoute('equipment'));
  app.get('/targets', distinctRoute('target'));
  app.get('/filters', (_req, res) => {
    res.json({
      categories: getDistinctValues('category'),
      body_parts: getDistinctValues('body_part'),
      equipment: getDistinctValues('equipment'),
      muscle_groups: getDistinctValues('muscle_group'),
      targets: getDistinctValues('target'),
    });
  });

  app.use((_req, _res, next) => {
    next(new HttpError(404, 'Route not found'));
  });

  app.use((error, _req, res, _next) => {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
