const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

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
  return {
    id: row.id,
    body_part: row.body_part,
    equipment: row.equipment,
    muscles: parseStoredJson(row.muscles, { primary: [], secondary: [] }),
    i18n: parseStoredJson(row.i18n, {}),
    media: parseStoredJson(row.media, {}),
  };
}

function slugsMatchingSearch(dictionary, searchTerm) {
  const needle = searchTerm.toLowerCase();
  return Object.entries(dictionary || {})
    .filter(([, labels]) => Object.values(labels || {}).some((label) => String(label).toLowerCase().includes(needle)))
    .map(([id]) => id);
}

function buildSearchClause(searchTerm, taxonomy) {
  const like = `%${escapeLike(searchTerm)}%`;
  const parts = [
    `LOWER(i18n) LIKE LOWER(?) ESCAPE '\\'`,
    `LOWER(body_part) LIKE LOWER(?) ESCAPE '\\'`,
    `LOWER(equipment) LIKE LOWER(?) ESCAPE '\\'`,
    `LOWER(muscles) LIKE LOWER(?) ESCAPE '\\'`,
  ];
  const params = [like, like, like, like];

  const bodyParts = slugsMatchingSearch(taxonomy.body_parts, searchTerm);
  if (bodyParts.length > 0) {
    parts.push(`body_part IN (${bodyParts.map(() => '?').join(', ')})`);
    params.push(...bodyParts);
  }

  const equipment = slugsMatchingSearch(taxonomy.equipment, searchTerm);
  if (equipment.length > 0) {
    parts.push(`equipment IN (${equipment.map(() => '?').join(', ')})`);
    params.push(...equipment);
  }

  const muscles = slugsMatchingSearch(taxonomy.muscles, searchTerm);
  if (muscles.length > 0) {
    const muscleClause = muscles.map(() => `(
      EXISTS (SELECT 1 FROM json_each(json_extract(muscles, '$.primary')) WHERE value = ?)
      OR EXISTS (SELECT 1 FROM json_each(json_extract(muscles, '$.secondary')) WHERE value = ?)
    )`).join(' OR ');
    parts.push(`(${muscleClause})`);
    for (const muscle of muscles) {
      params.push(muscle, muscle);
    }
  }

  return {
    sql: `(${parts.join(' OR ')})`,
    params,
  };
}

function buildFilters(query, taxonomy) {
  const clauses = [];
  const params = [];

  const search = getSingleQueryValue(query, 'q') ?? getSingleQueryValue(query, 'search');
  if (search !== undefined) {
    if (typeof search !== 'string') {
      throw new HttpError(400, 'q must be a string');
    }

    const searchTerm = search.trim();
    if (searchTerm) {
      const searchClause = buildSearchClause(searchTerm, taxonomy);
      clauses.push(searchClause.sql);
      params.push(...searchClause.params);
    }
  }

  for (const column of ['body_part', 'equipment']) {
    const values = getFilterValues(query, column);
    if (values.length === 0) {
      continue;
    }
    clauses.push(`(${values.map(() => `${column} = ?`).join(' OR ')})`);
    params.push(...values);
  }

  const muscles = getFilterValues(query, 'muscle');
  if (muscles.length > 0) {
    const muscleClause = muscles.map(() => `(
      EXISTS (SELECT 1 FROM json_each(json_extract(muscles, '$.primary')) WHERE value = ?)
      OR EXISTS (SELECT 1 FROM json_each(json_extract(muscles, '$.secondary')) WHERE value = ?)
    )`).join(' OR ');
    clauses.push(`(${muscleClause})`);
    for (const muscle of muscles) {
      params.push(muscle, muscle);
    }
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

function loadTaxonomy(projectRoot) {
  const taxonomyPath = path.join(projectRoot, 'data', 'taxonomy.json');
  return JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));
}

function labeledValues(ids, dictionary) {
  return ids.map((id) => ({
    id,
    labels: dictionary[id] || { en: id, es: id, 'pt-br': id },
  }));
}

function createApp(db) {
  const app = express();
  const projectRoot = path.join(__dirname, '..');
  const taxonomy = loadTaxonomy(projectRoot);

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
    const row = db.prepare('SELECT * FROM exercises ORDER BY RANDOM() LIMIT 1').get();
    if (!row) {
      throw new HttpError(404, 'Exercise not found');
    }
    res.json(serializeExercise(row));
  });

  app.get('/exercises/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
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

    const filters = buildFilters(req.query, taxonomy);
    const total = db.prepare(`SELECT COUNT(*) AS total FROM exercises ${filters.sql}`).get(...filters.params).total;
    const rows = db.prepare(`
      SELECT * FROM exercises
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

  const getDistinctMuscles = () => {
    const rows = db.prepare(`
      SELECT DISTINCT value
      FROM exercises, json_each(json_extract(muscles, '$.primary'))
      UNION
      SELECT DISTINCT value
      FROM exercises, json_each(json_extract(muscles, '$.secondary'))
      ORDER BY 1 COLLATE NOCASE
    `).all();
    return rows.map((row) => row.value);
  };

  app.get('/taxonomy', (_req, res) => {
    res.json(taxonomy);
  });
  app.get('/body-parts', (_req, res) => {
    res.json(labeledValues(getDistinctValues('body_part'), taxonomy.body_parts));
  });
  app.get('/equipment', (_req, res) => {
    res.json(labeledValues(getDistinctValues('equipment'), taxonomy.equipment));
  });
  app.get('/muscles', (_req, res) => {
    res.json(labeledValues(getDistinctMuscles(), taxonomy.muscles));
  });
  app.get('/filters', (_req, res) => {
    res.json({
      body_parts: labeledValues(getDistinctValues('body_part'), taxonomy.body_parts),
      equipment: labeledValues(getDistinctValues('equipment'), taxonomy.equipment),
      muscles: labeledValues(getDistinctMuscles(), taxonomy.muscles),
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
