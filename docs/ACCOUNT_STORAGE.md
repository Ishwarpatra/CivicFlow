# Account Storage and Route Progress

## Purpose

CivicFlow supports two explicitly different persistence modes for a visitor's learning cards and route progress.

| Visitor state | Saved briefings | Route progress | Scope |
|---|---|---|---|
| Anonymous | Browser-local data | Browser-local data | The current browser profile only |
| Signed in | SQLite-backed account records | SQLite-backed account records | The authenticated CivicFlow account on the current application instance |

The interface labels these modes directly. It does not represent anonymous browser storage as a synced account record.

## Authenticated API contract

All endpoints below require an authenticated session. State-changing calls must also include the existing `CSRF-Token` request header. A missing session returns `401 Unauthorized`.

| Endpoint | Method | Contract |
|---|---|---|
| `/api/saved` | `GET` | Returns the caller's saved, hydrated global-learning briefing records. |
| `/api/saved/briefings` | `POST` | Stores one allowlisted global-learning `briefingId` for the caller. |
| `/api/saved/briefings/:briefingId` | `DELETE` | Deletes only the caller's matching saved record. |
| `/api/route-progress?place=…` | `GET` | Returns the caller's progress for the specified civic-context label. |
| `/api/route-progress` | `PUT` | Upserts the caller's selected route step and completed steps for a civic-context label. |

`POST /api/saved/briefings` accepts only IDs defined by the server-side `GLOBAL_CIVIC_BRIEFINGS` catalogue. The database stores an ID rather than arbitrary briefing text, and `GET /api/saved` hydrates the allowed metadata from that fixed catalogue. This prevents a client from injecting unreviewed stored learning content.

## Ownership and input controls

The database migration creates `saved_briefings` with a unique `(user_id, briefing_id)` pair and `route_progress` with a unique `(user_id, place_label)` pair. Every query and delete is constrained by the authenticated user's ID; records belonging to another account are not returned, changed, or deleted.

Route-progress input is validated before persistence. `selectedStep` is constrained to the three CivicFlow route steps, while completed steps are normalized, deduplicated, and bounded to the same supported steps. This keeps route state predictable even when a client retries or submits duplicate values.

## Client behavior

The account-aware controller loads saved briefings and selected-place route progress after successful sign-in and when it initializes an existing session. Saving or removing a briefing, selecting a route task, and marking a route task explored update the authenticated API. The same interactions retain a browser-local fallback for anonymous visitors.

The **Guide** is intentionally separate from **My route**, **Briefings**, and **Saved**. Selecting a route task moves the visitor to the dedicated Guide tab with the relevant civic prompt, rather than leaving a chat panel on every content view.

## Free Render persistence limitation

The current public Render demonstration uses an ephemeral filesystem. SQLite-backed account records can reset when Render replaces the instance or its filesystem. The implementation therefore provides account isolation on the active instance, but it must **not** be described as durable cross-device or long-term hosted storage until CivicFlow is moved to persistent managed storage.

## Verification coverage

The automated API suite covers unauthenticated rejection, unknown briefing IDs, user-scoped list and delete behavior, and user/place-scoped route-progress normalization. The database migration suite verifies the tables and indexes through the versioned migration lifecycle. Browser validation covers account creation in an isolated local instance, save-and-reload behavior, selected-step restore, completed-step restore, and the dedicated Guide-tab transition.
