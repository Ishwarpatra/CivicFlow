# CivicFlow — Intelligent Indian Election Navigator

CivicFlow is an AI-powered civic assistant that helps Indian voters check voting eligibility, locate polling booths, and understand their elected representatives — all in a single conversational interface. It runs as a server-rendered HTMX app backed by Gemini 2.5 Flash with grounding via Google Search.

---

## What the app does

| Feature | Status |
|---|---|
| Chat with Gemini about eligibility, booths, forms | ✅ Live (requires API key) |
| Demo mode (offline responses) | ✅ No key needed |
| Know Your Representative (2024 ECI data) | ✅ Static Demo badge shown |
| 2024 Lok Sabha results lookup | ✅ 5 states, real ECI data |
| GPS-based booth locator | ✅ Opens Google Maps |
| User accounts (register / login) | ✅ bcrypt + SQLite |
| Persistent settings (EPIC, state, constituency, language) | ✅ Saved to DB |
| Hindi / English UI | ✅ Full i18n of shell + chat |
| Web Share API | ✅ Share button in header |
| Rate limiting (per session) | ✅ 15 req/min |
| Admin log viewer | ✅ Role-gated |

---

## Running locally

### Prerequisites

- Node.js 22+
- A Gemini API key from [aistudio.google.com](https://aistudio.google.com)

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Create your env file
cp .env.example .env
# Then edit .env and fill in values (see below)

# 3. Start the dev server (Tailwind + tsx watch)
npm run dev
```

The app will be available at **http://localhost:3000**.

---

## Required environment variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Your Gemini API key from AI Studio. Use the placeholder `MY_GEMINI_API_KEY` to run in Demo Mode. |
| `SESSION_SECRET` | **Yes in production** | A long random string for signing session cookies. Any value works in dev. |
| `NODE_ENV` | No | Set to `production` to enable secure cookies and enforce `SESSION_SECRET`. |

Copy `.env.example` to `.env` and fill in values before starting.

---

## Dev credentials

Two seed accounts are created automatically on first run:

| Email | Password | Role |
|---|---|---|
| `voter@example.com` | `password123` | voter |
| `admin@example.com` | `admin_secure_password` | admin |

The admin account can access the **System Logs** panel from the user menu.

> **Change these passwords before deploying to any public URL.**

---

## Election data coverage

The app ships a static seed file at `data/elections.json` sourced from the **2024 Lok Sabha General Election** results (ECI public data). Coverage:

| State | Constituencies |
|---|---|
| Karnataka | Bengaluru South, Bengaluru North, Mysuru-Kodagu |
| Delhi | New Delhi, East Delhi, North West Delhi |
| Tamil Nadu | Chennai North, Chennai South, Coimbatore |
| Maharashtra | Mumbai North, Pune, Nashik |
| West Bengal | Kolkata North, Kolkata South, Jadavpur |

Query this data directly: `GET /api/constituency?state=Karnataka` or `GET /api/constituency?state=Delhi&name=New+Delhi`.

The AI chat references this data via context injection on every request — it does **not** hallucinate candidate names or results for covered constituencies.

---

## Production deployment (Docker)

```bash
# Build the image
docker build -t civicflow .

# Run with a persistent DB volume
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=your_key \
  -e SESSION_SECRET=your_secret \
  -e NODE_ENV=production \
  -v civicflow-data:/app/data-vol \
  civicflow
```

> ⚠️ **Cloud Run / ephemeral environments**: SQLite is written to `/app/data-vol`. Without a persistent volume mount, all user data and sessions are lost on container restart. For production use, migrate to [Turso](https://turso.tech) (SQLite-compatible, free tier) or Cloud SQL.

---

## Known limitations

- **Static election data only** — The app does not call any live ECI API. Data is frozen at the 2024 Lok Sabha results for 5 states. State assembly (Vidhan Sabha) elections are not covered.
- **AI responses** — The Gemini model is grounded via Google Search for latest ECI rules, but it can still produce inaccurate booth addresses or schedule details. Always verify with the official [ECI Voter Portal](https://voters.eci.gov.in/).
- **No push notifications** — The notification bell UI is present, but there is no background job, email, or Web Push pipeline. Notifications must be inserted directly into the `notifications` table.
- **No OAuth** — Authentication is email + password only. Social login is out of scope.
- **SQLite not suitable for multi-replica deployments** — Use Turso or Postgres if running more than one container replica.

---

## Project structure

```
server.ts              # Main Express app, DB init, routes for auth/settings/admin
src/
  routes/api.ts        # /api/chat, /api/vote, /api/auth/logout
  chatHandler.ts       # Gemini call, history management, offline fallbacks
  aiService.ts         # GoogleGenAI client factory
  uiTemplates.ts       # Server-rendered HTML fragments (chat bubbles, rep card)
  constants.ts         # System prompt, command constants
  input.css            # Tailwind source + @apply components
  utils/validateEnv.ts # Env var validation
public/
  index.html           # Full SPA shell (Alpine.js + HTMX)
  style.css            # Compiled Tailwind output (do not edit)
data/
  elections.json       # Static 2024 Lok Sabha seed data
Dockerfile             # Two-stage production build
```
