# AGENTS.md

Guidance for AI coding agents working on LensShare, a peer-to-peer camera gear
rental marketplace (Naga City hub) built with Next.js App Router. The UI was
bootstrapped from v0; the backend is Supabase (Postgres + auth + realtime +
storage) with two role workspaces: owner (`/dashboard/*`) and renter
(`/renter/*`).

## Commands

- `pnpm dev` — dev server
- `pnpm build` — production build
- `pnpm exec tsc --noEmit` — typecheck
- `corepack pnpm sample:data` — fill the system with deterministic sample data
  (users, listings, bookings, verifications, hub workflows, incidents); see
  `SAMPLE_DATA.md`. Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

pnpm is pinned in `packageManager` and may be missing from PATH on this
machine — run it as `corepack pnpm <cmd>`. Never npm or yarn. There is no test
suite or linter — verify changes by typechecking, building, and running the
dev server.

**Important:** `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so
`pnpm build` passes even with type errors. Run `pnpm exec tsc --noEmit` before
finishing any change.

## Supabase backend

- Env vars live in `.env`: `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Dashboard SQL deployment order for a fresh or upgraded installation is:
  `schema.sql` → `verification.sql` → `renter-primary-use.sql` → `enums.sql` →
  `admin.sql` → `listing-locations.sql` → `listing-media.sql` → `features.sql` →
  `community.sql` → `message-actions.sql` → `emails.sql` → `promo-pass.sql` →
  `storage.sql` → **`hub-operations.sql` LAST**. `seed.sql` is optional/demo-only
  and destructive for the resolved demo owner; never use it as a migration.
  `hub-operations.sql` owns the final overlapping booking/verification RPCs,
  v2 transition guards, aggregate verification, and private hub storage policies.
  If any earlier canonical file is rerun, rerun `hub-operations.sql` afterwards.
- `supabase/schema.sql` creates the base schema (tables, RLS, signup trigger,
  realtime, gear storage); `supabase/verification.sql` adds the verification
  layer (`verification_submissions` table, private `verification-docs` bucket,
  `profiles.email`); `supabase/renter-primary-use.sql` adds the optional,
  self-reported `profiles.primary_rental_use` enum used for owner renter-mix
  reporting; `supabase/enums.sql` converts every constrained text
  column to native Postgres enums (Table Editor dropdowns) and makes the
  role a three-value enum: `owner | renter | admin` (admin replaces the old
  is_admin flag); `supabase/admin.sql` grants admins the console's extra
  policies (read all bookings, moderate any listing); `supabase/storage.sql`
  re-asserts all storage buckets/policies; `supabase/hub-operations.sql` adds the
  approved Naga hub operations layer (workflow-v2 snapshots, private serials,
  assigned admin operators, custody/events, deposits, immutable agreements,
  inspections/transfers, aggregate verification, secured RPCs, RLS, storage and
  realtime) while preserving workflow-v1 and Saver Pass accounting;
  `supabase/seed.sql` seeds demo data. Setup/upgrade SQL files are
  idempotent and applied by pasting them into the Supabase dashboard SQL
  Editor. There is no local supabase CLI or migrations folder.
- Tables: `profiles` (extends `auth.users`; `role` is an enum:
  `owner` | `renter` | `admin` — exclusive, drives routing; plus
  `verification_status`, `is_student`, and optional self-reported
  `primary_rental_use`), `gear_listings` (publicly readable,
  owner-writable; category and status are enums), `listing_assets` (private
  owner/admin inventory serials; never expose serials through `gear_listings`),
  `bookings` (same status enum; `workflow_version=1` preserves legacy flow and
  version 2 is hub-gated), and the version-2 operation/deposit/agreement/
  inspection/transfer/event tables installed by `hub-operations.sql`.
  Booking and verification writes are RPC-only. Version-2 identity requires both
  approved government ID and selfie; student status/waiver requires both approved
  student ID and proof of enrollment. The student deposit waiver is independent
  of Saver Pass. The security deposit is equipment-dependent:
  `gear_listings.security_deposit` (owner-set, nullable) wins; when null the
  booking falls back to `rental_hubs.standard_deposit` (the admin-editable hub
  default). Identity documents live in the PRIVATE append-only
  `verification-docs` bucket (signed URLs; 10 MB JPEG/PNG/WebP/PDF) — never move
  them to public `gear-photos`. Deposit proofs use private `deposit-proofs`
  (`{renter_id}/{booking_id}/{filename}`); inspection evidence uses private
  `inspection-photos` (`{booking_id}/{inspection_id}/{filename}`).
