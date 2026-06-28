# OPENAI Collaboration Log

This file is for compact AI/context handoff while multiple people work on this branch.
Keep it short, factual, and updated when an AI assistant makes meaningful repo changes.

## Branch Context

- Current branch observed by Codex: `provider`
- This branch is shared. Do not revert other people's edits unless explicitly asked.
- Prefer small commits grouped by GitHub issue.
- Main person-5 issue list is tracked in `docs/person5.md`.

## Current Local Changes From Codex

### Provider service skeleton

Implemented local work for:

- `#13` `[Provider] Create ProviderService skeleton`
- `#29` `[Provider] Create provider-service package and endpoint`

Files added/changed:

- `services/provider-service/package.json`
- `services/provider-service/tsconfig.json`
- `services/provider-service/.env.example`
- `services/provider-service/src/index.ts`
- `services/provider-service/src/routes/providers.ts`
- `package.json`
- `package-lock.json`
- `services/api-gateway/.env.example`
- `services/api-gateway/src/index.ts`

New endpoint:

```text
GET /api/v1/providers
```

Current behavior:

```json
{
  "service": "ProviderService",
  "ok": true,
  "message": "Provider service skeleton is ready."
}
```

### Web preview fix

Changed `apps/web/next.config.ts` so Turbopack root points to the monorepo root:

```ts
root: path.join(__dirname, "../..")
```

Reason: dependencies are hoisted at the repo root, and Next/Turbopack could not resolve `next/package.json` from `apps/web/src/app`.

### Person 5 notes

Created:

- `docs/person5.md`

It lists the issues visible in the user's screenshots, grouped by docs/provider/integration/analytics/billing, with completed local work marked using `✅`.

### Provider billing schema

Implemented local work for:

- `#20` `[Billing] Add ProviderInvoice model to Prisma schema`
- `#21` `[Billing] Add ProviderPayment model to Prisma schema`
- `#22` `[Billing] Add ProviderUsageRecord model to Prisma schema`
- `#23` `[Billing] Implement provider invoice listing endpoint`
- `#24` `[Billing] Implement provider invoice details endpoint`
- `#28` `[Billing] Add billing seed data for one provider invoice`

Files changed:

- `services/auth-service/prisma/schema.prisma`
- `services/user-service/prisma/schema.prisma`
- `services/vehicle-service/prisma/schema.prisma`
- `services/charger-service/prisma/schema.prisma`
- `services/reservation-service/prisma/schema.prisma`
- `services/session-service/prisma/schema.prisma`
- `services/billing-service/prisma/schema.prisma`
- `services/billing-service/src/controllers/providerBillingController.ts`
- `services/billing-service/src/routes/providerBilling.ts`
- `services/billing-service/src/index.ts`
- `docs/person5.md`

Added models/enums:

- `ProviderInvoice`
- `ProviderInvoiceStatus`
- `ProviderPayment`
- `ProviderPaymentStatus`
- `ProviderUsageRecord`

Important: the same provider billing models were added to all duplicated Prisma schemas so future `prisma generate` runs from any service keep a compatible shared root `@prisma/client`.

Also aligned stale schemas in `charger-service`, `reservation-service`, `session-service`, and `billing-service` so `Role` and Google-auth `User` fields match the auth/user/vehicle schemas. This prevents generated Prisma client drift that breaks auth code.

Provider billing API now lives in `billing-service` behind the existing gateway `/api/v1/payments` target:

- `GET /api/v1/payments/provider/invoices`
- `GET /api/v1/payments/provider/invoices/:id`
- `POST /api/v1/payments/provider/seed-demo-invoice`

These routes require a valid JWT and `PROVIDER_ADMIN` or `PLATFORM_OPERATOR`. Provider admins are resolved to their real `Provider.id` via `ProviderAccount` (see "Provider billing providerId fix" below); platform operators may pass `providerId` as a query parameter for the read endpoints.

### Provider models and endpoints (#30-#35)

`provider-service` is no longer a skeleton. It now has its own Prisma schema, client, JWT middleware, controller, routes, and a vitest suite.

Added to all duplicated schemas: models `Provider`, `ProviderAccount`, `ProviderPlan`, `ProviderSubscription`; enums `ProviderStatus`, `SubscriptionStatus`; and a nullable `Charger.providerId` so a provider's chargers can be listed.

New endpoints (gateway target `/api/v1/providers`):

- `POST /api/v1/providers/register` — any authenticated user; creates a `Provider`, links it via `ProviderAccount`, and promotes the user to `PROVIDER_ADMIN`.
- `GET /api/v1/providers/me`, `PATCH /api/v1/providers/me`
- `GET /api/v1/providers/me/chargers`
- `POST /api/v1/providers/seed-demo` — idempotent demo provider + plans + chargers.

A `Provider` row has its own autoincrement `id`. The user <-> provider link is the `ProviderAccount` table (not `userId == providerId`).

### Provider billing providerId fix

`billing-service` previously used the provider admin's `userId` directly as `ProviderInvoice.providerId`. Now that a real `Provider` model exists, the billing `resolveProviderId` helper resolves the caller to their real `Provider.id` via `ProviderAccount`. Consequence: `seed-demo-invoice` now requires the caller to have registered a provider first (otherwise `409`). No FK from `ProviderInvoice` to `Provider` was added yet (needs a data migration); do it alongside `#25` PayProviderInvoice.

### Integration service (#37-#43)

New `integration-service` (port `8109`, gateway target `/api/v1/integration`).

