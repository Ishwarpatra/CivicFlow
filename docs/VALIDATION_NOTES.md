# Validation Notes

## Local interface check — 2026-08-22

The compiled local service returned a healthy `/api/health` response. The public page rendered the Civic Atelier layout with the requested overlapping guide labels removed from the route, saved, and chat-introduction areas. The repository action appeared in the footer and linked to `https://github.com/Ishwarpatra/CivicFlow` with its external-link treatment.

The context picker opened successfully. Its input advertised worldwide search examples, while the curated starter places remained available before a search term is entered. Entering `Accra` returned dynamic Ghana locations from the service, including Accra Central and Kotoka International Airport. These appeared without any claim that CivicFlow had connected official local data. The next interaction check is to select one result and confirm that the active context keeps its **Context preview** disclosure.

Selecting a dynamic Accra result updated the active card to **Context preview** and cleared the existing guide content, as intended. An attempted unrelated guide prompt displayed a generic client error rather than the intended civic-scope explanation. The server-side unit tests cover the expected `422` response, but the browser request path needs investigation before release.

The guide submission markup was then corrected to use one explicit HTMX request rather than a native HTMX form request plus a programmatic trigger. The account-only expressions were also made null-safe. The local page reloaded successfully after this correction. Resubmitting the unrelated prompt displayed **“Only civic questions are sent to the guide.”** in the status region, confirming the browser now surfaces the intended `422` guardrail response.

The rebuilt local service reloaded with the requested labels absent, the repository action visible in the footer, and the context picker opening without overlap at desktop width. The dynamic Indian-location preview check remains to be completed.

Searching `Pune` returned the worldwide geocoder's Indian and international place matches. The selected-context disclosure is checked in the next interaction; list entries themselves remain neutral search choices and do not claim official civic-source coverage.

Selecting **Pune, India** rendered **Context preview** on the active context card and reported that local source matching is not connected. The chat panel was reset with the jurisdiction-safety message. This confirms that dynamically resolved Indian places do not inherit the curated Indian civic-source route.

### GitHub publication check

