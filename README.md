# CivicFlow: The Intelligent Indian Election Navigator

CivicFlow is an open-source, AI-powered platform designed to provide Indian citizens with seamless access to election information. Built with Express, HTMX, and Gemini AI, it helps voters navigate the electoral process, check their eligibility, and discover their polling booths and local representatives.

## Features

-   **Interactive AI Navigator**: Ask natural language questions about voter registration, election rules, and civic duties. Powered by Google Gemini 2.5 Flash.
-   **Locate Polling Booths**: Integrated location support to help citizens find where they need to vote.
-   **Representative Insights**: Connects voters dynamically with information about their current incumbent leaders based on their specific constituency (supported by internal Mock Data for 2026 test set).
-   **Multi-Language UI**: First-class support for English and Hindi (more locales planned).
-   **Secure Verification**: End-to-end user authentication with bcrypt and session management, including voter registration handling.
-   **Admin Control Panel**: View real-time system diagnostics, chat activity, and potential failures directly from a secure admin panel.

## System Architecture

-   **Frontend**: Alpine.js for lightweight state management and HTMX for seamless, HTML-first AJAX requests without complex SPA logic. Tailwind CSS for distinctive custom styling.
-   **Backend**: Node.js + Express handling routing, APIs, request validation, and AI logic proxying.
-   **Database**: SQLite (`better-sqlite3`) powers the relational store connecting users, votes, chat sessions, notifications, constituencies, and candidates.
-   **AI Integration**: Utilizes the modern `@google/genai` TypeScript SDK to securely chat with Gemini.

## Prerequisites

- Node.js (v20+ recommended)
- A valid Gemini API Key from Google AI Studio

## Local Setup & Development

1.  **Clone down the repository** and install dependencies:
    \`\`\`bash
    npm install
    \`\`\`

2.  **Environment Variables**:
    Copy the example environment file and configure it:
    \`\`\`bash
    cp .env.example .env
    \`\`\`
    Open \`.env\` and add your \`GEMINI_API_KEY\` and configure a unique \`SESSION_SECRET\`.

3.  **Start the Database and Dev Server**:
    By default, SQLite databases (`data.db`) will be created in the root directory.
    \`\`\`bash
    npm run dev
    \`\`\`
    The application will be accessible at \`http://localhost:3000\`.

## Building for Production

When preparing a deploy for environments like Google Cloud Run:

\`\`\`bash
npm run build
npm run start
\`\`\`
*(Ensure your environment is configured with `NODE_ENV=production` for cookie sec features)*

**⚠️ Important Data Persistence Warning:**
This project uses SQLite (`better-sqlite3`) writing to `data.db` on the local filesystem. In ephemeral environments like Cloud Run, **the local filesystem is wiped on every deployment and container restart**.
To deploy this for production without losing user accounts, votes, and chat history, you MUST either:
1. Mount a persistent network volume (e.g., Google Cloud Storage FUSE or Filestore) to the container.
2. OR migrate the database driver to a managed DB service (like Cloud SQL, PlanetScale, or PostgreSQL).

## Test Credentials

For evaluation purposes, the database bootstrapping includes a default set of accounts:
-   **Admin User**: `admin@example.com` / `admin_secure_password`
-   **Generic Voter**: `voter@example.com` / `password123`

## Data Pipeline Mocking (2026 General Elections)

Currently, the DB boots with a preliminary schema for constituencies and candidates, initializing mock data for `Bengaluru South` and `New Delhi`.