Added to all duplicated schemas: models `ProviderApiConfig`, `ProviderCharger`; and `WebhookSubscription.providerId` so webhook subscriptions are provider-scoped.

The mock `ExternalProviderAPI` adapter normalizes the three different provider API contracts (redPlug / greenPlug / bluePlug) into one `NormalizedCharger` shape. Mock data is the default; set `INTEGRATION_USE_MOCK=false` to call the real provider APIs.

New endpoints:

- `POST /api/v1/integration/config`, `GET .../config` — ConfigureProviderAPI.
- `POST /api/v1/integration/sync`, `GET .../chargers` — charger sync.
- `POST /api/v1/integration/webhooks`, `GET .../webhooks`, `GET .../webhooks/events`.

Sync writes both a `Charger` row (so synced chargers appear in charger search) and a `ProviderCharger` link row. The team API key belongs only in a local `.env` as `INTEGRATION_DEFAULT_API_KEY`; stored `apiKey`/`secret` values are masked in API responses.

## Backend/Preview Runtime Notes

Useful local ports:

- Web: `http://localhost:3000`
- API gateway: `http://localhost:8080`
- Charger service: `http://localhost:8104`
- Provider service: `http://localhost:8108`
- Integration service: `http://localhost:8109`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

Docker infra command:

```bash
docker compose -f infra/docker-compose.reused.yml up -d
```

If Docker containers show `5432/tcp` and `6379/tcp` without `0.0.0.0:5432->5432/tcp`, recreate the infra stack:

```bash
docker compose -f infra/docker-compose.reused.yml down
docker compose -f infra/docker-compose.reused.yml up -d
```

Prisma sync used during preview:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/ev_app \
  npx prisma db push --schema services/charger-service/prisma/schema.prisma
```

Seed demo chargers through gateway:

```bash
curl -X POST http://localhost:8080/api/v1/admin/resetpoints
```

Expected seed result:

```json
{"status":"OK","message":"Reset 717 chargers from demo dataset."}
```

## Verification Already Run

After provider service changes:

```bash
npm run build:provider
npm run build:gateway
npm run build:services
```

All passed.

After provider billing schema changes:

```bash
npm --prefix services/billing-service run prisma:generate
npm run build:services
```

All passed.

Local DB was synced with:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/ev_app npx prisma db push --schema services/billing-service/prisma/schema.prisma --accept-data-loss
```

The `--accept-data-loss` flag was needed because the local DB still had old `Role` enum values (`USER`, `ADMIN`) while the repo schema now uses `EV_USER`, `PROVIDER_ADMIN`, and `PLATFORM_OPERATOR`.

Smoke-tested against billing-service on `http://localhost:8107` with a local `PROVIDER_ADMIN` JWT:

- `POST /api/v1/payments/provider/seed-demo-invoice` returned `created: true`
- `GET /api/v1/payments/provider/invoices` returned the seeded invoice
- `GET /api/v1/payments/provider/invoices/1` returned invoice details with 3 usage records

After web config fix:

```bash
npm --prefix apps/web run build
npm --prefix apps/web run lint
```

Build passed. Lint passed with warnings only.

Backend preview was verified with:

```text
GET http://localhost:3000/api/v1/points -> 200
```

and charger data was returned after seeding.

After provider and integration work (`#30`-`#43`):

```bash
npm install
npm --prefix services/integration-service run prisma:generate
npm run build:services
npm --prefix services/provider-service test
npm --prefix services/integration-service test
```

All passed: 10 services build; provider tests 4/4; integration tests 5/5.

## Known Issues / Cautions

- GitHub connector is authorized for the user but not installed on the repo/org, so Codex cannot close or update GitHub issues directly.
- `key.json` contains a secret-looking value. Confirm whether it is real; if real, rotate and remove it.
- Provider console UI already exists at `apps/web/src/app/provider/page.tsx`, but it uses hardcoded data and is not wired to real provider endpoints yet.
- `provider-service` and `integration-service` are fully implemented (`#30`-`#43`). Provider analytics (`#44`/`#45`) and provider billing (`#25`-`#27`) are still open.
- New models (`Provider*`, `ProviderApiConfig`, `ProviderCharger`) and `WebhookSubscription.providerId` require `prisma db push` before the new endpoints work against a live DB. Synced chargers are written into the shared `Charger` table, so they also appear in charger search.
- Prisma schemas are duplicated per service. Provider billing models and the `Role`/Google-auth `User` shape were aligned across the duplicated schemas on this branch, but future schema changes should still be copied consistently.
- `npm run test:cli` fails intentionally because the CLI package test script is a placeholder.

## Suggested Next Billing Plan

If working on provider billing, use this order:

1. Done locally: `#20` Add `ProviderInvoice` model.
2. Done locally: `#21` Add `ProviderPayment` model.
3. Done locally: `#22` Add `ProviderUsageRecord` model.
4. Done locally: `#28` Add billing seed data for one provider invoice.
5. Done locally: `#23` Implement provider invoice listing endpoint.
6. Done locally: `#24` Implement provider invoice details endpoint.
7. `#25` Implement `PayProviderInvoice`.
8. `#26` Add mock provider invoice payment flow.
9. `#27` Add invoice status transitions.

Recommended first implementation: mock provider billing inside `billing-service`, with an `OPEN -> PAID` status transition and no real Stripe provider payment yet.

## How To Update This File

Append short entries when:

- a GitHub issue is completed locally,
- a service/API is added,
- a schema changes,
- a non-obvious setup step is discovered,
- a command is needed to reproduce local state.

Do not paste long logs. Summarize commands and results.
