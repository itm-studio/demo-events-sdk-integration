# ITM Events SDK Integration — Template

A fully working Next.js template that shows how to build a custom events site powered by the [ITM Partner SDK](https://www.npmjs.com/package/@itm-studio/partner-sdk). Lists your brand's events, displays ticket tiers and pricing, supports event collections, handles external event links, and embeds ITM's checkout flow directly in your site — all with zero backend code.

## What's Included

- **Event listing page** (`/`) — fetches all moments for your brand, splits them into upcoming and past
- **Collection pages** (`/collections/[slug]`) — curated groups of events with optional links and descriptions
- **Inline checkout embed** — RSVP and ticket purchase via an embedded ITM checkout iframe modal
- **External event support** — events with an `externalUrl` link directly to a third-party ticketing page instead of using the embed
- **Timezone-aware dates** — all dates render in each event's `timezone` with the timezone abbreviation displayed (e.g. "EST", "PST")
- **Cover image** — 4:5 poster image displayed alongside the description in a two-column layout
- **Ticket tier display** — expandable event cards showing individual tiers, prices, and availability
- **Responsive design** — mobile-first layout with full-screen checkout modal on small screens

## Prerequisites

- **Node.js** 18+ and npm
- An **ITM brand** with events already created in the ITM backstage dashboard
- An **ITM Partner API token** — generate one from backstage: **Settings > Partner API**
- Your **brand subdomain** — this is the subdomain shown in your ITM-hosted page URLs (e.g. if your event page is `npcc.itm.studio/m/...`, your subdomain is `npcc`)

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/itm-studio/demo-events-sdk-integration.git
cd demo-events-sdk-integration
```

### 2. Install dependencies

```bash
npm install
```

This installs the [`@itm-studio/partner-sdk`](https://www.npmjs.com/package/@itm-studio/partner-sdk) along with Next.js and React.

### 3. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

```env
ITM_PARTNER_TOKEN=your_partner_api_token_here
ITM_BRAND_SUBDOMAIN=your-brand-subdomain

# Optional
# ITM_API_URL=...        # Defaults to production
# ITM_EMBED_DOMAIN=...   # Defaults to itm.studio
```

| Variable | Required | Description |
|---|---|---|
| `ITM_PARTNER_TOKEN` | Yes | Your partner API key from ITM backstage. Sent as `x-partner-api-key` on every request. |
| `ITM_BRAND_SUBDOMAIN` | Yes | Your brand's subdomain (e.g. `"npcc"`). Used to construct the checkout embed URL. |
| `ITM_API_URL` | No | Override the API base URL. Defaults to production. |
| `ITM_EMBED_DOMAIN` | No | Domain for the checkout embed iframe. Defaults to `itm.studio`. |

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see your events.

## Project Structure

```
.
├── app/
│   ├── layout.tsx                    # Root layout (HTML shell, metadata)
│   ├── page.tsx                      # Home page — fetches & lists all brand events
│   ├── globals.css                   # All styles (single file, CSS custom properties)
│   ├── components/
│   │   ├── EventList.tsx             # Client component — event cards, expand/collapse, RSVP
│   │   └── CheckoutEmbed.tsx         # Client component — iframe modal for ITM checkout
│   └── collections/
│       └── [slug]/
│           └── page.tsx              # Collection page — fetches a specific event collection
├── lib/
│   ├── itm.ts                        # ITM Partner SDK client setup
│   └── types.ts                      # Shared TypeScript types (EventMoment)
├── .env.example                      # Example environment variables (safe to commit)
├── .gitignore                        # Excludes node_modules, .next, .env files
├── package.json
└── tsconfig.json
```

## How It Works

> **What comes from the SDK vs what doesn't:**
> The [`@itm-studio/partner-sdk`](https://www.npmjs.com/package/@itm-studio/partner-sdk) handles all **data fetching** — events, ticket tiers, collections, pricing, venues, etc. The **checkout embed** (iframe for purchasing tickets) is not part of the SDK. It uses a standard ITM embed URL that you construct yourself. This template shows you how to do both.

### SDK Client Setup (`lib/itm.ts`)

The SDK client is created server-side using your partner token. It communicates with the ITM Partner API via GraphQL — but you never write raw GraphQL. The SDK provides a fully typed, autocomplete-friendly query builder.

```typescript
import { createITMPartnerClient } from '@itm-studio/partner-sdk';

const itm = createITMPartnerClient({
  token: process.env.ITM_PARTNER_TOKEN!,
  baseUrl: process.env.ITM_API_URL, // optional, defaults to production
});
```

### Fetching Events (`app/page.tsx`)

The home page is a **server component** that fetches events at request time (`dynamic = 'force-dynamic'`). It uses the SDK's `getPartnerMomentsForBrand` query to pull all moments for your brand:

```typescript
const { getPartnerMomentsForBrand } = await itm.query({
  getPartnerMomentsForBrand: {
    __args: { take: 100, sortOrder: 'ASC' },
    moments: {
      uid: true,
      name: true,
      slug: true,
      externalUrl: true,       // if set, links to third-party ticketing
      description: true,
      startDate: true,
      endDate: true,
      status: true,            // UPCOMING | LIVE | ENDED
      type: true,              // IRL | DIGITAL
      category: true,
      coverImage: {
        url: true,             // cover image URL
        mimeType: true,
      },
      soldOut: true,
      timezone: true,          // IANA timezone (e.g. "America/New_York")
      venue: {
        name: true,
        city: true,
        country: true,
        address: true,
      },
      ticketTiers: {
        uid: true,
        name: true,
        description: true,
        price: true,            // price in cents (e.g. 1500 = $15.00)
        currency: { code: true, symbol: true },
        isActive: true,
        soldOut: true,
        maxPerUser: true,
      },
    },
    totalCount: true,
    hasNextPage: true,
  },
});
```

Events are then split into **upcoming** (status is `UPCOMING`, `LIVE`, or end date is in the future) and **past** (status is `ENDED` and end date has passed) before being passed to the client component.

### Event Cards (`app/components/EventList.tsx`)

The `EventList` is a client component (`'use client'`) that renders interactive event cards. Each card shows:

- **Date badge** — month and day, formatted in the event's timezone
- **Event name, date/time range, and venue** — all dates include the timezone abbreviation (e.g. "7:00 PM – 10:00 PM EST")
- **Tags** — category, online/in-person, status, price range
- **RSVP / Get Tickets button** — behavior depends on the event type:

#### Native ITM events (no `externalUrl`)
Clicking "RSVP" or "Get Tickets" opens a **checkout embed modal** — an iframe pointing to your brand's ITM checkout page. The modal listens for a `postMessage` event (`ITM_PURCHASE_SUCCESS`) from the iframe to detect completed purchases.

#### External events (has `externalUrl`)
The button renders as a link (`<a>` tag) that opens the external URL in a new tab. Sold-out status is ignored for external events since availability is managed by the external platform.

Clicking anywhere else on the card **expands** it to show the cover image (4:5 poster on the left) alongside the description, plus individual ticket tiers with prices and availability.

### Checkout Embed (`app/components/CheckoutEmbed.tsx`)

The checkout embed is **not part of the SDK** — it's a standard iframe that loads ITM's hosted checkout page. This template shows how to set it up.

#### Embed URL format

```
https://{brandSubdomain}.{embedDomain}/m/{momentSlug}/embed/inline
```

| Placeholder | Source |
|---|---|
| `{brandSubdomain}` | `ITM_BRAND_SUBDOMAIN` env var |
| `{embedDomain}` | `ITM_EMBED_DOMAIN` env var (defaults to `itm.studio`) |
| `{momentSlug}` | The `slug` field from the event data (fetched via the SDK) |

For example, if your subdomain is `npcc` and the event slug is `summer-party`:
```
https://npcc.itm.studio/m/summer-party/embed/inline
```

#### Setting up the iframe

The iframe needs the `allow="payment"` attribute to support payment flows:

```html
<iframe
  src="https://npcc.itm.studio/m/summer-party/embed/inline"
  allow="payment"
  title="RSVP for Summer Party"
/>
```

#### Listening for purchase completion

The ITM checkout iframe sends a `postMessage` when a purchase is completed. Listen for it to react to successful purchases (e.g. close a modal, show a confirmation, redirect):

```typescript
window.addEventListener('message', (event) => {
  // Validate the origin
  if (
    !event.origin.endsWith('.itm.studio') &&
    !event.origin.endsWith('.itm-staging.studio')
  ) return;

  if (event.data?.type === 'ITM_PURCHASE_SUCCESS') {
    // event.data contains:
    // {
    //   type: "ITM_PURCHASE_SUCCESS",
    //   momentSlug: "summer-party",
    //   source: "itm-embed",
    //   timestamp: 1711036800000
    // }
    console.log('Purchase completed!', event.data);
    // Close modal, show confirmation, etc.
  }
});
```

#### How this template uses it

This template wraps the iframe in a modal (`CheckoutEmbed.tsx`) with these features:
- **Escape key** or **clicking the overlay** closes the modal
- **`postMessage` listener** — auto-closes the modal on `ITM_PURCHASE_SUCCESS` (includes `momentSlug`, `source`, and `timestamp`)
- **Origin validation** — only processes messages from `.itm.studio` or `.itm-staging.studio` domains
- **Scroll lock** — prevents background scrolling while the modal is open

You don't have to use a modal — you could embed the iframe directly on a page, in a sidebar, or in any container you want. The URL format and `postMessage` flow work the same regardless.

#### Embed URL query parameters

The embed supports optional query parameters for customization:

| Param | Description |
|---|---|
| `theme` | Color theme |
| `bg` | Background color |
| `accent` | Accent/button color |
| `font` | Font override |
| `tier` | Pre-select a specific ticket tier |
| `tierDisplay` | How to display tiers |
| `filterDisplay` | How to display filters |
| `filtersLabel` | Label for the filters section |

Example with customization:
```
https://npcc.itm.studio/m/summer-party/embed/inline?bg=%23ffffff&accent=%23111827
```

### Collections (`app/collections/[slug]/page.tsx`)

Collections are groups of related events (e.g. a summer concert series, a festival lineup). Collections are created and managed in the ITM backstage dashboard — each collection has a unique slug.

To view a collection, navigate to `/collections/{slug}` (e.g. `/collections/summer-series`). If the slug doesn't match any collection, a "not found" page is shown.

The collection page uses the SDK's `getPartnerMomentCollection` query:

```typescript
const { getPartnerMomentCollection } = await itm.query({
  getPartnerMomentCollection: {
    __args: { slug },
    name: true,
    description: true,
    subLabel: true,
    moments: {
      // ... same fields as the main event listing
    },
    links: {
      uid: true,
      url: true,
      label: true,
    },
  },
});
```

Collections support:
- **Name, description, and sub-label** in the header
- **Links** — displayed as pill-shaped links below the header (e.g. "Official Website", "Instagram")
- **Event listing** — same upcoming/past split and card behavior as the main page

### Timezone Handling

All dates are rendered using each event's `timezone` field (an IANA timezone string like `"America/New_York"` or `"Europe/London"`). The timezone abbreviation is appended to every date string so users always know which timezone an event is in:

```
Saturday, March 21, 2026 · 7:00 PM – 10:00 PM EST
```

The date badge (month/day) on each card also uses the event's timezone to ensure the correct day is shown regardless of the user's local timezone.

### Types (`lib/types.ts`)

A single `EventMoment` interface defines the shape of event data passed from server components to client components:

```typescript
interface EventMoment {
  uid: string;
  name: string;
  slug: string;
  externalUrl: string | null;
  description: string | null;
  startDate: string;
  endDate: string;
  status: string;           // "UPCOMING" | "LIVE" | "ENDED"
  type: string;             // "IRL" | "DIGITAL"
  category: string;
  coverImage: {
    url: string;
    mimeType: string;
  } | null;
  soldOut: boolean;
  timezone: string;          // IANA timezone, e.g. "America/New_York"
  venue: {
    name: string;
    city: string;
    country: string;
    address: string | null;
  } | null;
  ticketTiers: Array<{
    uid: string;
    name: string;
    description: string | null;
    price: number;           // in cents
    currency: { code: string; symbol: string };
    isActive: boolean;
    soldOut: boolean;
    maxPerUser: number;
  }>;
}
```

## Styling

All styles live in `app/globals.css` using CSS custom properties for easy theming. No CSS framework is required.

Key design tokens you can customize:

```css
:root {
  --bg: #fafafa;             /* page background */
  --surface: #ffffff;        /* card background */
  --border: #e5e7eb;         /* card borders */
  --text: #111827;           /* primary text */
  --text-secondary: #6b7280; /* secondary text */
  --accent: #111827;         /* buttons, links */
  --accent-hover: #374151;   /* button hover state */
  --radius: 12px;            /* card border radius */
  --radius-sm: 8px;          /* button border radius */
}
```

The layout is responsive — on screens under 600px, the header stacks vertically, event cards wrap their content, and the checkout modal goes full-screen.

## Customization Guide

### Change the branding
Edit the CSS custom properties in `app/globals.css` and update the metadata in `app/layout.tsx`.

### Add more event fields
The SDK supports many more fields than this template uses. Add fields to the query in `app/page.tsx`, update the `EventMoment` type in `lib/types.ts`, and render them in `EventList.tsx`.

### Switch to production
Remove or comment out `ITM_API_URL` and `ITM_EMBED_DOMAIN` from your `.env.local` — both default to production values.

### Add pagination
The SDK supports cursor-based pagination. Add a `cursor` argument to the query and use `hasNextPage` / `nextCursor` from the response. See the [SDK documentation](https://www.npmjs.com/package/@itm-studio/partner-sdk) for details.

### Deploy
This is a standard Next.js app. Deploy to Vercel, Netlify, or any platform that supports Next.js. Set your environment variables in the platform's dashboard.

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org/) | 15 | React framework with server components |
| [React](https://react.dev/) | 19 | UI library |
| [@itm-studio/partner-sdk](https://www.npmjs.com/package/@itm-studio/partner-sdk) | latest | Type-safe ITM Partner API client |
| TypeScript | 5.7+ | Type safety |

## License

MIT
