# Person 5 Issues

Issues visible in the GitHub screenshots for the provider/integration/billing/analytics slice.

## Docs

- [ ] #17 `[Docs] Update README run instructions for split services`
  - Labels: `Task`, `area:docs`

## Provider

- ✅ #13 `[Provider] Create ProviderService skeleton`
  - Labels: `Feature`, `area:provider`
  - GitHub comment: Implemented `services/provider-service` skeleton with Express app, JSON/CORS middleware, health route, provider router mount, TypeScript config, package scripts, and `.env.example`.
- ✅ #29 `[Provider] Create provider-service package and endpoint`
  - Labels: `Feature`, `area:provider`
  - GitHub comment: Added `@saasplug/provider-service` workspace package and `GET /api/v1/providers` skeleton endpoint, wired root `dev/build` scripts, package-lock workspace metadata, API gateway service target, gateway route, and gateway env example.
- ✅ #30 `[Provider] Add Provider, ProviderAccount, ProviderPlan, ProviderSubscription models to Prisma schema`
  - Labels: `Feature`, `area:provider`
  - Done: added `Provider`, `ProviderAccount`, `ProviderPlan`, `ProviderSubscription` + `ProviderStatus`/`SubscriptionStatus` enums to all duplicated Prisma schemas; also added `Charger.providerId`.
- ✅ #31 `[Provider] Implement RegisterProvider, GetProviderProfile, UpdateProviderProfile endpoints`
  - Labels: `Feature`, `area:provider`
  - Done: `POST /api/v1/providers/register`, `GET /api/v1/providers/me`, `PATCH /api/v1/providers/me`.
- ✅ #32 `[Provider] Implement list owned chargers endpoint`
  - Labels: `Feature`, `area:provider`
  - Done: `GET /api/v1/providers/me/chargers`, filtered by `Charger.providerId`.
- ✅ #33 `[Provider] Connect Provider to ProviderAdmin user role`
  - Labels: `Feature`, `area:provider`
  - Done: `ProviderAccount` links Provider<->User; RegisterProvider promotes the user to `PROVIDER_ADMIN` in a transaction.
- ✅ #34 `[Provider] Add provider seed data`
  - Labels: `Feature`, `area:provider`
  - Done: `POST /api/v1/providers/seed-demo` idempotently seeds BASIC/PRO plans + a demo provider with two chargers and a subscription.
- ✅ #35 `[Provider] Add tests for RegisterProvider flow`
  - Labels: `Task`, `area:provider`, `area:testing`
  - Done: vitest suite `registerProvider.test.ts` (401/400/201/409) with a mocked Prisma client.

## Integration

- ✅ #37 `[Integration] Create integration-service package and entrypoint`
  - Labels: `Task`, `area:provider`, `area:testing`
  - Done: `@saasplug/integration-service` workspace package on port 8109, wired into the gateway and root scripts.
- ✅ #38 `[Integration] Add ProviderApiConfig model to Prisma schema`
  - Labels: `Task`, `area:provider`
  - Done: `ProviderApiConfig` model added to all duplicated Prisma schemas.
- ✅ #39 `[Integration] Implement ConfigureProviderAPI endpoint`
  - Labels: `Task`, `area:provider`
  - Done: `POST /api/v1/integration/config` (+ `GET`); upsert per (provider, externalProvider); `apiKey` masked in responses.
- ✅ #40 `[Integration] Add mock ExternalProviderAPI adapter`
  - Labels: `Feature`, `area:provider`
  - Done: redPlug/greenPlug/bluePlug adapters that normalize each contract into a canonical `NormalizedCharger`; mock data by default, real HTTP optional.
- ✅ #41 `[Integration] Implement provider charger sync from mock API`
  - Labels: `Feature`, `area:provider`
  - Done: `POST /api/v1/integration/sync` pulls chargers through the adapter for each enabled config.
- ✅ #42 `[Integration] Store synced chargers as ProviderCharger/Charger records`
  - Labels: `Feature`, `area:provider`
  - Done: `ProviderCharger` model added; sync idempotently upserts `Charger` + `ProviderCharger` records.
- ✅ #43 `[Integration] Add webhook persistence using WebhookSubscription/WebhookEvent`
  - Labels: `Feature`, `area:provider`
  - Done: added `WebhookSubscription.providerId`; webhook subscription/event endpoints; each sync records `WebhookEvent`s.

## Analytics

- [ ] #44 `[Analytics] Create analytics-service package and entrypoint`
  - Labels: `Feature`, `area:provider`
- [ ] #45 `[Analytics] Implement ViewProviderAnalytics endpoint`
  - Labels: `Feature`, `area:analytics`, `area:provider`

## Billing

- ✅ #20 `[Billing] Add ProviderInvoice model to Prisma schema`
  - Labels: `area:billing`, `area:provider`
  - GitHub comment: Added `ProviderInvoice` plus `ProviderInvoiceStatus` to the Prisma schemas, with provider id, invoice number, billing period, status, subtotal/tax/total amounts, due/paid timestamps, and relations to provider usage records/payments.
