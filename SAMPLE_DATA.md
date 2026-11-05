# LensShare sample data

One command fills the owner, renter, and admin workspaces with connected sample records while keeping real accounts and listings untouched:

```bash
corepack pnpm sample:data
```

## What it creates

- Four sample accounts (created and auto-confirmed automatically): one owner, two renters, one admin
- Seven sample listings across every catalog category, with private sample serials and two blackout dates
- Legacy workflow-v1 bookings in pending, approved, active, returned, completed, and declined states
- Workflow-v2 scenarios: a pending request, an approved request with deposit proof awaiting review, an approved request still awaiting deposit payment, an active rental with full pre-release evidence, a completed rental with marked payout and refunded deposit, and an active rental under issue hold
- An open damage incident (under review) with a forfeited deposit, plus a resolved accessory-missing incident
- An active Saver Pass and private synthetic payment, agreement-signature, and inspection evidence
- Approved government ID, selfie, student ID, and enrollment samples for the student renter; identity-only approval for the second renter
- Messages (one unread per side for the badge), handoff checklists, reviews, and a payout

Every private sample image is generated locally and visibly marked as synthetic (for example, **SAMPLE — NOT A REAL ID**, **SAMPLE PAYMENT**, or **SAMPLE SIGNATURE**). It contains no real identity, signature, or payment information.

## Requirements

1. The canonical SQL layer must be installed first (`schema.sql` through `hub-operations.sql`, then `service-area-and-incidents.sql` last), as documented in `AGENTS.md`.
2. Add the service-role key to `.env` (Supabase Dashboard → Settings → API → service_role). It is used only by this local script to create the sample auth users and seed base rows — never commit it and never use it in app code:

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Accounts

| Workspace | Email | Password | Notes |
|---|---|---|---|
| Owner | `lensshare.owner@example.com` | `demo1234` | Mateo Rossi |
| Renter | `lensshare.renter@example.com` | `demo1234` | Julian Valdez — student, identity + student verified |
| Renter | `lensshare.renter2@example.com` | `demo1234` | Andrea Lim — identity verified, not a student (deposit scenarios) |
| Admin | `lensshare.admin@example.com` | `demo1234` | Naga Hub Operator |

The accounts are created on first run. To override passwords non-interactively, set `LENSSHARE_OWNER_PASSWORD`, `LENSSHARE_RENTER_PASSWORD`, `LENSSHARE_RENTER2_PASSWORD`, and `LENSSHARE_ADMIN_PASSWORD`; otherwise press Enter at each prompt to use `demo1234`.

## Safe reruns

Every row carries a deterministic sample identifier and status moves are forward-only. Rerunning repairs or completes the sample dataset (missing files are re-uploaded, a pending Saver Pass is approved, interrupted bookings resume from their current state); it does not delete non-sample records or rewind completed/audit history. The only shared row touched is the `naga` hub's SAMPLE settings.

If setup stops partway through, correct the reported issue and rerun the same command.

## Verification demo

Sign in as the admin and open `/admin/verifications`. The approved synthetic documents appear under Julian Valdez and Andrea Lim and can be opened in the in-page viewer. They are also sufficient for the sample renters to use booking, Saver Pass, student deposit-waiver, and hub workflow flows.

Never use these sample records as evidence of a real person's identity, enrollment, or payment.
