# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies (including devDeps for tsc + tailwind)
COPY package*.json ./
RUN npm ci

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
COPY server.ts ./
COPY data/ ./data/
COPY public/ ./public/

# Build: Tailwind CSS → copy htmx/alpine → TypeScript compile
RUN npm run build

# ── Stage 2: Production image ───────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output and static assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data

# SQLite DB lives on a mounted volume in Cloud Run / Docker Compose
VOLUME ["/app/data-vol"]
ENV DB_PATH=/app/data-vol/data.db


# Graceful shutdown via SIGTERM is handled in server.ts
CMD ["node", "dist/server.js"]
