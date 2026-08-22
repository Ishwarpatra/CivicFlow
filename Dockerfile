FROM node:20-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/var/lib/civicflow/civicflow.db \
    SESSION_DIR=/var/lib/civicflow \
    SESSION_DB=sessions.db

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/data/elections.json ./data/elections.json

RUN mkdir -p /var/lib/civicflow /app/data \
    && chown -R node:node /app /var/lib/civicflow

USER node
EXPOSE 8080
VOLUME ["/var/lib/civicflow"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]
