const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('redis');
const logger = require('./logger');

const KEY_PREFIX = 'exercises-api:';
const CACHEABLE_STATUSES = new Set([200, 404]);

function createNoopCache() {
  return {
    enabled: false,
    async get() {
      return null;
    },
    async set() {},
    async close() {},
  };
}

async function clearPrefixedKeys(client) {
  const keys = await client.keys(`${KEY_PREFIX}*`);
  if (keys.length > 0) {
    await client.del(keys);
  }
}

async function createCache(redisUrl) {
  if (!redisUrl) {
    return createNoopCache();
  }

  const client = createClient({ url: redisUrl });
  client.on('error', (error) => {
    logger.error('Redis client error', { error: error.message });
  });

  await client.connect();
  await clearPrefixedKeys(client);
  logger.info('Redis cache ready');

  return {
    enabled: true,
    async get(key) {
      try {
        const raw = await client.get(`${KEY_PREFIX}${key}`);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        await client.set(`${KEY_PREFIX}${key}`, JSON.stringify(value));
      } catch {
        // Keep serving the request if Redis is unavailable.
      }
    },
    async close() {
      if (client.isOpen) {
        client.destroy();
      }
    },
  };
}

function requestPath(req) {
  return req.originalUrl.split('?')[0];
}

function isRandomExercise(req) {
  return requestPath(req) === '/exercises/random';
}

function isStaticMedia(req) {
  const pathName = requestPath(req);
  return pathName === '/images' || pathName.startsWith('/images/')
    || pathName === '/videos' || pathName.startsWith('/videos/');
}

function shouldSkipRedis(req) {
  return req.method !== 'GET' || isRandomExercise(req) || isStaticMedia(req);
}

function serializeQuery(query) {
  return Object.keys(query)
    .sort()
    .map((key) => {
      const value = query[key];
      if (Array.isArray(value)) {
        return `${key}=${[...value].map(String).sort().join(',')}`;
      }
      return `${key}=${String(value)}`;
    })
    .join('&');
}

function buildCacheKey(req) {
  const query = serializeQuery(req.query);
  return query ? `${req.method}:${requestPath(req)}?${query}` : `${req.method}:${requestPath(req)}`;
}

function applyHttpCacheHeaders(req, res) {
  if (req.method !== 'GET') {
    return;
  }

  if (isRandomExercise(req)) {
    res.set('Cache-Control', 'no-store');
    return;
  }

  if (isStaticMedia(req)) {
    return;
  }

  res.set('Cache-Control', 'public, no-cache, must-revalidate');
}

function sendCached(req, res, cached) {
  res.set('ETag', cached.etag);
  res.set('Cache-Control', 'public, no-cache, must-revalidate');
  res.set('Content-Type', cached.contentType);
  if (req.fresh) {
    return res.status(304).end();
  }
  return res.status(cached.status).send(Buffer.from(cached.body, 'base64'));
}

function storeResponse(cache, key, res, body) {
  if (!CACHEABLE_STATUSES.has(res.statusCode)) {
    return;
  }

  const etag = res.get('ETag');
  if (!etag) {
    return;
  }

  void cache.set(key, {
    status: res.statusCode,
    contentType: res.get('Content-Type') || 'application/octet-stream',
    etag,
    body: Buffer.from(body).toString('base64'),
  });
}

function isCachedPayload(value) {
  return Boolean(
    value
    && typeof value.etag === 'string'
    && typeof value.body === 'string'
    && typeof value.contentType === 'string'
    && typeof value.status === 'number',
  );
}

function interceptCacheableResponse(res, cache, key) {
  const originalJson = res.json.bind(res);
  const originalSendFile = res.sendFile.bind(res);

  res.json = (body) => {
    const result = originalJson(body);
    storeResponse(cache, key, res, JSON.stringify(body));
    return result;
  };

  res.sendFile = (filePath, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
    }

    fs.readFile(filePath, (error, data) => {
      if (error) {
        if (typeof callback === 'function') {
          callback(error);
          return;
        }
        originalSendFile(filePath, options, callback);
        return;
      }

      if (!res.get('Content-Type')) {
        res.type(path.extname(filePath) || '.html');
      }

      res.send(data);
      storeResponse(cache, key, res, data);
      if (typeof callback === 'function') {
        callback();
      }
    });
  };
}

function createCacheMiddleware(cache) {
  return async function cacheMiddleware(req, res, next) {
    applyHttpCacheHeaders(req, res);

    if (!cache.enabled || shouldSkipRedis(req)) {
      return next();
    }

    const key = buildCacheKey(req);

    try {
      const cached = await cache.get(key);
      if (isCachedPayload(cached)) {
        return sendCached(req, res, cached);
      }
    } catch {
      // Fall through to the handler on Redis errors.
    }

    interceptCacheableResponse(res, cache, key);
    return next();
  };
}

const staticCacheOptions = {
  etag: true,
  lastModified: true,
  setHeaders(res) {
    res.set('Cache-Control', 'public, max-age=86400, must-revalidate');
  },
};

module.exports = {
  createCache,
  createCacheMiddleware,
  staticCacheOptions,
};
