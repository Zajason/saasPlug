# Reuse Plan from softeng25-02

Source project:

- `/Users/zak/university/soft-eng/softeng25-02`

Target project:

- `/Users/zak/university/SaaS`

This plan maps reusable work from the previous EV charger application to the
canonical saasPlug service names in [canonical-naming.md](canonical-naming.md).

## 1. Reusable Source Areas

| Source Area | Existing Capability | Target Service |
| --- | --- | --- |
| `front-end/src/app/page.tsx` and map components | Charger map, charger list, charger details | ApiGateway frontend, ChargerService UI flows |
| `front-end/src/app/signin`, `signup` | Existing email/password auth screens | AuthService frontend flows; adapt login to Google OAuth |
| `front-end/src/app/vehicles` | EV catalog and user-owned vehicles | VehicleService |
| `front-end/src/app/billing` | EV user billing history and stats | BillingService |
| `back-end/src/routes/auth.ts` | Authentication endpoints and JWT issuing | AuthService |
| `back-end/src/routes/me.ts` | User profile endpoints | UserService |
| `back-end/src/routes/cars.ts` and `carOwnership.ts` | Car catalog and ownership APIs | VehicleService |
| `back-end/src/routes/chargers.ts`, `points.ts`, `pointstatus.ts` | Charger discovery and status APIs | ChargerService |
| `back-end/src/routes/reserve.ts` | Reservation workflow | ReservationService |
| `back-end/src/routes/newsession.ts`, `sessions.ts`, `charging.ts` | Charging session workflow | SessionService |
| `back-end/src/routes/payment.ts` and payment controller | Stripe payment scaffolding | BillingService |
| `back-end/src/routes/admin/*` | Admin management routes | PlatformOperator workflows; split into ProviderService, ChargerService, AnalyticsService |
| `back-end/src/pricing/*` | Pricing profiles and wholesale price updates | ChargerService / BillingService |
| `back-end/src/redis/*` and `availabilityRedis.ts` | Atomic reservation and availability state | ChargerService / ReservationService |
| `back-end/prisma/schema.prisma` | Current persistence model | Split by canonical persistency entities |
| `documentation/openapi.yaml` | Existing OpenAPI documentation | Seed for service API docs |
| `docker-compose.yml` | Postgres and Redis infrastructure | Base for SaaS Docker deployment |

## 2. Required SaaS Changes

The old project represents a single charger-company application. saasPlug must
act as a SaaS aggregator for many providers.

Required changes:

- Add Provider, ProviderAccount, ProviderApiConfig, ProviderSubscription, ProviderPlan, ProviderInvoice, ProviderPayment, and ProviderUsageRecord.
- Replace free-text `providerName` usage with Provider-owned chargers.
- Keep Invoice for EV user charging invoices and introduce ProviderInvoice for SaaS billing.
- Add provider-facing workflows: RegisterProvider, ConfigureProviderAPI, ViewProviderAnalytics, ViewProviderInvoice, PayProviderInvoice, ExportUsageData.
- Add PlatformOperator workflow: ViewGlobalAnalytics.
- Move customer EV flows into EVUser workflows: LoginWithGoogle, SearchChargers, ViewChargerDetails, CreateReservation, CancelReservation, StartSession, StopSession.
- Split the old backend routes into canonical service boundaries.
- Keep Redis-based reservation locking, but scope charger keys by provider where needed.
- Keep Stripe scaffolding, but separate EV user charging payments from provider SaaS invoice payments.

## 3. Initial Service Split

The previous Express backend can be split as follows:

| Target Service | Seed From Old Project |
| --- | --- |
| AuthService | `auth.ts`, `authController.ts`, `verifyToken.ts`, `optionalToken.ts` |
| UserService | `me.ts`, `meController.ts` |
| VehicleService | `cars.ts`, `carOwnership.ts`, `carsController.ts`, car catalog seeders |
| ChargerService | `chargers.ts`, `points.ts`, `pointstatus.ts`, `adminChargers.ts`, pricing profiles |
| ReservationService | `reserve.ts`, Redis availability logic |
| SessionService | `newsession.ts`, `sessions.ts`, `charging.ts` |
| BillingService | `payment.ts`, `paymentController.ts`, `stripe.ts`, Invoice and ProviderInvoice models |
| ProviderService | New service built around provider registration and API configuration |
| AnalyticsService | New service built from billing/session/charger aggregates |
| IntegrationService | Existing webhook models plus new ExternalProviderAPI polling/sync |
| AuditService | Existing AuditEvent model and cross-service audit writes |

Implemented reusable service folders:

- `services/api-gateway`
- `services/auth-service`
- `services/user-service`
- `services/vehicle-service`
- `services/charger-service`
- `services/reservation-service`
- `services/session-service`
- `services/billing-service`

ProviderService, AnalyticsService, IntegrationService, and AuditService remain
planned canonical services because their main SaaS-specific behavior was not
present in the previous project code.

## 4. Documentation Impact

All UML diagrams and API documentation should use the names from
`canonical-naming.md`. The model should include:

- Use case diagram for EVUser, ProviderAdmin, PlatformOperator, GoogleOAuthProvider, ExternalProviderAPI, and PaymentGateway.
- Activity diagrams for charger search, reservation, provider registration, provider billing payment, provider export, and global analytics.
- Persistency ER or class model using the canonical entities.
- Data struct class model using canonical DTO names.
- API class model using canonical controller/request/response names.
- Component diagram using the canonical microservice names.
- Deployment diagram with Docker containers, ports, Postgres, Redis, and service dependencies.
- Sequence diagrams for the main EVUser and ProviderAdmin flows.
