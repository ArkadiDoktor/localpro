# LocalPro

A full-stack local services marketplace — clients find and book verified professionals; payments, identity verification, and transactional email are all wired up.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS |
| Backend | Next.js API Routes (Node.js runtime) |
| Database | PostgreSQL 15 + PostGIS (geo queries) |
| Payments | Stripe Payments + Stripe Connect (provider payouts) |
| Identity | Stripe Identity (document + selfie verification) |
| Maps | Google Places API (autocomplete, geocoding, place details) |
| Email | SendGrid (transactional — booking confirmation, reminders) |
| AI | Anthropic Claude (provider ranking + profile summaries) |

---

## Project Structure

```
localpro/
├── schema.sql                  # PostgreSQL schema (tables, indexes, triggers)
├── types/index.ts              # Shared TypeScript types
├── lib/
│   ├── db.ts                   # pg Pool, query helpers, transaction wrapper
│   ├── stripe.ts               # Payments, Connect onboarding, Identity
│   ├── email.ts                # SendGrid templates + audit log
│   ├── places.ts               # Google Places autocomplete, geocoding, PostGIS helper
│   ├── ai.ts                   # Claude-powered recommendations & summaries
│   └── auth.ts                 # JWT sign/verify, getAuthUser middleware
└── src/app/
    ├── api/
    │   ├── auth/route.ts           # POST /api/auth (login + register)
    │   ├── search/route.ts         # GET  /api/search (geo + category + AI)
    │   ├── bookings/route.ts       # GET/POST /api/bookings
    │   ├── places/route.ts         # GET  /api/places (autocomplete proxy)
    │   ├── identity/route.ts       # POST/GET /api/identity (Stripe Identity)
    │   └── payments/webhook/       # POST (Stripe webhook handler)
    ├── search/page.tsx             # Search UI with AI ranking toggle
    ├── checkout/page.tsx           # Stripe Elements checkout
    └── components/
        ├── ui/AddressAutocomplete.tsx
        └── provider/ProviderCard.tsx
```

---

## Key Integration Details

### Stripe Payments (Stripe Connect)
- Every provider gets a **Stripe Express connected account** for direct payouts
- `createBookingPaymentIntent()` uses `transfer_data` + `application_fee_amount` so the platform takes a 15% cut automatically
- Webhooks handle `payment_intent.succeeded` → booking confirmed, `payment_intent.payment_failed` → booking cancelled

### Stripe Identity
- `POST /api/identity` creates a `VerificationSession` with document + selfie requirements
- Returns a `client_secret` the frontend uses to open Stripe's built-in Identity modal
- `identity.verification_session.verified` webhook flips `providers.identity_verified = true`

### Google Places
- All API calls are server-side (API key never exposed to browser)
- `GET /api/places?input=...` proxies autocomplete → client gets results without touching Google directly
- `geocodeAddress()` converts text addresses to lat/lng for PostGIS geo-distance queries
- `buildGeoQuery()` generates a PostGIS `ST_DWithin` clause for radius search

### SendGrid
- Three templates: booking confirmation (client), provider notification, day-before reminder
- All sends are logged to `email_log` table with SendGrid's `x-message-id` for delivery tracking
- Sends are fire-and-forget (`.catch(console.error)`) so email failures don't break the booking flow

### AI (Claude)
- `getAIRecommendations()` sends provider summaries to Claude and gets back ranked results with scores + reasons
- Shown as "AI Match 87%" badges and one-line explanations on provider cards
- `generateProviderSummary()` uses `claude-haiku` for fast/cheap profile copy generation

### Authentication
- JWT-based; tokens stored as HTTP-only cookies (for SSR) and returned in JSON (for mobile)
- `getAuthUser(req)` is a reusable middleware called at the top of every protected API route

---

## Database

Key design decisions in `schema.sql`:

- **UUID primary keys** everywhere (uuid-ossp extension)
- **PostGIS `GEOGRAPHY(POINT)`** on `providers.location` for accurate km-distance queries
- **JSONB `availability`** stores weekly time slots — flexible without extra tables
- **Trigger `update_provider_rating`** recalculates `providers.rating` automatically on every new review
- **`set_updated_at` trigger** keeps `updated_at` accurate without application-level boilerplate
- Amounts stored in **cents** (integers) throughout — no floating-point money bugs

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in all values (Stripe, Google, SendGrid, Anthropic, DB)

# 3. Create database and run schema
createdb localpro
psql localpro < schema.sql

# 4. Run dev server
npm run dev
```

**Stripe webhooks (local dev):**
```bash
stripe listen --forward-to localhost:3000/api/payments/webhook
```

---

## Phase 2 — React Native

The backend is designed to be consumed by a React Native app as well:

- All auth uses JWT Bearer tokens (cookie fallback is SSR-only; mobile uses `Authorization: Bearer`)
- API routes return consistent `{ success, data } | { success, error }` envelope
- Stripe's React Native SDK can use the same `clientSecret` returned by `POST /api/bookings`
- Stripe Identity has a React Native SDK that accepts the same `client_secret`
- Google Places can be accessed via `@react-native-google-places/autocomplete` hitting the same `/api/places` proxy
