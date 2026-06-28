# saasPlug

saasPlug is a microservices SaaS platform for electric vehicle charging. It supports EV users, charging infrastructure providers, and platform operators through separate role-based interfaces.

The project demonstrates a complete service-oriented architecture: a Next.js frontend, an API gateway, independently deployed Node/Express microservices, service-owned PostgreSQL databases/schemas, Redis for fast operational state, RabbitMQ for asynchronous domain events, and a Docker Compose deployment that can boot the whole system for demos or grading.

## What The Platform Does

- EV users can search chargers, view details, reserve supported chargers, start/stop charging sessions, manage vehicles, manage payment methods, and view billing history.
- Provider admins can onboard a provider, configure provider APIs, sync chargers, view owned charger statistics, manage SaaS billing/subscriptions, and export usage reports.
- Platform operators can view global provider/charger analytics, global maps, export platform reports, monitor services, and inspect audit events.

## Architecture

```text
Browser / Next.js
      |
      v
ApiGateway
      |
      +--> AuthService
      +--> UserService
      +--> VehicleService
      +--> ChargerService
      +--> ReservationService
      +--> SessionService
      +--> BillingService
      +--> ProviderService
      +--> IntegrationService
      +--> AnalyticsService
      +--> AuditService
      +--> MonitorService
```

Infrastructure:

- PostgreSQL: persistent data, split by service database/schema.
- Redis: fast availability/session/reservation coordination.
- RabbitMQ: asynchronous domain events and audit/read-model updates.
- Docker Compose: local and server deployment.

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS, Radix UI |
| Maps/charts | pigeon-maps, Recharts |
| Backend | Node.js, Express, TypeScript |
| Data | PostgreSQL, Prisma |
| Messaging | RabbitMQ |
| Cache/coordination | Redis |
| Auth | JWT, bcryptjs, Google OAuth support |
| Payments | Stripe SDK with mock fallback |
| Validation | Zod |
| Tests | Vitest, Supertest, CLI smoke tools |
| Deployment | Docker Compose |

## Services

| Service | Internal port | Responsibility |
| --- | ---: | --- |
| `web` | 3000 | Next.js role-based frontend |
| `api-gateway` | 8080 | Single frontend entry point and request router |
| `auth-service` | 8081 | Signup, signin, Google login, JWT roles |
| `user-service` | 8082 | User profile |
| `vehicle-service` | 8083 | EV car catalog and ownership |
| `charger-service` | 8084 | Charger catalog, search, details, status, pricing/admin operations |
| `reservation-service` | 8085 | Reservation lifecycle |
| `session-service` | 8086 | Charging session lifecycle |
| `billing-service` | 8087 | EV user billing and provider SaaS billing |
| `provider-service` | 8088 | Provider registration/profile/account |
| `analytics-service` | 8089 | Provider/global analytics and exports |
| `integration-service` | 8090 | External provider APIs and synced chargers |
| `audit-service` | 8091 | RabbitMQ-backed audit log |
| `monitor-service` | 9090 | Health dashboard and smoke checks |

Each service has its own README under `services/<service>/README.md`.

## External Provider APIs

IntegrationService consumes the NTUA assignment provider APIs:

- `redPlug`: `/points`, `/point/:id`, `/reserve/:id`, `/reserve/:id/:minutes`
- `greenPlug`: `/chargingPoints`, `/chargingPoints/:id`, `/chargingPoints/:id/reservations`
- `bluePlug`: `/locations`, `/location/:id/status`, `/location/:id/hold?minutes=`

The provider adapters normalize different API shapes into the internal charger model. Analytics maps use the synced IntegrationService charger data so provider/operator maps show the full external charger network instead of only seed/demo chargers.

## Configuration

Copy the example env file:

```bash
cp .env.example .env
```

For live NTUA provider APIs, keep mock mode disabled. The compose file already has the demo provider API key default; only uncomment/set the key if you intentionally override it.

```env
INTEGRATION_USE_MOCK=false
# INTEGRATION_DEFAULT_API_KEY=<team-api-key>
```

For offline/demo mode without external API access:

```env
INTEGRATION_USE_MOCK=true
```

For Stripe, use a real test key only in your local/server `.env`; do not commit it.

## Run Locally

```bash
docker compose up -d --build
```

Open:

- Web: http://localhost:3000
- API health: http://localhost:8080/api/health
- Monitor: http://localhost:9090
- RabbitMQ management: http://localhost:15672 (`guest` / `guest`)

Reset all data:

```bash
docker compose down -v
docker compose up -d --build
```

## Presentation / Server Run

Set the host ports in `.env` or use the template values:

```env
PUBLIC_HOST=147.102.112.123
WEB_PORT=3302
API_GATEWAY_PORT=4402
MONITOR_PORT=5502
POSTGRES_PORT=6602
REDIS_PORT=7702
RABBITMQ_AMQP_PORT=8802
RABBITMQ_MANAGEMENT_PORT=9902
```

Then run:

```bash
docker compose up -d --build
```

Server URLs:

- Web: `http://147.102.112.123:3302`
- API health: `http://147.102.112.123:4402/api/health`
- Monitor: `http://147.102.112.123:5502`
- RabbitMQ management: `http://147.102.112.123:9902`

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| EV user | `user@saasplug.local` | `admin123` |
| redPlug provider admin | `red@saasplug.local` | `admin123` |
| greenPlug provider admin | `green@saasplug.local` | `admin123` |
| bluePlug provider admin | `blue@saasplug.local` | `admin123` |
| Platform operator | `operator@saasplug.local` | `admin123` |

## Useful Commands

Build frontend:

```bash
npm --prefix apps/web run build
```

Build all services:

```bash
npm run build:services
```

Run selected service tests:

```bash
npm --prefix services/billing-service test
npm --prefix services/provider-service test
npm --prefix services/integration-service test
```

Check external charger sync after startup:

```bash
docker compose logs db-init | grep Synced
```

If maps show only demo chargers, check that `.env` did not override the provider key with `sk_saas_replace_me`, then check:

```bash
grep INTEGRATION_USE_MOCK .env
docker compose logs db-init | grep Synced
docker compose up -d --build integration-service analytics-service charger-service api-gateway web
```

## Documentation

- Architecture and UML: `architecture/`
- Study guide: `docs/project-study-guide.md`
- AI usage log: `docs/ai-usage-log.md`
- Provider OpenAPI specs: `docs/provider-apis/`
- CLI tools: `tools/cli-client/`

## Notes

This repository is a personal portfolio copy of an academic project. Keep runtime secrets in `.env` only and avoid committing real API keys.
