# CivicFlow Live-Domain UI Audit

**Audit date:** 22 August 2026  
**Public URL:** <https://civicflow-oxyg.onrender.com/>  
**Scope:** Functional controls, responsiveness, accessibility signals, visual-content quality, and practical performance on the public free demonstration.

## Test Environment and Limits

The audit uses the public HTTPS domain in Chromium through the connected browser and command-line HTTP checks from the sandbox. Desktop browser evidence represents Chromium only. It does not substitute for hands-on testing in Safari, Edge, assistive technologies, or physical devices. The service is a free stateless host, so cold starts can affect first-load timing.

## Functional Evidence

| Check | Method | Result | Status |
| --- | --- | --- | --- |
| Homepage availability | Public HTTPS request | `200 OK` | Pass |
| Health endpoint | `GET /api/health` | `200 OK` | Pass |
| Eligibility CTA | Public UI click | Scrolls to the guide, seeds the relevant question, and keeps the form usable | Pass |
| Guide form | Submit neutral eligibility request | Displays loading state then a substantive NIM response with civic-verification guidance | Pass |
| ECI link target | Followed HTTP request | `200 OK` | Pass |
| NVSP link target | Followed HTTP request from sandbox | TLS certificate verification failed in this environment | Needs browser corroboration |
| Voter Helpline target | Followed HTTP request from sandbox | TLS connection could not be established in this environment | Needs browser corroboration |

> The two external-link observations are not CivicFlow `404` responses. They are recorded for follow-up because a user-facing civic guide should avoid presenting an inaccessible authority link as a verified route.

## Test Log

The published guide successfully answered the neutral request, “Help me check my voting eligibility.” Its interface transitioned from **ASK GUIDE** to **CHECKING…** and then rendered a response with explicit election-authority reminders. No personal data, registration, or account submission was used during this test.

The primary **BEGIN WITH ELIGIBILITY** call to action also moved the viewport to the guide and prefilled the related neutral question, leaving the input editable before submission.

The public **SIGN IN** control opened a modal dialog with visible **EMAIL** and **PASSWORD** labels, an explicit close control, and a separate account-creation entry. The audit did not submit credentials or create an account.

The header navigation produced useful, non-deceptive unauthenticated states: **BRIEFINGS** explains that no live briefing is published without a dated, jurisdictional source match, and **SAVED** explains that a profile is required to save a route while the next step remains usable in the current session.

The civic-context selector opened with searchable starter locations and successfully changed the public context from Bengaluru to **Nairobi, Kenya**. The page displayed **Context preview** and the explicit notice, “Local source matching is not connected for this place yet.” The prior Bengaluru answer remained visible in the chat history after the context changed; this is understandable as history, but it needs stronger visual context attribution so it cannot be mistaken for Nairobi guidance.

Submitting “How can I check civic information in Nairobi?” produced a useful Kenyan-resource response, including `iebc.or.ke`, `knchr.org`, and `interior.go.ke`. However, its wording still says “Nairobi is in Kenya, not India” and ends by offering help with Indian election topics. This is a **high-priority contextual-copy defect**: the selected context is already Nairobi, and the text weakens the otherwise correct **Context preview** disclosure.

## Link and response observation

On 22 August 2026, `https://civicflow-oxyg.onrender.com/` and `/api/health` returned HTTP 200. The observed initial public response times were 4.92 s and 2.89 s respectively, consistent with a cold or waking free-tier instance rather than a front-end rendering failure. `eci.gov.in` and `knchr.org` returned HTTP 200. Certificate validation failed from the audit environment for `nvsp.in`, `iebc.or.ke`, and `interior.go.ke`; `voterhelpline.in` failed its TLS connection. These third-party endpoint problems do not make CivicFlow unavailable, but they mean the guide must continue to describe external links as verification resources rather than guarantee their availability.

## Responsive evidence

Headless Chromium captures at 375×812 (mobile portrait) and 768×1024 (tablet portrait) showed no horizontal clipping in the first-screen composition. At 375 px, the navigation appropriately condenses to the brand and **SIGN IN** while the three civic-route stops remain readable and vertically proportioned. At 768 px, the route strip, editorial hero, context card, and action button remain legible and distinct. These checks do not substitute for physical-device testing or Safari/Edge rendering, which remain manual follow-ups.

The 812×375 mobile-landscape capture keeps the editorial hero and all three route labels visible without horizontal overflow. The 1440×900 desktop capture preserves the intended asymmetric composition, hierarchy, and visible navigation spacing. Both screenshots show readable text against their rendered backgrounds. The first-screen screenshots did not expose layout overlap or clipped primary controls.

## Keyboard and accessibility evidence

