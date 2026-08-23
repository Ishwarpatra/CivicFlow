# Neon Free PostgreSQL Storage Guide

## Purpose

This guide describes CivicFlow’s **optional no-paid-services PostgreSQL path**. When the encrypted `POSTGRES_DATABASE_URL` environment variable contains a PostgreSQL connection URL, the application runs its PostgreSQL migrations at startup and stores account records plus Express sessions in Neon rather than on Render’s local filesystem.

> **The cutover is intentionally not automatic.** Do not set the production connection URL until the code has passed its checks, a SQLite snapshot has been protected, and the owner has approved the production migration window.

## What changes and what does not

| Area | Without Neon URL | With Neon URL |
|---|---|---|
| Account records | SQLite on the active Render instance | PostgreSQL in Neon |
| Saved briefings and route progress | May reset with the Render filesystem | Survive a normal Render instance replacement |
| Express sessions | Local SQLite `sessions.db` | PostgreSQL `user_sessions` table |
| Anonymous saved items and route progress | Browser-local | Browser-local; this does not change |
| Existing login cookie | Valid only until cutover | Users must sign in again after cutover |

## Free-tier boundaries

Neon’s Free plan currently provides **0.5 GB storage**, **100 compute-unit hours per project per month**, one manual snapshot, and a six-hour history window. Free compute scales to zero after five minutes of inactivity, so the first database-backed request after an idle period may take longer. These limits prevent the route from being represented as a guaranteed backup or zero-downtime database service. [1]

The connection must use Neon’s secure PostgreSQL URL. The application accepts `postgres://` or `postgresql://` only and configures a small TLS-enabled connection pool. The secret belongs in Render’s encrypted environment settings, never in Git, browser code, application logs, or a public issue. [2]

## Controlled cutover

First create a Neon Free project and database in the account owner’s Neon dashboard. Obtain its pooled connection URL. In Render, add it as the encrypted variable `POSTGRES_DATABASE_URL`; do not add it to a committed `.env` file. Keep `SESSION_SECRET` unchanged so cookie signing remains consistent, while understanding that stored session data is deliberately not copied.

Before enabling that environment variable, make an offline copy of the current SQLite file. If current Render-local records cannot be exported reliably, decide explicitly to begin the Neon database empty rather than assume an unseen ephemeral file has been preserved. The importer rejects a non-empty target for user-owned tables to avoid silently merging old records into a live database.

```bash
# Run only from a trusted machine with a protected SQLite snapshot.
# Do not paste the Neon URL into shell history in a shared environment.
export SQLITE_IMPORT_PATH=/absolute/path/to/civicflow.db
export POSTGRES_DATABASE_URL='postgresql://…'
npm ci
npm run import:sqlite-to-postgres
```

The guarded importer migrates users, election records, votes, notifications, chat history, guide-usage counters, saved briefings, route progress, and vote-sync queue entries. It intentionally **does not** migrate Express sessions. After a successful import, compare table counts, run the application against a non-production Neon database, and confirm registration, login, logout, saved briefings, route progress, CSRF, and guide quotas.

## Recovery practice

Before the production cutover, create a protected copy of the SQLite source. After import, use Neon’s available manual snapshot and retain an encrypted logical export outside Render. Test that a restored copy can start CivicFlow and passes `/api/health`; a snapshot that has never been restored is not a verified recovery mechanism. Free Neon recovery features remain limited by its plan allowances. [1]

## References

[1]: https://neon.com/docs/introduction/plans "Neon — Plans"
[2]: https://neon.com/docs/connect/connect-from-any-app "Neon — Connect from Any Application"
