# CivicFlow

> **A source-aware civic route for people who need to know their next step—not be overwhelmed by links.**

CivicFlow is an Express, HTMX, and TypeScript application for guided civic questions. The integrated **Civic Atelier** interface turns three common needs—checking eligibility, finding a polling place, and understanding representation—into a calm, accessible route. It preserves a hard trust boundary: an answer is either linked to a configured civic source, shown as an explicit **context preview**, or reported as unavailable. CivicFlow does not invent an authority, an election record, or a polling result.

## What Changed in the Current Integrated Version

The repository now contains the Civic Atelier interface in the main server-rendered application, rather than as a disconnected prototype. The selected civic context travels with guide requests, and the guide changes its fallback behavior by jurisdiction. The project also includes a runnable Compose workflow, a persistent container data volume, a non-root runtime image, and CI that builds the Docker image for every push and pull request.

| Area | Current behavior | User-facing trust rule |
| --- | --- | --- |
| **Civic route** | Three clear actions: eligibility, polling place, and representative | Each action leads to guidance or a verified result, never a fabricated outcome. |
| **Indian context** | Can present connected Election Commission routes when the relevant provider is configured | Official links and live records remain conditional on source availability. |
| **Global context** | Lets a visitor keep a city or regional context in the journey | A city without a verified authority adapter is labelled **Context preview**. |
| **Guide fallback** | Uses an honest offline response when an AI or provider is unavailable | Non-Indian contexts never receive India-specific links by default. |
| **Account controls** | Server-side sign-in, profile, notification, and logout routes | State-changing requests use CSRF protection and validated input. |

## User Journey

The home screen is an editorial field guide rather than a generic dashboard. A visitor may select a civic context, choose the next route step, and ask the guide a question. The visual design is intentionally secondary to source clarity: the interface must make it obvious whether it can verify a local civic fact.

1. **Choose a context.** Select an Indian or global city/region. The selection is carried into guide requests.
2. **Choose a route step.** Open eligibility, polling-place, or representative guidance from the three-step route.
3. **Read the source state.** CivicFlow shows a connected route, a context preview, or an unavailable state before the user is asked to rely on an answer.
4. **Use the guide.** Ask a plain-language question. When no provider is available, the guide states that limit and avoids inventing a source.

See [the User Guide](docs/USER_GUIDE.md) for visible controls and [the Integration Guide](docs/INTEGRATION.md) for the HTTP and server contracts behind them.

## Product Truth States

| State | Meaning | Expected interface behavior |
| --- | --- | --- |
| **Connected civic-source route** | A relevant provider or authority route is configured and available | CivicFlow may link or summarize only the returned source-backed information. |
| **Context preview** | A chosen place has no verified local authority adapter | The location stays in the conversation, but no official record or destination is implied. |
| **Provider unavailable** | A configured source cannot be reached, is stale, or is rate-limited | The interface explains the limitation and provides a safe escalation path where one is known. |
| **Historical local data** | Bundled data exists but is not current enough to be treated as live | The record is marked stale and is not presented as a current electoral result. |

> **CivicFlow is a navigation layer, not an election authority.** Verify registration, polling place, and current election information with the relevant official authority before acting.

## Architecture

```text
Browser: HTML + HTMX + Alpine.js + Civic Atelier CSS
                         │
                         ▼
Express server: TypeScript routes, session state, validation, CSRF
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  Gemini guide      Google Civic API   Google Maps embed
  (optional)        (India scoped)     (optional)
        │
        ▼
SQLite: users, sessions, chat history, local data and sync queue
        │
        ▼
Firebase Firestore (optional synchronization target)
```

The primary application is intentionally server-rendered. HTMX keeps actions close to the server-side validation and session boundary instead of placing sensitive civic or account state in a thick browser client.

## Run Locally

### Prerequisites

| Requirement | Purpose |
| --- | --- |
| Node.js 20 LTS | Supported application and build runtime |
| Python 3, `make`, and C/C++ compiler | Builds the `better-sqlite3` native dependency |
| Optional Google/Firebase keys | Enables connected guide, map, civic, and synchronization capabilities |

```bash
git clone https://github.com/Ishwarpatra/CivicFlow.git
cd CivicFlow
cp .env.example .env
# Set SESSION_SECRET. Add only the provider keys you intend to use.
npm ci
npm run lint
npm test
npm run build
npm start
```

