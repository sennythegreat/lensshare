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
- `supabase/schema.sql` creates the base schema (tables, RLS, signup trigger,
  realtime, gear storage); `supabase/verification.sql` adds the verification
  layer (`verification_submissions` table, private `verification-docs` bucket,
  `profiles.email`); `supabase/enums.sql` converts every constrained text
  column to native Postgres enums (Table Editor dropdowns) and makes the
  role a three-value enum: `owner | renter | admin` (admin replaces the old
  is_admin flag); `supabase/admin.sql` grants admins the
  console's extra policies (read all bookings, moderate any listing);
  `supabase/seed.sql` seeds demo data. All are
  idempotent and applied by pasting them into the Supabase dashboard SQL
  Editor. There is no local supabase CLI or migrations folder.
- Tables: `profiles` (extends `auth.users`; `role` is an enum:
  `owner` | `renter` | `admin` — exclusive, drives routing; plus
  `verification_status`, `is_student`), `gear_listings` (publicly readable,
  owner-writable; category and status are enums), `bookings` (status enum
  lifecycle `pending → approved → active → returned → completed`, plus
  `declined`; visible only to the booking's renter and owner), and
  `verification_submissions` (identity/student documents; users see their
  own, admins see all and review them). Identity documents live in the
  PRIVATE `verification-docs` bucket (accessed via signed URLs) — never move
  them to the public `gear-photos` bucket.
- Row Level Security is the security core — the browser queries Supabase
  directly with the publishable key. Never replace RLS with client-side
  checks.
- Realtime: the owner rentals page and renter bookings page subscribe to
  `postgres_changes` on `bookings`, filtered by their own id.
- Gear photos upload to the public `gear-photos` storage bucket under
  `{user_id}/…`.
- Demo accounts (password `demo1234`): `lensshare.owner@example.com` (Mateo Rossi)
  and `lensshare.renter@example.com` (Julian Valdez). Sign them up through the app,
  then run `seed.sql` to attach their listings and bookings.

## Routes

- `/` — landing page
- `/browse` — public gear catalog; booking modal inserts a real booking
- `/login`, `/signup` — Supabase email + password auth; signup picks the
  starting role (Owner or Renter, expandable later from settings/profile)
- `/dashboard/*` — owner workspace: overview, `listings`, `rentals`,
  `finance`, `settings`
- `/renter/*` — renter workspace: `bookings`, `how-it-works`, `profile`,
  `verification` (real upload flow: government ID + selfie, student docs)
- `/admin` — admin console with its own dark-sidebar chrome
  (`components/admin-shell.tsx`, styles in `app/admin/admin.css`):
  dashboard (platform stats), `verifications` (queue; approving a government
  ID verifies the account, approving student documents sets `is_student`),
  `users` (owners & renters directory), `equipment` (all listings + moderation
  pause/activate)
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

The database, auth, booking lifecycle, and the verification queue are real;
payments/payouts, escrow, reviews, and the other admin screens (bookings/
hand-offs, disputes, payouts) are not yet built. Don't add new tables, auth
providers, or state libraries without being asked.
Dev machine is Windows (Git Bash); write commands accordingly.