On 22 August 2026, the pushed main-branch files were viewed directly on GitHub: [global place-search documentation](https://github.com/Ishwarpatra/CivicFlow/blob/main/docs/PLACE_SEARCH.md) and [API enforcement](https://github.com/Ishwarpatra/CivicFlow/blob/main/src/routes/api.ts). GitHub showed the expected `docs(places): document global search boundaries` and `feat(api): enforce civic scope and guide allowances` commits under **Ishwarpatra**.

### Mobile-width layout check

A local Chromium capture at 375 px wide preserved the condensed navigation, readable three-stop route rail, hero call to action, context card, route controls, and civic guide without horizontal clipping or overlap. The full mobile-width capture also showed the guide input and action within the viewport width. Footer verification continues separately because this tall capture did not include the page's lower footer boundary.

The local browser's first jump-to-end attempt retained a portion of the hero and guide in view, so the footer action is being verified by a normal lower-page scroll rather than treating the tall viewport capture as a reliable document-height measurement.

The rendered local DOM exposes the footer's **VIEW THE CIVICFLOW REPOSITORY** link and its HTTPS repository destination. The footer's responsive rule switches the action group to left alignment and wrapping at 650 px; this is the mobile behavior covered by the stylesheet review. The browser's reported scroll geometry was inconclusive, so the footer's lower-boundary placement should be rechecked after deployment in a physical mobile browser.

## Public release verification — 22 August 2026

Render deployment `dep-da4t7mbncjis73f2h3d0` reached **Live** from the latest `main` commit, `e04a3fe`. The public health endpoint returned `200 OK`, and `GET /api/places?query=Accra` returned normalized Ghana results marked `global_preview`.

In the deployed Chromium UI, the revised route, guide, and footer controls rendered without the removed overlapping section labels. The public footer exposed the visible **VIEW THE CIVICFLOW REPOSITORY** link. Searching for **Accra** produced global Ghana results; selecting one changed the active location to **Context preview** and stated that local source matching was not connected.

The public guardrail returned the civic-only response for `Write a pasta recipe`, and the rendered status announced **“Only civic questions are sent to the guide.”** A valid Accra voter-registration question completed through NIM, stated that no connected official source existed for the selected preview context, and contained no India-specific authority guidance. The local mobile-width evidence remains the responsive check for this release; physical-device and non-Chromium validation remain outstanding.

## Local global-learning interaction check — 23 August 2026

The rebuilt local service returned four country-agnostic civic-learning cards from `GET /api/briefings`. A protected 501-character guide request returned `400` with **“Guide messages are limited to 500 characters”**. A deterministic headless-browser check selected **Briefings**, saved one learning card, selected **Saved**, then marked the current route stop explored. It observed four briefing cards, one persisted browser-local saved item, and the route summary **“Check eligibility · 1 of 3 stops explored.”**

Focused 780 px captures then showed the populated **Briefings** panel with its country-agnostic source actions and the populated **Saved** panel with a clear browser-local persistence disclosure and removal control. A deliberately delayed briefing request rendered two structured shimmer skeleton cards before the four cards arrived. Transient save and route-confirmation feedback now self-dismisses after 4.2 seconds, preventing it from persistently obscuring tab content. The connected browser could not access the sandbox-local service, so this local interaction evidence uses an isolated Chromium session.

## Global civic-learning public release — 23 August 2026

Render deployment `dep-da58s03m8hqs73brsc90` published commit `97ecb08` and reached **Live** after its internal health check. The public `/api/health` endpoint returned `200 OK`, and `/api/briefings` returned four `global_learning` cards with the explicit country-agnostic notice and `messageLimit: 500`.

In the deployed Chromium interface, **BRIEFINGS** opened the global civic-learning panel. Its cards stated that they are not universal local instructions and linked to OECD, United Nations DESA, and World Bank source material. Saving “Read the decision” displayed **“Read the decision was saved in this browser.”** This validates browser-local persistence only; it does not claim durable or cross-device storage.

Opening **SAVED** then showed the saved learning card, a visible **REMOVE** action, and the explicit disclosure that saved routes and cards stay on the current device and are not represented as a synced account record on this stateless demonstration.

Opening **MY ROUTE** restored the route desk. The first attempt to mark progress without a selected stop returned the clear feedback **“Choose a route stop before marking it explored.”** Selecting **Check eligibility** and marking it explored updated the public summary to **“Check eligibility · 1 of 3 stops explored”** and displayed the browser-local confirmation. This confirms that route state is interactive while preserving the same local-only storage disclosure.

A fresh anonymous public session then obtained its CSRF token from `/api/csrf` and submitted a 501-character civic guide message. The deployed `/api/chat` route rejected it with `400` and the 500-character limit response before guide processing. This confirms that the browser’s visible remaining-character counter is backed by the server-side boundary rather than only a client-side convention.

## Local authenticated storage and dedicated Guide check — 23 August 2026

The complete local regression suite passed: **9 test files and 61 tests**. This includes migration lifecycle coverage for the `saved_briefings` and `route_progress` tables, authenticated API coverage for unauthorized access, allowlisted briefing IDs, owner-scoped list/delete behavior, and per-user/per-place route-progress normalization. The production TypeScript build also completed successfully, and `git diff --check` reported no whitespace errors.

In an isolated local instance, a disposable account was created without using a live public account. The browser saved **Read the decision** to that account, reloaded the application, and then displayed the card in **SAVED** with the account-storage disclosure. Selecting **Check eligibility** moved the visitor into the dedicated **GUIDE** tab with the relevant prompt. After reloading, the route summary restored the selected step; after marking it explored and reloading again, it restored **“Check eligibility · 1 of 3 stops explored.”**

A headless 375×812 local viewport check found no horizontal overflow (`scrollWidth: 375`, `viewportWidth: 375`). The Guide panel's computed display was `none` on **MY ROUTE**, **BRIEFINGS**, and **SAVED**, and `block` on **GUIDE**. The supporting capture is retained only as an untracked local verification artifact. This evidence is local only: the public Render service has not yet been redeployed or revalidated for this feature.
