# CivicFlow Production Deployment Decision

> **Decision:** Use a Render Docker web service with one persistent disk mounted at `/var/lib/civicflow` for the first public CivicFlow release. The repository includes `render.yaml` to capture this configuration; no public service has been created yet.

## Why this runtime is required

CivicFlow is an Express application with a local SQLite application database and SQLite-backed sessions. Its `DB_PATH` and `SESSION_DIR` must therefore share a durable writable mount. A platform with only an ephemeral filesystem would discard registrations, profile changes, chat history, votes, and session state when the service restarts. Render supports Dockerfile-based services and persistent disks, making it compatible with the repository’s existing container contract. [1] [2]

Render disks are bound to a single running service instance. They cannot be shared across replicas, and a disk-backed deployment has a short service interruption while the former instance stops before the replacement starts. This is the appropriate integrity boundary for CivicFlow’s present SQLite design, but it means the service must remain at **one instance** until the database and session store are migrated to shared managed services. [1]

## Required service configuration

| Concern | Release setting | Rationale |
| --- | --- | --- |
| Runtime | Docker, using the repository `Dockerfile` | Preserves the tested Node 20 and native SQLite dependency build. [2] |
| Plan | Render Starter or another disk-capable paid web-service plan | Render persistent disks are available to paid web services. [1] |
| Health check | `GET /api/health` | Confirms the Express process can query SQLite before Render routes traffic. |
| Persistent disk | `civicflow-data` at `/var/lib/civicflow` | Persists `civicflow.db` and the SQLite session file across restarts. |
| Runtime paths | `DB_PATH=/var/lib/civicflow/civicflow.db`, `SESSION_DIR=/var/lib/civicflow`, `SESSION_DB=sessions.db` | Matches the current container and Compose configuration. |
| Session signing | Render-generated `SESSION_SECRET` | Avoids an ephemeral or repository-stored session secret. |
| Scaling | Exactly one instance | Prevents concurrent writers against the local SQLite files. [1] |

## Provider and origin configuration

The first deployment can operate with its truthful offline guide fallback if `GEMINI_API_KEY` and optional Google/Firebase credentials are absent. Those keys must only be added through Render’s encrypted environment-variable interface once the account owner provides them; they are never stored in `render.yaml` or committed to Git. `ALLOWED_ORIGINS` is not needed for the same-origin web experience. If a separate frontend or custom domain later calls CivicFlow’s API cross-origin, set it to the exact HTTPS origin or origins.

## Operational boundary

The disk contains state and should be treated as production data. Render provides encrypted persistent disks and daily snapshots, but application-level export and restore procedures remain necessary for operational resilience. [1] Before any deploy, the maintainer should record the current release commit and retain a database backup. A future high-availability deployment requires migration to a managed relational database and shared session store; simply enabling more replicas would be unsafe.

## Alternative considered

Railway also supports Docker services and persistent volumes. It remains a viable later choice, but its volume and replica limits do not improve CivicFlow’s current single-instance SQLite constraint. Render was selected because its Render Blueprint can declare the Docker service, health path, environment variables, and disk together in the repository. [3] [4]

## References

[1] [Render, “Persistent Disks.”](https://render.com/docs/disks)

[2] [Render, “Docker on Render.”](https://render.com/docs/docker)

[3] [Render, “Blueprint YAML Reference.”](https://render.com/docs/blueprint-spec)

[4] [Railway, “Volumes.”](https://docs.railway.com/reference/volumes)
