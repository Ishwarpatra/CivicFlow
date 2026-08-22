# CivicFlow Intelligent Indian Election Navigator

**CivicFlow** is a source-aware civic guidance application. Its **Civic Atelier** interface turns eligibility, polling-place, and representative questions into a clear three-stop route, while explicitly separating verified records from contextual guidance.

---

## Who Is It For?

- **First-time voters** who need a calm explanation of the next civic step.
- **Urban migrants** who need to understand what location or constituency information is relevant.
- **Voters with low digital literacy** who benefit from a guided, conversational path to authoritative information.
- **People exploring another civic context** who must not be shown invented local records or links.

---

## The Problem It Solves

India's election infrastructure is fragmented across many official portals. A voter may need to navigate ECI, NVSP, Voter Helpline, and state-level ERO services to answer three simple questions: *Am I eligible? Where do I vote? Who represents me?*

CivicFlow unifies this into a single conversational interface powered by Gemini AI, Google Civic Information API, and Google Maps.

---

## Architecture

```
Browser (HTMX + Alpine.js)
        │
        ▼
Express.js Server (TypeScript)
        │
        ├── Gemini 2.5 Flash API      — AI conversation engine
        ├── Google Civic Info API     — Optional India-scoped representative + polling lookup
        ├── Google Maps Embed API     — Polling booth map rendering
        ├── Firebase Firestore        — Optional cloud vote synchronization
        └── SQLite (better-sqlite3)   — Local users, sessions, chat history, and sync queue
```

---

## Approach & Logic

CivicFlow is built on the principle of **"Single Point of Truth"** unification. 

1.  **Guided Navigation**: Instead of presenting a menu of 50 links, the system uses a **Guided Chat Flow**. It proactively asks for the user's State and Constituency only when needed for specific actions (like finding a representative), storing these in the session for future context.
2.  **Hybrid Persistence**: Votes are written to SQLite first and synchronized to Firestore when configured. A local sync queue records pending cloud synchronization instead of reporting a failed cloud write as fully synchronized. Chat history, credits, users, and sessions remain in SQLite.
3.  **Graceful Degeneracy**: If Gemini AI is unavailable, CivicFlow returns a transparent offline answer. Indian contexts may receive connected ECI routes; all other contexts receive an explicit "context preview" state and no fabricated authority link.
4.  **Security-First HTMX**: We use HTMX for a "Hypermedia" approach, which allows us to keep all business logic and state (including Auth and Session) on the server, significantly reducing the attack surface compared to a thick-client SPA.

## User Journey and Trust States

The primary interface is intentionally a three-stop route: **Check eligibility**, **Find polling place**, and **Know your representative**. Each action opens a guided response rather than claiming a result that CivicFlow cannot verify.

| Context state | What the user sees | What CivicFlow may do |
|---|---|---|
| **Indian civic-source route** | A connected India context, such as Bengaluru or Mumbai | Offer ECI-oriented routes when the relevant source or provider is configured. |
| **Context preview** | A selected global city without a linked local authority | Preserve the location in the guide and state that local source matching is not connected. |
| **Provider unavailable** | A clear unavailable state | Explain the limitation and direct the user to the appropriate official authority rather than guessing. |

See [the user guide](docs/USER_GUIDE.md) for the visible interaction model and [the integration guide](docs/INTEGRATION.md) for the server-side contracts.

---

## Google Services Used

| Service | Purpose | Integration Details |
|---|---|---|---|
| **Gemini 2.5 Flash** | Conversational AI civic navigator | Uses `system_instruction` for civic context and `google_search` tool for real-time verification. |
| **Google Civic Information API** | Optional India-scoped representative and polling lookup | Direct integration via `civicinfo.googleapis.com`; provider status is surfaced as live, unavailable, rate-limited, or misconfigured. |
| **Google Maps Embed API** | Polling booth map with user GPS | Dynamic map rendering based on browser geolocation to guide users to their nearest booth. |
| **Firebase Firestore** | Optional vote synchronization | Cloud synchronization is tracked separately; failed cloud writes remain visible as pending local records. |
| **Google Analytics 4** | Usage telemetry | Tracks user engagement metrics to optimize civic information delivery. |

---

## Features

- **Civic Atelier route** — An editorial three-stop interface that keeps a user's next action visible.
- **Context-aware guide** — The guide sends the selected city or region to the server and handles unavailable sources truthfully.
- **Eligibility, polling, and representative flows** — Existing server-rendered actions remain available through accessible buttons and dialogs.
- **Secure account workflows** — Validated sign-in, profile, notification, and logout contracts with CSRF protection and HttpOnly cookies.
- **Source-status disclosure** — Connected, preview, and unavailable data states are visible before a user relies on a civic outcome.
- **Accessible HTMX interface** — Keyboard-reachable controls, skip navigation, semantic regions, and responsive layouts.

---

## How to Run Locally

### Prerequisites

- Node.js 20 LTS (recommended; Node.js ≥ 18 is supported)
- A native build toolchain for `better-sqlite3`: Python 3, `make`, and a C/C++ compiler
- Google API keys (see `.env.example`)

### Setup