From a fresh public-page load, the first `Tab` revealed a high-contrast **Skip to civic guide** control before the main navigation. The focus indicator was visible and the subsequent tab order exposed the navigation, civic-route controls, eligibility call to action, and context selector. This confirms a useful keyboard escape path at the start of the page.

The sign-in dialog exposes labeled email and password controls and a labeled close button. It dismissed successfully with `Escape` without submitting credentials, and focus returned to the **SIGN IN** trigger. This demonstrates a usable keyboard dismissal path for the public account-entry dialog.

Rendered-DOM inspection found no `<img>` elements requiring `alt` text; the visual iconography is exposed with appropriate named roles where needed. The place search, chat field, authentication fields, and profile fields have associated labels (the chat label is visibly hidden but present for assistive technology). The public page also includes `role="dialog"`, `aria-modal="true"`, dialog labels, `aria-live="polite"`, `role="status"`, and `role="log"` markers. Automated semantic evidence is positive; a full screen-reader announcement test in NVDA, VoiceOver, or TalkBack remains outside this environment.

This audit executed rendered responsive and keyboard checks in Chromium. Firefox, Safari, and Edge executables are not available in the audit environment, so browser-engine parity has not been claimed. The responsive implementation should still be checked on at least one real iOS Safari device and one Windows Chromium/Edge device before a public production commitment.

## Performance observation

The live server-rendered homepage is approximately 15.3 KB before subresources. Three public homepage requests returned HTTP 200 with total times of 2.84 s, 2.22 s, and 1.93 s. Three health checks returned HTTP 200 in 2.26–2.94 s. The first post-wake request previously took 4.92 s. The application itself responds successfully, but the free Render runtime does **not** consistently meet a sub-two-second public-response target; this is an expected limitation of the free host and the current server-side provider startup cost, rather than an image-weight issue.

## Visual and content evidence

The live page uses no `<img>` elements: its civic visual language is delivered by CSS composition and a small brand mark, so there is no oversized raster-image burden to remediate. No `Lorem ipsum`, “coming soon,” or similar placeholder copy was found in the rendered HTML. The mobile, tablet, and desktop captures show consistent Newsreader/Manrope typography, spacing, and action-button treatment.

The rendered HTML currently emits several official-resource links as `http://` rather than `https://`. They should be upgraded to HTTPS so the public guide never initiates an insecure navigation before an authority’s redirect policy takes effect.

## Remediation and live revalidation

The UI-audit remediation release (Render deployment of commit `208dc77`) reached **Live** status. On the updated public domain, changing the context from Bengaluru to Nairobi now removes the earlier answer and replaces it with an explicit **Context updated** state: “Ask a new question for this civic context. Earlier answers were cleared to avoid mixing jurisdictions.” The selected Nairobi context continues to show **Context preview** and the notice that local source matching is not connected. The final updated-response assertion remains below.

The subsequent Nairobi guide response correctly named Kenyan authorities, but ended with an incorrect reference to “the Indian election data provided earlier.” This is a remaining high-priority cross-jurisdiction wording defect in the NIM model instruction; the response must be constrained to avoid mentioning India, earlier contexts, or unavailable prior data when `civicContext` is `global_preview`.

The final remediation deployment (Render deployment `dep-da4skcm417fc73ddere0`, commit `d966cb1`) reached **Live** status at 21:42 UTC. The final public Nairobi response revalidation is the remaining release check.

On the final public build, switching from Bengaluru to Nairobi again cleared the earlier answer and rendered the **Context updated** notice before the guide form. The empty guide state was ready for a fresh Nairobi-only request.

The final Nairobi request completed successfully. Its response correctly stated that CivicFlow has no directly connected authority source for Nairobi, offered Kenya-appropriate IEBC and KNBS HTTPS resources, and did not contain Indian ECI, NVSP, Bengaluru, or prior-context wording. The location-change isolation and deterministic global-preview guard therefore passed in the public deployment.

## Audit Outcome

The live domain passed the audited functional, responsive, keyboard, semantic-accessibility, visual-content, and warm-response checks in Chromium. The audit also found and remediated three high-priority issues: retained cross-context answers, global-preview language leakage, and insecure generated HTTP authority links. Remaining follow-ups are environmental rather than confirmed CivicFlow UI failures: real-device Safari and Edge checks, assistive-technology announcement testing, and independent availability validation of third-party authority sites whose certificates could not be verified by the audit environment. The free Render tier also remains unsuitable for a strict under-two-second service-level target because cold starts and warm responses vary.

## Local follow-up verification — pending deployment

The next release was verified against the rebuilt local service; these findings do **not** describe the public Render domain until the release is manually deployed. The overlapping section labels **Your civic route**, **Saved route**, and **Civic guide** were removed without removing the route, saved, or guide controls. The footer now exposes a keyboard-reachable, new-tab repository link to <https://github.com/Ishwarpatra/CivicFlow> with `noopener noreferrer` protection.

