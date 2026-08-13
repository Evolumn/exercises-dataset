const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { mountDocs } = require('./docs');
const { createCacheMiddleware, staticCacheOptions } = require('./cache');
const logger = require('./logger');
const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  pageOffset,
  paginated,
  paginateList,
  paginateRecord,
  paginateGrouped,
} = require('./pagination');

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

function readPagination(query) {
  const page = parsePositiveInteger(getSingleQueryValue(query, 'page'), 'page') ?? DEFAULT_PAGE;
  const limit = parsePositiveInteger(getSingleQueryValue(query, 'limit'), 'limit') ?? DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) {
    throw new HttpError(400, `limit must not be greater than ${MAX_LIMIT}`);
  }

  const offset = pageOffset(page, limit);
  if (!Number.isSafeInteger(offset)) {
    throw new HttpError(400, 'page is too large');
  }

  return { page, limit, offset };
}

function createApp(db, cache) {
  const app = express();
  const projectRoot = path.join(__dirname, '..');
  const taxonomy = loadTaxonomy(projectRoot);

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const requestPath = req.originalUrl.split('?')[0];
      if (requestPath.startsWith('/images/') || requestPath.startsWith('/videos/')) {
        return;
      }

      const durationMs = Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(2));
      const query = Object.keys(req.query).length ? req.query : undefined;
      const payload = {
        method: req.method,
        path: requestPath,
        status: res.statusCode,
        duration_ms: durationMs,
        ip: req.ip,
        ...(query ? { query } : {}),
      };
      const message = `${req.method} ${requestPath} ${res.statusCode}`;

      if (res.statusCode >= 500) {
        logger.error(message, payload);
      } else if (res.statusCode >= 400) {
        logger.warn(message, payload);
      } else {
        logger.info(message, payload);
      }
    });
    next();
  });

  app.use(createCorsMiddleware());
  app.use(express.json({ limit: '1mb' }));
  app.use('/images', express.static(path.join(projectRoot, 'images'), staticCacheOptions));
  app.use('/videos', express.static(path.join(projectRoot, 'videos'), staticCacheOptions));
  app.use(createCacheMiddleware(cache));
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
    const { page, limit, offset } = readPagination(req.query);
    const filters = buildFilters(req.query, taxonomy);
    const total = db.prepare(`SELECT COUNT(*) AS total FROM exercises ${filters.sql}`).get(...filters.params).total;
    const rows = db.prepare(`
      SELECT * FROM exercises
      ${filters.sql}
      ORDER BY id
      LIMIT ? OFFSET ?
    `).all(...filters.params, limit, offset);

    res.json(paginated(rows.map(serializeExercise), { page, limit, total }));
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

  app.get('/taxonomy', (req, res) => {
    const { page, limit } = readPagination(req.query);
    res.json(paginateGrouped({
      body_parts: taxonomy.body_parts,
      equipment: taxonomy.equipment,
      muscles: taxonomy.muscles,
    }, page, limit, paginateRecord));
  });
  app.get('/body-parts', (req, res) => {
    const { page, limit } = readPagination(req.query);
    res.json(paginateList(labeledValues(getDistinctValues('body_part'), taxonomy.body_parts), page, limit));
  });
  app.get('/equipment', (req, res) => {
    const { page, limit } = readPagination(req.query);
    res.json(paginateList(labeledValues(getDistinctValues('equipment'), taxonomy.equipment), page, limit));
  });
  app.get('/muscles', (req, res) => {
    const { page, limit } = readPagination(req.query);
    res.json(paginateList(labeledValues(getDistinctMuscles(), taxonomy.muscles), page, limit));
  });
  app.get('/filters', (req, res) => {
    const { page, limit } = readPagination(req.query);
    res.json(paginateGrouped({
      body_parts: labeledValues(getDistinctValues('body_part'), taxonomy.body_parts),
      equipment: labeledValues(getDistinctValues('equipment'), taxonomy.equipment),
      muscles: labeledValues(getDistinctMuscles(), taxonomy.muscles),
    }, page, limit, paginateList));
  });

  mountDocs(app, projectRoot);

  app.use((_req, _res, next) => {
    next(new HttpError(404, 'Route not found'));
  });

  app.use((error, req, res, _next) => {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    logger.error(error.message, {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      stack: error.stack,
    });
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