```bash
git clone https://github.com/Ishwarpatra/CivicFlow.git
cd civicflow
cp .env.example .env
# Fill in your API keys in .env
npm ci
npm run lint
npm test
npm run build
npm start
```

> **Note:** Use `.env`, not `.env.local`. The server loads with `dotenv.config()`.

### Development (hot reload)

```bash
npm run dev
```

### Run Tests

```bash
npm test
# For clean-install verification, remove node_modules and repeat: npm ci && npm run lint && npm test
```

### Coverage Report

```bash
npm run coverage
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Required | Gemini AI API key from [AI Studio](https://aistudio.google.com) |
| `SESSION_SECRET` | Required | Random string for signing session cookies |
| `GOOGLE_MAPS_API_KEY` | Recommended | Enables real map embeds in Find My Booth |
| `GOOGLE_CIVIC_API_KEY` | Recommended | Enables real representative data |
| `FIREBASE_PROJECT_ID` | Recommended | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Recommended | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Recommended | Firebase private key (with `\n` escaped) |
| `ALLOWED_ORIGINS` | Production | Comma-separated CORS-allowed origins |
| `ADMIN_EMAILS` | Recommended | Comma-separated allowlist of pre-approved admin email addresses |
| `GOOGLE_CIVIC_ELECTION_ID` | Recommended | Election ID used by the optional Civic polling lookup |
| `DB_PATH` | Recommended | Absolute persistent SQLite path in production |
| `SESSION_DIR` | Recommended | Absolute persistent directory for the SQLite session store |
| `SESSION_DB` | Optional | Session database filename within `SESSION_DIR` |

---

## Data Sources

- **Election Commission of India** — Local constituency and candidate data (`data/elections.json`), with explicit freshness metadata. Expired records are shown as stale and are not presented as current.
- **Google Civic Information API** — Optional India-scoped representative and polling lookup (`civicinfo.googleapis.com`); provider state is classified as live, unavailable, rate-limited, or misconfigured. It is not treated as the canonical election-results source.
- **Election Commission of India official portals** — Canonical escalation path for current results, voter registration, and polling-place confirmation when local or provider data is stale or unavailable.
- **Google Maps** — Polling booth geolocation

> *"Data sourced from Election Commission of India and Google Civic API"*

---

## Security

- `helmet()` with strict Content-Security-Policy
- CSRF protection on all state-changing routes
- Rate limiting: 100 chat requests per 15-minute window per IP, plus 20 authentication attempts per 15-minute window
- `HttpOnly`, `SameSite: lax`, `Secure` (production) session cookies
- Input validation with `zod`
- Output sanitization with `isomorphic-dompurify`

---

## Known Limitations

- The optional Google Civic integration accepts only India-scoped addresses and may return partial results; official Election Commission portals remain the authority for current election information.
- The global city selector is a **context chooser**, not a worldwide civic-data directory. A non-Indian location is labelled as a preview until a verified local authority adapter is connected.
- Firestore integration degrades gracefully to SQLite if `FIREBASE_*` vars are unset
- Chat history is capped at 20 messages per session to limit memory usage.
- The bundled 2024 dataset is historical and intentionally marked stale; live election results require an official, refreshed source.
- Firestore vote failures are recorded as pending synchronization instead of being reported as fully synchronized.

---

## Deployment (Cloud Run)

The included `Dockerfile` performs a locked install, builds `better-sqlite3` with native build tools, prunes development dependencies, copies runtime artifacts, and exposes an HTTP health check. Use persistent absolute `DB_PATH` and `SESSION_DIR` values, or an external shared session store for multi-instance deployments; the default local SQLite session store is not a shared production session backend.

```bash
docker build --pull -t civicflow .
docker run --rm -p 8080:8080 --env-file .env civicflow
```

---

## Built With

- [Express.js](https://expressjs.com/) + TypeScript
- [HTMX](https://htmx.org/) + [Alpine.js](https://alpinejs.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Gemini API](https://ai.google.dev/) via `@google/genai`
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Google Civic Information API](https://developers.google.com/civic-information)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [pino](https://getpino.io/) structured logging
- [vitest](https://vitest.dev/) + [supertest](https://github.com/ladjs/supertest)

---

## Vertical & Social Impact

**Civic Election Navigation** This project is a direct response to the **AI for Social Good** initiative, specifically targeting the democratic challenges of the 2025-2026 Indian election cycle:

- **Empowering 100M+ First-time Voters**: By translating complex ECI documentation into a friendly conversational interface, we lower the barrier to democratic participation.
- **Bridging the Digital & Linguistic Divide**: With native support for Hindi and English, and a mobile-first HTMX architecture, we ensure civic data is accessible to users with limited data plans and diverse linguistic backgrounds.
- **Combatting Electoral Misinformation**: By serving as a "Single Point of Truth" that pulls directly from verified Google Civic and ECI sources, we provide a trusted alternative to unverified social media information.
- **Radical Accessibility**: Built with strict adherence to WCAG 2.1 standards, including semantic HTML, ARIA landmarks, and high-contrast Neobrutalist design, ensuring that elderly and disabled voters are not left behind.
