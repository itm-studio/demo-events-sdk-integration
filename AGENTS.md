# ITM Events SDK Integration — AI Coding Instructions

This is a **reference template** for building a custom events site with the [ITM Partner SDK](https://www.npmjs.com/package/@itm-studio/partner-sdk). It is intentionally minimal (~6 source files). Every pattern is deliberate — do not add complexity, abstractions, or dependencies unless explicitly asked.

## Architecture

```
Browser  →  Next.js Server Component  →  ITM Partner SDK  →  Partner API (GraphQL)
                                              ↑
                                     ITM_PARTNER_TOKEN used here (server only)
```

- **No custom backend.** No API routes, no database, no middleware.
- **Server components** fetch data via the SDK, then pass serialized props to client components.
- **Client components** handle interactivity (expand/collapse, modals, postMessage listeners). They never access `process.env` or the partner token.
- **Checkout** is an iframe pointing to a public ITM embed URL — not part of the SDK.

## Security Rules (Critical)

- `ITM_PARTNER_TOKEN` must **never** appear in client-side code, API routes, `fetch()` calls from the browser, or any response body.
- The token is read in `lib/itm.ts` via `process.env` and used only in server components.
- If you need new server-side logic, put it in a server component or a Next.js [Route Handler](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) — never expose the token to the client.
- The checkout embed iframe uses only public data (brand subdomain + event slug) — no token.
- `postMessage` listeners must validate origin against `.itm.studio` and `.itm-staging.studio` only.

## File Layout

```
lib/itm.ts              → SDK client init, env var validation (server-only)
lib/types.ts             → Shared TypeScript types (EventMoment interface)
app/page.tsx             → Home page (server component, fetches all events)
app/collections/[slug]/  → Collection page (server component, fetches one collection)
app/components/EventList.tsx     → Client component (event cards, expand/collapse, RSVP)
app/components/CheckoutEmbed.tsx → Client component (iframe modal, postMessage)
app/globals.css          → All styles (CSS custom properties, no framework)
app/layout.tsx           → Root layout (metadata, HTML shell)
```

## Server vs Client Boundary

| Concern | Where | Why |
|---------|-------|-----|
| SDK initialization | `lib/itm.ts` (server) | Token must stay server-side |
| Data fetching | `app/page.tsx`, `app/collections/[slug]/page.tsx` (server) | SDK requires token |
| Event splitting (upcoming/past) | Server components | Client receives pre-filtered arrays |
| Interactive UI, state | `EventList.tsx` (`'use client'`) | Needs useState, useCallback |
| Checkout modal, postMessage | `CheckoutEmbed.tsx` (`'use client'`) | Needs useEffect, DOM events |

**Do not move data fetching to client components.** Do not create API routes to proxy SDK calls — there is no need.

## SDK Query Pattern

```typescript
const itm = getITMClient(); // lib/itm.ts — reads process.env.ITM_PARTNER_TOKEN
const { getPartnerMomentsForBrand } = await itm.query({
  getPartnerMomentsForBrand: {
    __args: { take: 100, sortOrder: 'ASC' as const },
    moments: {
      uid: true,
      name: true,
      slug: true,
      // ... select fields with `true`, nest objects for relations
    },
    totalCount: true,
    hasNextPage: true,
  },
});
```

- Use `true` to select fields. Nest objects for relations (venue, ticketTiers, currency, coverImage).
- Use `__args` for query arguments.
- Cast results with `as EventMoment[]` — no runtime validation (trust the API schema).
- If adding new fields: update the query, update `EventMoment` in `lib/types.ts`, render in `EventList.tsx`.

## Event Classification

```typescript
const now = new Date();
const upcoming = moments.filter(
  (m) => m.status === 'UPCOMING' || m.status === 'LIVE' || new Date(m.endDate) >= now,
);
const past = moments.filter(
  (m) => m.status === 'ENDED' && new Date(m.endDate) < now,
);
```

This logic is duplicated in `app/page.tsx` and `app/collections/[slug]/page.tsx`. Keep them in sync.

## External Events vs Native Events

- **`externalUrl` is set** → render an `<a>` tag to the external URL (new tab). Ignore `soldOut`.
- **`externalUrl` is null** → render a button that opens the checkout embed modal. Respect `soldOut`.
- Button text: `'RSVP'` if any active tier has `price === 0`, otherwise `'Get Tickets'`.

## Checkout Embed

URL format: `https://{brandSubdomain}.{embedDomain}/m/{momentSlug}/embed/inline`

- `brandSubdomain` = `ITM_BRAND_SUBDOMAIN` env var
- `embedDomain` = `ITM_EMBED_DOMAIN` env var (defaults to `itm.studio`)
- `momentSlug` = event's `slug` field

The iframe needs `allow="payment"`. Listen for `postMessage` with `type: 'ITM_PURCHASE_SUCCESS'` to detect completed purchases. Always validate origin.

## Pricing

- Prices are in **cents** (e.g., `1500` = $15.00).
- Format: `price === 0` → `'Free'`, otherwise `${symbol}${(price / 100).toFixed(2)}`.
- Never divide by 100 without checking — some currencies are zero-decimal (JPY, KRW, etc.).

## Timezone Handling

All dates must render in the event's `timezone` field (IANA format, e.g., `"America/New_York"`). Always append the timezone abbreviation (e.g., "EST", "PST") to date strings. Use `toLocaleDateString` / `toLocaleTimeString` with `{ timeZone: event.timezone }`.

## Styling Conventions

- **Single file**: `app/globals.css`. No CSS framework, no CSS-in-JS.
- **Theming**: CSS custom properties at `:root` (`--bg`, `--surface`, `--text`, `--accent`, etc.).
- **Responsive**: One breakpoint at `600px`. Mobile-first. Modal goes full-screen on mobile.
- **Layout**: Flexbox only (no CSS Grid).
- **Class naming**: BEM-lite (`.event-card`, `.event-card-main`, `.tag.status-upcoming`).
- **Images**: Cover images use `aspect-ratio: 4/5` with `object-fit: cover`.

## TypeScript

- All types live in `lib/types.ts`. One interface: `EventMoment`.
- Strict mode enabled. No `as any`.
- Path alias: `@/*` maps to project root.
- Component props are explicitly typed with interfaces.

## Environment Variables

| Variable | Required | Server-only | Description |
|----------|----------|-------------|-------------|
| `ITM_PARTNER_TOKEN` | Yes | Yes | Partner API key. Sent as `x-partner-api-key` header by SDK. |
| `ITM_BRAND_SUBDOMAIN` | Yes | Yes | Brand subdomain for embed URLs. |
| `ITM_API_URL` | No | Yes | Override API base URL (defaults to production). |
| `ITM_EMBED_DOMAIN` | No | Yes | Override embed domain (defaults to `itm.studio`). |

All env vars are validated in `lib/itm.ts` with descriptive error messages. They throw early if missing.

## What This Template Does NOT Include

- Tests (no test framework) — add if needed for your use case
- Error boundaries or fallback UI
- Authentication or user accounts
- Pagination UI (SDK supports cursor-based pagination via `nextCursor`)
- Search/filtering UI
- Analytics or tracking
- Database or ORM

## Common Modifications

**Add a new event field:** (1) add to SDK query in `app/page.tsx`, (2) update `EventMoment` in `lib/types.ts`, (3) render in `EventList.tsx`.

**Change theme colors:** edit `:root` variables in `app/globals.css`.

**Add pagination:** add `cursor` arg to query, use `hasNextPage` + `nextCursor` from response.

## Do Not

- Add a CSS framework (Tailwind, styled-components, etc.) unless asked
- Create API routes — this template has none by design
- Install state management libraries (Redux, Zustand, etc.) — React state is sufficient
- Add runtime type validation (Zod, etc.) — the SDK is typed, trust the schema
- Over-abstract — three similar lines are better than a premature utility function
- Create separate files for small helper functions — keep them in the component file
