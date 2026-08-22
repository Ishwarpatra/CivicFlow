# CivicFlow Free Demonstration Deployment Decision

> **Decision:** Deploy CivicFlow as a free Render Docker **demonstration**, not a durable production service. The repository `render.yaml` uses Render’s Free plan and deliberately does not attach a disk.

## Demonstration boundary

Render’s Free web services are suitable for testing, hobby projects, and previews, but Render explicitly advises against using them for production applications. A Free service has an ephemeral filesystem, so local SQLite databases and session files are lost when the service restarts, redeploys, or spins down after idle time. [1]

That means CivicFlow’s account registrations, authentication sessions, profile changes, chat history, local vote records, and other SQLite-backed activity are **temporary demonstration data**. Visitors must not rely on this public URL to retain personal data, and the project must not claim durable accounts, records, or audit history.

## Free deployment configuration

| Concern | Demonstration setting | User-visible consequence |
| --- | --- | --- |
| Runtime | Docker, using the repository `Dockerfile` | Preserves the tested Node runtime and native SQLite dependency build. [2] |
| Render plan | `free` | No paid instance or persistent disk is created. [1] |
| Health check | `GET /api/health` | Render can test whether Express can query the temporary SQLite database. |
| Storage paths | `/var/lib/civicflow/civicflow.db` and `/var/lib/civicflow` | Data works while an instance is running but can reset after idle spin-down, restart, or redeploy. [1] |
| Session secret | Render-generated `SESSION_SECRET` | Session cookies remain signed for the life of the service configuration, but sessions themselves are temporary. |
| Availability | Free service may spin down after 15 minutes without inbound traffic | The next visit can experience an approximately one-minute wake-up delay. [1] |

## Provider and origin configuration

The deployment can run without Gemini, Google, or Firebase credentials because CivicFlow already exposes a truthful offline guide fallback. Those provider features remain unavailable until the project owner supplies the appropriate credentials through Render’s encrypted environment-variable interface; no secret is stored in Git. The same-origin application does not require `ALLOWED_ORIGINS`. A future separate frontend or cross-origin client must use its exact HTTPS origin in that setting.

## Upgrade path

To make CivicFlow suitable for durable public use, replace local SQLite/session storage with managed shared services and use a persistent or production-grade web service. Attaching a Render persistent disk requires a paid web service; a Free Render Postgres database is also temporary and expires after 30 days, so it is not a durable production substitute. [1]

## References

[1] [Render, “Deploy for Free.”](https://render.com/docs/free)

[2] [Render, “Docker on Render.”](https://render.com/docs/docker)
