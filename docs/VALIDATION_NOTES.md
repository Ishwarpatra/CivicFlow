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
