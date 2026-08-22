# CivicFlow User Guide

## What CivicFlow Is For

**CivicFlow helps a person identify the next civic action without pretending to be the official election authority.** The experience is designed as a short route: understand eligibility, find local voting information, and learn about public representatives. The status shown beside a location tells the user whether a source is connected, still a preview, or unavailable.

## Starting a Civic Route

Select **Begin with eligibility** to open the first step, or choose a route card directly if the task is already known. Each step explains the information needed and the level of source support available. The route is useful before signing in; authentication is only required for personal features such as saved profiles or account notices.

| Route stop | User goal | What to expect |
|---|---|---|
| **Check eligibility** | Understand enrolment basics and what must be verified | An explanatory route, not a legal determination. |
| **Find polling place** | Identify the appropriate local source for a polling-place check | A verified lookup only when its provider and context are connected. |
| **Know your representative** | Learn what public-office information is available | Provider-backed data when available; otherwise a transparent unavailable state. |

## Choosing a Civic Context

Use **Change place** to search the curated city, country, and regional starter list. This selection is included in the civic-guide request and remains visible in the context card.

> **Important:** A selected location does not guarantee that CivicFlow has a local official-source connection. Indian contexts are labelled **Indian civic-source route** when the product can offer India-oriented escalation routes. Other listed locations are labelled **Context preview** until a verified authority adapter is available.

## Asking the Civic Guide

Type a plain-language question, such as “How do I confirm my polling place?” CivicFlow records the chosen context and responds through the configured guide provider. If the provider is unavailable, CivicFlow does not invent an answer. It states what is unavailable and, for an unconnected global context, advises the user to consult the relevant municipal, regional, or national election authority.

## Account and Notifications

Select **Sign in** only when you want personal account features. Profile updates, notification preferences, and sign-out requests use server-side session and CSRF checks. Do not enter a civic decision as a fact based solely on a guide response; always verify final registration, dates, and polling information with the official authority.

## Accessibility and Device Use

The interface supports keyboard navigation, includes a skip link to the guide, and preserves browser zoom on mobile devices. If a location picker or dialog is open, use **Escape** to close it and **Tab** to move through its controls. Report any inaccessible state through the project's issue tracker with the device, browser, and route step involved.
