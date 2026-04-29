# CivicFlow — Intelligent Indian Election Navigator

**CivicFlow** is an AI-powered civic engagement platform that helps Indian citizens navigate the electoral process — from checking voter eligibility and finding their nearest polling booth to knowing their elected representatives — all in seconds and in multiple languages.

---

## Who Is It For?

- **First-time voters** overwhelmed by the 100-page ECI FAQ
- **Urban migrants** who don't know which constituency they belong to
- **Rural voters** with low digital literacy who need guided, conversational access to civic data

---

## The Problem It Solves

India's election infrastructure is fragmented across 50+ portals. A voter must navigate ECI, NVSP, Voter Helpline, and state-level ERO sites just to answer three simple questions: *Am I eligible? Where do I vote? Who represents me?*

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
        ├── Google Civic Info API     — Real representative + polling data
        ├── Google Maps Embed API     — Polling booth map rendering
        ├── Firebase Firestore        — Persistent vote storage (survives restarts)
        └── SQLite (better-sqlite3)   — Local user sessions + chat history
```

---

## Google Services Used

| Service | Purpose | Status |
|---|---|---|
| **Gemini 2.5 Flash** | Conversational AI civic navigator | ✅ Active |
| **Google Civic Information API** | Real representatives data by address | ✅ Active |
| **Google Maps Embed API** | Polling booth map with user GPS | ✅ Active |
| **Firebase Firestore** | Persistent vote records across Cloud Run restarts | ✅ Active |
| **Google Analytics 4** | Usage telemetry | ✅ Integrated |

---

## Features

- 🗳️ **Eligibility Check** — AI-guided voter eligibility Q&A (DOB, state, constituency)
- 📍 **Find My Booth** — Uses browser geolocation + Google Maps to show nearest polling stations
- 👤 **Know Your Rep** — Fetches real representatives via Google Civic Information API
- 🌐 **Multi-language** — English + Hindi UI with Gemini responding in selected locale
- 🔒 **Secure Auth** — bcrypt passwords, CSRF protection, HttpOnly cookies, helmet CSP
- 📊 **Admin Panel** — Live pino log viewer, HTMX-powered, admin-only
- 💳 **Prompt Credits** — Gamified civic engagement reward system

---

## How to Run Locally

### Prerequisites

- Node.js ≥ 18
- Google API keys (see `.env.example`)

### Setup

```bash
git clone https://github.com/your-org/civicflow
cd civicflow
cp .env.example .env
# Fill in your API keys in .env
npm install
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
```

### Coverage Report

```bash
npm run coverage
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ Yes | Gemini AI API key from [AI Studio](https://aistudio.google.com) |
| `SESSION_SECRET` | ✅ Yes | Random string for signing session cookies |
| `GOOGLE_MAPS_API_KEY` | Recommended | Enables real map embeds in Find My Booth |
| `GOOGLE_CIVIC_API_KEY` | Recommended | Enables real representative data |
| `FIREBASE_PROJECT_ID` | Recommended | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Recommended | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Recommended | Firebase private key (with `\n` escaped) |
| `ALLOWED_ORIGINS` | Production | Comma-separated CORS-allowed origins |

---

## Data Sources

- **Election Commission of India** — Constituency and candidate data (`data/elections.json`)
- **Google Civic Information API** — Live representative data (`civicinfo.googleapis.com`)
- **Google Maps** — Polling booth geolocation
- **PRS India / MyNeta** — Legislative attendance data (used in UI demos)

> *"Data sourced from Election Commission of India and Google Civic API"*

---

## Security

- `helmet()` with strict Content-Security-Policy
- CSRF protection on all state-changing routes
- Rate limiting: 15 chat requests/minute per user
- `HttpOnly`, `SameSite: lax`, `Secure` (production) session cookies
- Input validation with `zod`
- Output sanitization with `isomorphic-dompurify`

---

## Known Limitations

- Google Civic Information API is optimized for US-based addresses; Indian address lookups may return partial results depending on constituency name formatting
- Firestore integration degrades gracefully to SQLite if `FIREBASE_*` vars are unset
- Chat history is capped at 10 turns per session to limit memory usage

---

## Deployment (Cloud Run)

```bash
npm run build
# Deploy dist/ to Cloud Run — Firestore ensures votes persist across container restarts
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

## Vertical

**Civic Election Navigation** — Aligned with the AI for Social Good initiative, targeting 100M+ first-time Indian voters in the 2025-2026 election cycle.
