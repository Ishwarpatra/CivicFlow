# CivicFlow Operations Guide

CivicFlow is an Express and HTMX application. This guide describes the supported local and container workflows for the integrated Civic Atelier interface, while preserving the product’s central trust boundary: a global place is a **context preview** until a verified local civic-data adapter is connected.

## Runtime Modes

| Mode | Command | Intended use | Data handling |
| --- | --- | --- | --- |
| Development | `npm run dev` | Local interface and route work | Local `./data` paths from `.env` |
| Production-like local | `npm run build && npm start` | Build and server verification | Set absolute `DB_PATH` and `SESSION_DIR` when `NODE_ENV=production` |
| Docker Compose | `docker compose up --build` | Repeatable single-instance deployment | Named `civicflow-data` volume at `/var/lib/civicflow` |

## Secure Container Setup

Copy the environment template and provide production secrets before starting a container. Do not commit `.env`, API keys, Firebase credentials, databases, or session files.

```bash
cp .env.example .env
# Set SESSION_SECRET to a long random value and add only the provider keys you use.
docker compose up --build -d
docker compose ps
curl --fail http://localhost:8080/api/health
```

The provided Compose file intentionally forces `NODE_ENV=production` and uses absolute database and session paths on the named `civicflow-data` volume. This ensures that application data survives a container recreation. It is suitable for one application instance only: the included SQLite session store is not a shared-session solution for horizontal scaling.

> **Production trust rule:** Do not advertise a preview context as live civic information. A location without a verified authority adapter must remain visibly labelled as preview or unavailable.

## Environment and Persistence

| Setting | Container default | Operational requirement |
| --- | --- | --- |
| `SESSION_SECRET` | None | Required; generate a long random value before deployment. |
| `DB_PATH` | `/var/lib/civicflow/civicflow.db` | Keep it on durable storage. |
| `SESSION_DIR` | `/var/lib/civicflow` | Keep it on the same durable volume for single-instance operation. |
| `ALLOWED_ORIGINS` | From `.env` | Set only your public HTTPS origins in production. |
| `PORT` | `8080` | The container publishes port `8080`; keep this value unless the platform maps the port itself. |
| `LOG_LEVEL` | `info` | Use `debug` only temporarily during troubleshooting. |

Back up the `civicflow-data` volume before destructive upgrades. The operational database and session store contain user data; do not treat an image rebuild as a backup.

## Health, Logs, and Updates

The application exposes `GET /api/health`. Docker uses this endpoint as its health check, and platform probes should use the same route.

```bash
docker compose logs --follow civicflow
docker compose exec civicflow node -e "fetch('http://127.0.0.1:8080/api/health').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1) })"
docker compose down
docker compose up --build -d
```

Before an image update, run the repository’s verification suite locally:

```bash
npm ci
npm run lint
npm run build
npm test
```

For a public deployment, terminate TLS at the hosting platform or reverse proxy, publish only HTTPS origins in `ALLOWED_ORIGINS`, and retain the persistent-volume guarantee described above.