- Row Level Security is the security core — the browser queries Supabase
  directly with the publishable key. Never replace RLS with client-side
  checks.
- Realtime: `bookings` and the version-2 operation/deposit/inspection/transfer/
  event tables are published to `supabase_realtime`; clients must still filter by
  their booking/operator identifiers and RLS remains authoritative.
- Gear photos upload to the public `gear-photos` storage bucket under
  `{user_id}/…`.
- Seed/demo accounts (password `demo1234`): `lensshare.owner@example.com` (Mateo Rossi)
  and `lensshare.renter@example.com` (Julian Valdez). The login page has no
  demo prefills — these accounts exist for `seed.sql` and manual testing; sign
  them up through the app (or the dashboard), then run `seed.sql`.

## Routes

- `/` — landing page
- `/browse` — public gear catalog; booking modal inserts a real booking
- `/login`, `/signup` — Supabase email + password auth; signup picks the
  starting role (Owner or Renter, expandable later from settings/profile)
- `/dashboard/*` — owner workspace: overview, `listings`, `rentals`,
  `finance`, `settings`
- `/renter/*` — renter workspace: `bookings`, `how-it-works`, `profile`,
  `verification` (real upload flow: government ID + selfie, student docs)
- `/admin` — admin console with its own light-sidebar chrome and a
  full-width content area (`components/admin-shell.tsx`, styles in
  `app/admin/admin.css`):
  dashboard, aggregate verification queue (identity is government ID + selfie;
  student is student ID + enrollment proof), users, equipment moderation, and
  the workflow-v2 Naga hub operations queue.
- `proxy.ts` (Next 16's middleware) refreshes sessions and guards routes by
  role: owners only reach `/dashboard/*`, renters only `/renter/*`, and
  `/admin/*` requires `profiles.is_admin`.

## Conventions

- **Styling is co-located plain CSS, not Tailwind utilities or CSS modules.**
  Each section has a stylesheet imported by its page: `app/browse/browse.css`,
  `app/dashboard/dashboard.css` (overview + auth pages),
  `app/dashboard/owner-pages.css` (shared by owner pages and both shells), and
  `app/renter/renter.css`. Class names are namespaced by section prefix
  (`.browse-*`, `.owner-*`, `.renter-*`). Renter pages intentionally reuse
  `.owner-*` classes from the shells, so renaming owner classes breaks renter
  views. Add new styles to the matching stylesheet with that section's prefix.
- **Shells:** `components/owner-shell.tsx` and `components/renter-shell.tsx`
  provide the sidebar/nav chrome and display the logged-in user via the
  `useProfile` hook; pages render inside them.
- **Data access** goes through the helpers in `lib/data.ts` (browser client
  from `lib/supabase/client.ts`). Shared types and formatting helpers
  (`pesos`, `rentalDays`, `initialsOf`) live in `lib/types.ts`. Don't call
  `supabase.from(...)` ad hoc in pages when a helper exists — add one instead.
- **Design language:** editorial/print aesthetic — serif headings (Georgia),
  small uppercase letter-spaced labels (Arial), mono accents (`DM Mono`),
  off-white background `#f8f8f5`, near-black `#07100e`, muted teal-green
  accents. Match the existing pages; don't introduce a new look.
  `app/globals.css` holds the Tailwind v4 setup and tokens.
- shadcn/ui is configured (`components.json`, style `base-nova`) with
  primitives in `components/ui` and the `cn` helper in `lib/utils.ts`.
  Existing pages mostly use bespoke markup plus lucide-react icons; follow
  that unless a richer primitive is genuinely needed.
- Path alias `@/*` maps to the repo root. Images live in `public/` (listing
  photos come from Supabase Storage) and are referenced with plain `<img>`
  (Next `images.unoptimized` is on).
- Pages are client components (`'use client'`) using `useState`/`useEffect`;
  keep interactivity client-side.

## Scope

The database, auth, booking lifecycle, verification queue, Saver Pass accounting,
and version-2 Naga hub operations are real. Payments remain manual GCash proof
and admin review (no payment processor or automated escrow). Reviews and the
remaining dispute/payout UI are limited to the existing schema/scope. Don't add
new auth providers or state libraries without being asked.
Dev machine is Windows (Git Bash); write commands accordingly.