Open `http://localhost:8080`. For active development with reload support, run:

```bash
npm run dev
```

Run the complete verification suite before opening a pull request or image update:

```bash
npm run lint
npm run build
npm test
```

## Environment Configuration

Copy `.env.example` to `.env`; do not commit the result. `SESSION_SECRET` is required for any usable session workflow. API keys are optional because CivicFlow must surface unavailable or preview states when a provider is absent.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | Yes | Signs server-side session cookies. Use a long random value in every environment. |
| `NODE_ENV` | Production | Set to `production` outside local development. |
| `PORT` | Optional | HTTP port; the Compose workflow publishes `8080`. |
| `ALLOWED_ORIGINS` | Production | Comma-separated public HTTPS origins allowed to call the service. |
| `DB_PATH` | Production | Absolute durable path for the operational SQLite database. |
| `SESSION_DIR` | Production | Absolute durable directory for the SQLite session store. |
| `GEMINI_API_KEY` | Optional | Enables the configured AI guide. |
| `GOOGLE_CIVIC_API_KEY` | Optional | Enables the India-scoped civic provider. |
| `GOOGLE_MAPS_API_KEY` | Optional | Enables configured map embeds. |
| `FIREBASE_*` | Optional | Enables the secondary Firestore synchronization target. |

For the complete variable list and safe example values, read [`.env.example`](.env.example).

## Docker and Local Container Workflow

The repository includes a locked, multi-stage Node 20 image. Native dependencies build in the builder stage, while the final image runs as the non-root `node` user. Operational data is stored outside the image at `/var/lib/civicflow`; the image contains only the bundled election fixture, not a pre-existing user or session database.

```bash
cp .env.example .env
# Set SESSION_SECRET and any optional provider keys.
docker compose up --build -d
curl --fail http://localhost:8080/api/health
docker compose logs --follow civicflow
```

Compose uses the named `civicflow-data` volume for both application and session data. It is appropriate for a **single instance**. Do not scale the included SQLite session setup to several replicas; first move sessions to a shared backend and the operational database to managed persistent storage.

Every push and pull request to `main` also builds the Docker image in CI without publishing it. This catches Dockerfile and build-context regressions alongside linting, the TypeScript build, and the test suite.

For health checks, backups, log commands, update steps, and platform deployment requirements, read the [Operations Guide](docs/OPERATIONS.md).

## Data, Security, and Limits

### Data boundaries

The bundled election dataset is historical and deliberately marked stale. The optional Google Civic provider is India-scoped and may return partial data. Election Commission portals remain the escalation path for current Indian registration, polling-place, and election information. A global selector is a context chooser—not a worldwide civic-data directory.

### Security controls

- Server-side input validation with `zod`.
- CSRF protection for state-changing actions.
- `HttpOnly`, `SameSite=Lax`, secure-in-production session cookies.
- Content Security Policy and security headers from `helmet`.
- Rate limits for authentication and guide requests.
- Output sanitization before HTML fragments reach the browser.

### Current limitations

- Global contexts require verified per-jurisdiction authority adapters before live civic claims can be made.
- SQLite sessions and data storage are single-instance defaults, not a horizontally scalable production design.
- Provider availability, rate limits, and data freshness can limit results; the interface should show that condition instead of guessing.
- Do not treat this application as legal advice, an election authority, or a substitute for an official registration or polling-place confirmation.

## Repository Guide

| Resource | Use it for |
| --- | --- |
| [User Guide](docs/USER_GUIDE.md) | Understanding the application’s screens, route steps, and trust states. |
| [Integration Guide](docs/INTEGRATION.md) | Working with server routes, client contracts, and the Civic Atelier shell. |
| [Operations Guide](docs/OPERATIONS.md) | Running, backing up, checking, and updating a containerized deployment. |
| [Dockerfile](Dockerfile) and [compose.yaml](compose.yaml) | Reviewing the production image and the local single-instance workflow. |
| [`.env.example`](.env.example) | Configuring supported environment variables without exposing secrets. |

## Contributing

Keep source transparency intact when changing a user flow. A feature that cannot return a source-backed result must render an explicit unavailable or preview state. Before pushing changes, run `npm run lint`, `npm run build`, and `npm test`; the GitHub workflow also builds the Docker image on `main` and pull requests.
