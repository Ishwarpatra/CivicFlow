# Validation Notes

## Local interface check — 2026-08-22

The compiled local service returned a healthy `/api/health` response. The public page rendered the Civic Atelier layout with the requested overlapping guide labels removed from the route, saved, and chat-introduction areas. The repository action appeared in the footer and linked to `https://github.com/Ishwarpatra/CivicFlow` with its external-link treatment.

The context picker opened successfully. Its input advertised worldwide search examples, while the curated starter places remained available before a search term is entered. Entering `Accra` returned dynamic Ghana locations from the service, including Accra Central and Kotoka International Airport. These appeared without any claim that CivicFlow had connected official local data. The next interaction check is to select one result and confirm that the active context keeps its **Context preview** disclosure.

Selecting a dynamic Accra result updated the active card to **Context preview** and cleared the existing guide content, as intended. An attempted unrelated guide prompt displayed a generic client error rather than the intended civic-scope explanation. The server-side unit tests cover the expected `422` response, but the browser request path needs investigation before release.

The guide submission markup was then corrected to use one explicit HTMX request rather than a native HTMX form request plus a programmatic trigger. The account-only expressions were also made null-safe. The local page reloaded successfully after this correction. Resubmitting the unrelated prompt displayed **“Only civic questions are sent to the guide.”** in the status region, confirming the browser now surfaces the intended `422` guardrail response.

The rebuilt local service reloaded with the requested labels absent, the repository action visible in the footer, and the context picker opening without overlap at desktop width. The dynamic Indian-location preview check remains to be completed.

Searching `Pune` returned the worldwide geocoder's Indian and international place matches. The selected-context disclosure is checked in the next interaction; list entries themselves remain neutral search choices and do not claim official civic-source coverage.

Selecting **Pune, India** rendered **Context preview** on the active context card and reported that local source matching is not connected. The chat panel was reset with the jurisdiction-safety message. This confirms that dynamically resolved Indian places do not inherit the curated Indian civic-source route.
