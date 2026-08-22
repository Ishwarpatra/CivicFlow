# Civic Atelier Integration Guide

## Purpose

This guide records how the Civic Atelier presentation layer is connected to the main CivicFlow HTMX and Express application. The design upgrade must never convert an uncertain civic outcome into a confident-looking claim. User-visible source state is therefore part of the functional contract, not decoration.

## Application Boundaries

| Layer | Responsibility | Integration rule |
|---|---|---|
| `public/index.html` | Civic Atelier shell, route controls, context picker, and client-side interaction state | Keep existing `fetch` and HTMX paths explicit; send a selected `place` with each guide request. |
| `public/civic-atelier.css` | Editorial tokens, responsive layout, focus styles, and dialog presentation | Preserve keyboard focus visibility and mobile reflow. |
| `src/routes/api.ts` | Validates chat input and prepares the guide request | Accept an optional 1–120 character `place`, then label it as India-backed or a global preview. |
| `src/chatHandler.ts` | Provider call and offline fallback | Pass civic context to the fallback so unavailable global contexts never receive India-specific authority links. |
| `src/uiTemplates.ts` | Server-rendered guide fallback | Render the correct source-status disclosure and escalation guidance. |

## Civic Context Contract

The guide endpoint accepts an optional `place` field. It is intentionally constrained to a short display label rather than treated as an address, identity attribute, or proof of jurisdiction.

```json
{
  "message": "How do I confirm my polling place?",
  "place": "Nairobi, Kenya"
}
```

The route classifies an `*, India` label as `india`; every other accepted label becomes `global_preview`. This is a presentation and safety boundary only. A future global adapter must use canonical geographic identifiers, per-authority source metadata, freshness timestamps, and a jurisdiction-specific escalation link before it can be promoted from preview to connected.

## User-Facing Requirements

An implementation is acceptable only when all of the following hold:

1. A person can navigate the three route steps with pointer or keyboard.
2. Changing context visibly changes both the context card and guide request.
3. An unavailable provider or unconnected place is disclosed before the user is encouraged to act.
4. Account, profile, notification, and logout mutations retain CSRF validation and input schemas.
5. The interface preserves browser zoom and meaningful focus indicators on small screens.

## Local Verification

Run the standard build and test checks after altering a route, contract, or fallback template:

```bash
npm run build
npm test
```

For a browser smoke test, start the built server with `PORT=8080 npm start`, select a non-Indian place such as Nairobi, and ask the guide a polling-place question. The fallback must state that no local authority is linked; it must not show an ECI link for that context.

## Adding a Connected Authority

Do not add a country or city to the connected-source state merely because it appears in the picker. First add an adapter with a documented authority URL, language support, data freshness policy, provider failure state, and tests for stale or unavailable records. Update `docs/USER_GUIDE.md`, this guide, and the source-status copy in the same pull request.
