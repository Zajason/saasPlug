# NTUA ECE SAAS 2026 PROJECT

[![CI](https://github.com/ntua/saas26-02/actions/workflows/ci.yml/badge.svg)](https://github.com/ntua/saas26-02/actions/workflows/ci.yml)

## TEAM (XX)

Περιγραφή - οδηγίες

Περιέχονται φάκελοι για 15 microservices. Ο αριθμός είναι εντελώς ενδεικτικός. Δημιουργήστε ακριβώς όσα απαιτούνται από τη λύση σας.

## Architecture Notes

- Canonical naming and consistency sheet: [architecture/canonical-naming.md](architecture/canonical-naming.md)
- Reuse plan from the previous EV charger project: [architecture/reuse-plan-from-softeng25-02.md](architecture/reuse-plan-from-softeng25-02.md)
- PlantUML model for the SaaS assignment: [architecture/saasplug-uml.md](architecture/saasplug-uml.md)

## Reused Code from softeng25-02

The first implementation pass imports only code that already existed in the
previous EV charger project:

- [apps/web](apps/web): reused Next.js EV user frontend.
- [services/api-gateway](services/api-gateway): routing gateway for the split services.
- [services/auth-service](services/auth-service): reused authentication code.
- [services/user-service](services/user-service): reused profile and user-account code.
- [services/vehicle-service](services/vehicle-service): reused car catalog and ownership code.
- [services/charger-service](services/charger-service): reused charger discovery, status, pricing, and Redis availability code.
- [services/reservation-service](services/reservation-service): reused charger reservation code.
- [services/session-service](services/session-service): reused charging session code.
- [services/billing-service](services/billing-service): reused EV user payment and invoice code.
- [services/provider-service](services/provider-service): provider registration, profile, API configuration, SaaS subscription, and provider-owned charger code.
- [services/integration-service](services/integration-service): webhook subscription and delivery code.
- [services/audit-service](services/audit-service): RabbitMQ-backed immutable audit log for cross-service domain events.
- [tools/cli-client](tools/cli-client): reused CLI client.
- [docs/reused-openapi/openapi.yaml](docs/reused-openapi/openapi.yaml): reused OpenAPI specification.
- [infra/docker-compose.reused.yml](infra/docker-compose.reused.yml): reused Postgres and Redis compose file.

## Presentation Run (Lab Server — Team 02)

The `.env` file in the repository root is pre-configured for the NTUA lab server (`147.102.112.123`) with team-02 ports. After SSH-ing in and pulling the repo, just run:

```bash
git pull
docker compose up -d --build
```

The web app will be available at **http://147.102.112.123:3302** (softlab network only).

| Service | Host port |
| --- | --- |
| Web app | 3302 |
| API Gateway | 4402 |
| Monitor | 5502 |
| Postgres | 6602 |
| Redis | 7702 |
| RabbitMQ AMQP | 8802 |
| RabbitMQ Management | 9902 |

To **test locally** before the presentation (replaces `147.102.112.123` with `localhost`):

```bash
PUBLIC_HOST=localhost docker compose up -d --build
```

Then open http://localhost:3302.

To reset all data and reseed on the server:

```bash
docker compose down -v
docker compose up -d --build
```

---

## Docker Grading Run

The root [docker-compose.yml](docker-compose.yml) is the standalone grading setup. It starts Postgres, Redis, RabbitMQ, the API gateway, the implemented microservices, a database initialization/seed job, and the Next.js web app.

Each persistent microservice uses its own PostgreSQL database and schema namespace. The `db-init` job creates these databases, pushes the matching reduced Prisma schema from that service folder, and seeds consistent demo data into each service store so the existing workflows keep working in the split-database setup.

The service schemas are intentionally not identical: each one contains only the tables that service owns or currently needs as local read models. The shared generated Prisma client still comes from [services/prisma-client/schema.prisma](services/prisma-client/schema.prisma), which keeps the current TypeScript service code working until every service imports a dedicated generated client.

AuthService also receives `REPLICA_DATABASE_URLS` in Docker. When a new EV user signs up or signs in through Google for the first time, AuthService creates the canonical auth row and replicates that user identity into the other service databases so existing `userId`-based workflows continue to work across service boundaries.

| Service | Database | PostgreSQL schema |
| --- | --- | --- |
| AuthService | `saasplug_auth` | `auth_service` |
| UserService | `saasplug_user` | `user_service` |
| VehicleService | `saasplug_vehicle` | `vehicle_service` |
| ChargerService | `saasplug_charger` | `charger_service` |
| ReservationService | `saasplug_reservation` | `reservation_service` |
| SessionService | `saasplug_session` | `session_service` |
| BillingService | `saasplug_billing` | `billing_service` |
| ProviderService | `saasplug_provider` | `provider_service` |
| IntegrationService | `saasplug_integration` | `integration_service` |
| AnalyticsService | `saasplug_analytics` | `analytics_service` |
| AuditService | `saasplug_audit` | `audit_service` |

Prerequisite: Docker Desktop or Docker Engine must be running.

By default the Docker stack uses the live NTUA provider APIs for `redPlug`, `greenPlug`, and `bluePlug` with the team API key configured in backend environment variables. During database initialization it attempts to sync chargers from:

- `https://davinci.softlab.ntua.gr/saas26/redPlug/api/points`
- `https://davinci.softlab.ntua.gr/saas26/greenPlug/api/chargingPoints`
- `https://davinci.softlab.ntua.gr/saas26/bluePlug/api/locations`

To run offline with the built-in mock provider data instead:

```bash
INTEGRATION_USE_MOCK=true docker compose up --build
```

Start everything from the repository root:

```bash
docker compose up --build
```

To use real Stripe test payments, provide your Stripe **secret** test key as an environment variable:

```bash
STRIPE_SECRET_KEY=sk_test_your_secret_key docker compose up --build
```

If one of the default host ports is already in use, override only the host-side port. For example, if `8080` is busy:

```bash
API_GATEWAY_PORT=18080 docker compose up --build --force-recreate
```

Then use `http://localhost:18080/api/health` for the gateway. Similar overrides exist for `WEB_PORT`, `MONITOR_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `RABBITMQ_AMQP_PORT`, and `RABBITMQ_MANAGEMENT_PORT`.

Open:

- Web app: http://localhost:3000
- EV user UI: http://localhost:3000
- Provider UI: http://localhost:3000/provider
- Platform operator UI: http://localhost:3000/operator
- API gateway health: http://localhost:8080/api/health
- Audit events API: http://localhost:8080/api/v1/audit/events (`PLATFORM_OPERATOR` token required)
- RabbitMQ management UI: http://localhost:15672 (`guest` / `guest`)

Seeded demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| EV user | user@saasplug.local | admin123 |
| redPlug provider admin | red@saasplug.local | admin123 |
| greenPlug provider admin | green@saasplug.local | admin123 |
| bluePlug provider admin | blue@saasplug.local | admin123 |
| Platform operator | operator@saasplug.local | admin123 |

The Compose stack exposes Postgres on `localhost:5432`, Redis on `localhost:6379`, RabbitMQ AMQP on `localhost:5672`, RabbitMQ management on `localhost:15672`, the API gateway on `localhost:8080`, the monitor on `localhost:9090`, and the frontend on `localhost:3000`. The individual services run inside the Docker network on ports `8081` through `8091`.

## RabbitMQ Messaging

The app uses RabbitMQ as the service-to-service domain event backbone. Services publish durable topic messages to the `saasplug.events` exchange. `IntegrationService` consumes the `integration.webhook-events` queue to create `WebhookEvent` rows for provider webhook subscriptions, and `AuditService` consumes the `audit.events` queue to persist `AuditEvent` rows for cross-service traceability.

Current event routing keys:

- `provider.registered`
- `reservation.created`
- `reservation.cancelled`
- `session.started`
- `session.stopped`
- `billing.provider_invoice.created`
- `billing.provider_invoice.paid`
- `integration.chargers.synced`

Useful overrides:

```bash
RABBITMQ_AMQP_PORT=5673 RABBITMQ_MANAGEMENT_PORT=15673 docker compose up --build
```

Set `MESSAGING_ENABLED=false` only for local debugging without RabbitMQ.

Stop the stack:

```bash
docker compose down
```

Reset all data and reseed:

```bash
docker compose down -v
docker compose up --build
```

Run the reused pieces with:

```bash
npm run dev:gateway
npm run dev:auth
npm run dev:user
npm run dev:vehicle
npm run dev:charger
npm run dev:reservation
npm run dev:session
npm run dev:billing
npm run dev:provider
npm run dev:integration
npm run dev:analytics
npm run dev:audit
npm run dev:monitor
npm run dev:web
```

## Billing Service

The billing-service (port `8087`) handles two billing domains:

### EV User Payments (`/api/v1/payments`)

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/create-setup-intent` | Create Stripe SetupIntent for card saving |
| POST | `/save-method` | Save payment method (Stripe or mock) |
| POST | `/charge` | Charge a completed session |
| GET | `/history` | User's billing history with invoices |
| POST | `/pay-balance` | Pay outstanding balance |

### Provider SaaS Billing (`/api/v1/payments/provider`)

Requires `PROVIDER_ADMIN` or `PLATFORM_OPERATOR` role.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/invoices` | List provider invoices (`?status=`, `?providerId=`, `?limit=`) |
| GET | `/invoices/:id` | Invoice details with usage records and payments |
| POST | `/invoices/:id/pay` | Pay a provider invoice (mock or Stripe) |
| POST | `/seed-demo-invoice` | Create demo invoice with 3 usage records |

### Billing Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8087` | Service port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | — | Shared JWT secret |
| `STRIPE_SECRET_KEY` | `sk_test_replace_me` | Stripe API key (mock mode if placeholder) |
| `MESSAGING_ENABLED` | `true` | Enable RabbitMQ domain events |

### Running Billing Tests

```bash
cd services/billing-service
npm install
npx prisma generate
npm test
```
