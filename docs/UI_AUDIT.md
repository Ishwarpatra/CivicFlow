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