The guide endpoint was checked with an unrelated prompt, “Write a pasta recipe.” It returned the expected civic-only guard response and the interface announced, **“Only civic questions are sent to the guide.”** The anonymous allowance was exercised through seven valid civic requests: requests one through six returned `200`, while request seven returned `429` with the guide-limit explanation. The server-side tests also cover a higher signed-in allowance. The broad IP anti-abuse limiter remains in place alongside these guide-specific limits.

Worldwide city search was tested with **Accra** and with dynamically resolved **Pune, India**. Accra continued to appear as a context preview. Selecting the dynamic Pune result produced **Context preview**, stated that local source matching is not connected, and cleared the prior guide state. This confirms that dynamic Indian locations do not inherit the curated India civic-source route. The search source resolves names only; it is not an official civic-data connection.

## Safeguards and global-search release — 22 August 2026

Render deployment `dep-da4t7mbncjis73f2h3d0` published commit `e04a3fe` to the audited public domain. The public health endpoint returned `200 OK`; an Accra place query returned normalized Ghana results marked `global_preview`; and the live picker selected Accra with the visible **Context preview** and “local source matching is not connected” disclosure. The deployed route, guide, and footer no longer showed the requested overlapping **Your civic route**, **Saved route**, or **Civic guide** labels, while their operational controls remained present. The repository footer action was visible and linked to the project repository.

An unrelated public guide request, “Write a pasta recipe,” received the civic-only response and client message **“Only civic questions are sent to the guide.”** A subsequent voter-registration question for Accra completed through NIM, gave global-preview caveats, and contained no India-specific guidance. The anonymous allowance and signed-in tier have deterministic server-side regression coverage; the signed-in allowance was not exercised on the public site because this audit does not create or use a live account. The browser evidence remains Chromium-only, and the prior physical mobile, Safari, Edge, and assistive-technology caveats still apply.

## Global civic-learning and interaction release — 23 August 2026

Render deployment `dep-da58s03m8hqs73brsc90` published commit `97ecb08` and reached **Live**. The public health endpoint returned `200 OK`; the public briefing endpoint returned four cards classified `global_learning`, together with an explicit country-agnostic boundary and a 500-character guide limit. The deployed **BRIEFINGS** tab presented the non-partisan cards with OECD, United Nations DESA, and World Bank references, while stating that the material is not universal local instruction.

The live **SAVED** tab displayed a saved briefing card and a **REMOVE** action after a card was saved. Its copy accurately identifies saved content and route progress as browser-local rather than account-synchronised state. The live **MY ROUTE** tab rejected an attempt to mark no selected stop, then updated the selected eligibility stop to **1 of 3 stops explored** when the action was completed. A deliberately delayed briefing request on the rebuilt local service showed structured shimmer skeletons before cards arrived; the live route and briefing controls did not show persistent feedback overlays.

A fresh anonymous public session submitted a 501-character civic message using the protected API contract. The public server returned `400` and the 500-character limit response before guide processing, confirming that the visible remaining-character counter is backed by server enforcement. This release preserves the earlier Chromium-only, physical-device, Safari, Edge, and assistive-technology limitations.

## Account storage and dedicated Guide release — 23 August 2026

Render deployment `dep-da59nirtqb8s739rkuag` published `main` commit `7616eed` and reached **Live** at 12:36:34 PM. The public `GET /api/health` and `GET /api/briefings` endpoints returned `200 OK`. The briefing response retained four source-linked global-learning cards, the country-agnostic boundary, and the 500-character guide-message limit.

Using an independent fresh Chromium profile against the published URL, the anonymous initial route view exposed **MY ROUTE**, **BRIEFINGS**, **SAVED**, and **GUIDE**. The Guide panel was visually hidden in **MY ROUTE**, **BRIEFINGS**, and **SAVED**, and visible with its chat input only in **GUIDE**; when the Guide was open, route content was not visually present. At both desktop width and an emulated 375×812 mobile viewport, `scrollWidth` equalled `clientWidth`, so the checked first-screen views had no horizontal overflow.

The same public anonymous session loaded four briefing cards, saved one actual learning card to the browser-local store, and displayed that card in **SAVED**. Selecting the first route task stored selected step `1` in browser-local progress, opened **GUIDE**, and prefilled the corresponding eligibility question. No live account was created for this audit. Authenticated saved-briefing and route-progress isolation is therefore verified through the local disposable-account flow and automated API tests, while the public release is limited to the anonymous UI path. Free Render storage remains ephemeral; the deployed SQLite account records must not be presented as durable long-term or cross-device hosting.