- ✅ #21 `[Billing] Add ProviderPayment model to Prisma schema`
  - Labels: `Task`, `area:billing`, `area:provider`
  - GitHub comment: Added `ProviderPayment` plus `ProviderPaymentStatus` to the Prisma schemas, linked to `ProviderInvoice` with amount, provider reference, payment status, paid timestamp, and useful provider/status indexes.
- ✅ #22 `[Billing] Add ProviderUsageRecord model to Prisma schema`
  - Labels: `area:billing`, `area:provider`
  - GitHub comment: Added `ProviderUsageRecord` to the Prisma schemas, linked optionally to `ProviderInvoice`, with provider id, source type/id, quantity, billed amount, occurred timestamp, metadata, and lookup indexes.
- ✅ #23 `[Billing] Implement provider invoice listing endpoint`
  - Labels: `Feature`, `area:billing`, `area:provider`
  - GitHub comment: Added authenticated provider/admin `GET /api/v1/payments/provider/invoices` endpoint with optional status and limit filters, scoped to the provider admin user id by default and returning invoice totals plus usage/payment counts.
- ✅ #24 `[Billing] Implement provider invoice details endpoint`
  - Labels: `Task`, `area:billing`, `area:provider`
  - GitHub comment: Added authenticated provider/admin `GET /api/v1/payments/provider/invoices/:id` endpoint, scoped to the provider admin user id, returning invoice totals, billing period, status, usage records, and provider payments.
- [ ] #25 `[Billing] Implement PayProviderInvoice endpoint`
  - Labels: `Feature`, `area:billing`, `area:provider`
- [ ] #26 `[Billing] Add mock provider invoice payment flow`
  - Labels: `Feature`, `area:billing`, `area:provider`
- [ ] #27 `[Billing] Add provider invoice status transitions`
  - Labels: `Feature`, `area:billing`, `area:provider`
- ✅ #28 `[Billing] Add billing seed data for one provider invoice`
  - Labels: `Feature`, `area:billing`, `area:provider`
  - GitHub comment: Added authenticated provider/admin `POST /api/v1/payments/provider/seed-demo-invoice` endpoint that idempotently creates one May 2026 demo provider invoice with usage records for the current provider admin user.

## Current Local Progress

- ✅ #13 `[Provider] Create ProviderService skeleton`
  - GitHub comment: Implemented `services/provider-service` skeleton with Express app, JSON/CORS middleware, health route, provider router mount, TypeScript config, package scripts, and `.env.example`.
- ✅ #29 `[Provider] Create provider-service package and endpoint`
  - GitHub comment: Added `@saasplug/provider-service` workspace package and `GET /api/v1/providers` skeleton endpoint, wired root `dev/build` scripts, package-lock workspace metadata, API gateway service target, gateway route, and gateway env example.
- ✅ #20 `[Billing] Add ProviderInvoice model to Prisma schema`
  - GitHub comment: Added `ProviderInvoice` plus `ProviderInvoiceStatus` to the Prisma schemas, with provider id, invoice number, billing period, status, subtotal/tax/total amounts, due/paid timestamps, and relations to provider usage records/payments.
- ✅ #21 `[Billing] Add ProviderPayment model to Prisma schema`
  - GitHub comment: Added `ProviderPayment` plus `ProviderPaymentStatus` to the Prisma schemas, linked to `ProviderInvoice` with amount, provider reference, payment status, paid timestamp, and useful provider/status indexes.
- ✅ #22 `[Billing] Add ProviderUsageRecord model to Prisma schema`
  - GitHub comment: Added `ProviderUsageRecord` to the Prisma schemas, linked optionally to `ProviderInvoice`, with provider id, source type/id, quantity, billed amount, occurred timestamp, metadata, and lookup indexes.
- ✅ #23 `[Billing] Implement provider invoice listing endpoint`
  - GitHub comment: Added authenticated provider/admin `GET /api/v1/payments/provider/invoices` endpoint with optional status and limit filters, scoped to the provider admin user id by default and returning invoice totals plus usage/payment counts.
- ✅ #24 `[Billing] Implement provider invoice details endpoint`
  - GitHub comment: Added authenticated provider/admin `GET /api/v1/payments/provider/invoices/:id` endpoint, scoped to the provider admin user id, returning invoice totals, billing period, status, usage records, and provider payments.
- ✅ #28 `[Billing] Add billing seed data for one provider invoice`
  - GitHub comment: Added authenticated provider/admin `POST /api/v1/payments/provider/seed-demo-invoice` endpoint that idempotently creates one May 2026 demo provider invoice with usage records for the current provider admin user.
- ✅ #30-#35 `[Provider]` — Prisma models, RegisterProvider/profile/owned-chargers endpoints, ProviderAdmin role link, seed data, RegisterProvider tests. Detail in OPENAI.md "Provider models and endpoints".
- ✅ Billing `providerId` fix — `resolveProviderId` in `billing-service` now resolves the caller to their real `Provider.id` via `ProviderAccount` instead of using `userId`.
- ✅ #37-#43 `[Integration]` — `integration-service`, `ProviderApiConfig`/`ProviderCharger` models, ConfigureProviderAPI, mock ExternalProviderAPI adapter, charger sync, webhook persistence. Detail in OPENAI.md "Integration service".
