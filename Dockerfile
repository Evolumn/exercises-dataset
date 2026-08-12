FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3030 \
    DB_PATH=/data/exercises.db \
    DATA_PATH=/app/data/exercises.json

RUN mkdir -p /data /app/data \
  && chown node:node /data

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node servidor ./servidor
COPY --chown=node:node data/exercises.json data/taxonomy.json data/exercises.schema.json ./data/
COPY --chown=node:node images ./images
COPY --chown=node:node videos ./videos
COPY --chown=node:node index.html docs.html openapi.yaml ./

USER node
EXPOSE 3030

CMD ["node", "servidor/index.js"]
