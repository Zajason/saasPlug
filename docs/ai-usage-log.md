# AI Usage Log for saasPlug

This document summarizes the work completed with AI assistance during the development of the saasPlug SaaS project for the 2025-2026 Software Service Technologies assignment.

## Project Context

The project started from a previous non-SaaS electric vehicle charging application and was adapted into a microservices SaaS platform. The target system allows EV users to find and reserve chargers, providers to register and manage charging infrastructure through the platform, and platform operators to view global operational data.

AI assistance was used as a development collaborator for code migration, architecture decisions, UI implementation, Docker setup, provider API integration, analytics, messaging, monitoring, and documentation consistency.

## Main AI-Assisted Work

### 1. Canonical Naming and Consistency

We created and used a canonical naming sheet for the whole project. This defined the official names for actors, services, DTOs, controllers, API request/response objects, entities, enums, and relationships.

Important decisions:

- Use `EVUser`, `ProviderAdmin`, and `PlatformOperator` as the main actors.
- Use service names such as `AuthService`, `ChargerService`, `ReservationService`, `ProviderService`, `BillingService`, `AnalyticsService`, `IntegrationService`, and `AuditService`.
- Keep separate names for EV-user invoices and SaaS provider invoices: `Invoice` and `ProviderInvoice`.
- Use consistent DTO and request/response naming across diagrams and implementation.

The result was saved into the architecture documentation and used as the basis for later code and diagram updates.

### 2. Code Reuse From Previous Project

AI helped inspect the previous semester project and identify reusable parts for the SaaS version. Reused or adapted areas included:

- EV user authentication/profile concepts.
- Vehicle and car ownership logic.
- Charger search and charger detail models.
- Reservation and session flows.
- Existing UI style and component structure for the client-side frontend.

The reused work was split into microservices instead of being kept as one monolithic application.

### 3. Microservices Architecture

AI helped split the application into independent services:

- `api-gateway`
- `auth-service`
- `user-service`
- `vehicle-service`
- `charger-service`
- `reservation-service`
- `session-service`
- `billing-service`
- `provider-service`
- `integration-service`
- `analytics-service`
- `audit-service`
- `monitor-service`
- `web`

The API Gateway became the main synchronous orchestrator for frontend requests. RabbitMQ was later added for asynchronous service-to-service communication.

### 4. Docker Compose and Deployment

AI helped create and iterate on a complete `docker-compose.yml` so the project can run as a standalone grading/demo environment.

The Compose stack includes:

- Frontend web app.
- API gateway.
- All backend microservices.
- PostgreSQL.
- Redis.
- RabbitMQ with management UI.
- Health monitor service.

The Docker setup was updated multiple times to:

- Add all services to the build.
- Add database initialization.
- Seed demo data.
- Support port overrides when default host ports are already in use.
- Align service ports with the deployment model.

### 5. Provider API Integration

AI helped integrate the professor-provided provider APIs for:

- `redPlug`
- `greenPlug`
- `bluePlug`

The Postman collection information was used to implement provider-specific adapters. The integration layer normalizes different endpoint shapes into the internal charger model.

Provider support differences were also reflected in the app. For example, if a provider does not support reservation through its API, the UI avoids showing a reservation action and displays a message instead.

### 6. Role-Based Frontend

AI helped convert the frontend from a single user-facing app into a role-aware interface.

The app now changes depending on login role:

- EV users see charger search, map, reservations, sessions, billing, profile, and vehicles.
- Provider admins see dashboard, owned charger map, charger statistics, provider billing, subscription management, analytics, exports, and provider profile/onboarding views.
- Platform operators see global dashboard, global charger map/statistics, provider overview, operations, analytics, and global exports.

This was done because provider admins and platform operators should not see normal EV user screens such as charger reservation as their main experience.

### 7. Provider Onboarding and Signup

AI helped design and implement provider signup/onboarding.

The implementation supports:

- Separate provider signup entry point.
- Provider company/account details.
- Provider API configuration.
- Provider user creation.
- Replication of required provider/user records into service databases.

This was added because provider registration is an explicit assignment requirement.

### 8. Analytics and Exports

AI helped implement analytics functionality for providers and platform operators.

Provider analytics include:

- Usage summaries.
- Revenue/usage metrics.
- Owned charger statistics.
- Exportable usage reports.

Operator analytics include:

- Global usage statistics.
- Provider comparisons.
- Platform-wide charger/session data.
- Global export reports.

The export UI was refined so users select an export type first and then explicitly create a new export, instead of each tab button immediately starting an export.

CSV exports were added for multiple report types, including provider usage and per-charger analytics. Previous export authentication issues were fixed so download requests include the user token.

### 9. RabbitMQ Messaging

AI helped add RabbitMQ as the project’s asynchronous messaging backbone.

RabbitMQ is used for service-to-service domain events. Services publish events such as:

- Provider registration.
- Reservation creation/cancellation.
- Session start/stop.
- Provider invoice creation/payment.
- Charger sync events.

This supports a more realistic microservices design where services do not need to synchronously call each other for every side effect.

### 10. Audit Service

AI helped implement the `AuditService`.

The audit service:

- Runs as an independent microservice.
- Uses RabbitMQ to consume domain events.
- Persists normalized `AuditEvent` records.
- Exposes audit events through an operator-protected API endpoint.
- Has its own database/schema.
- Is included in Docker Compose and the monitor service.

This service provides traceability for important cross-service actions.

### 11. Monitor / Health Microservice

AI helped add a monitor service that displays health/status information for the running stack.

The monitor checks:

- API gateway.
- Backend service health endpoints.
- PostgreSQL.
- Redis.
- RabbitMQ.
- Provider API reachability/status where applicable.

This provides a useful demo and testing aid beyond normal unit/API tests.

### 12. Database Separation

AI helped move from one shared database assumption toward a more microservice-oriented database setup.

The final Docker setup creates separate PostgreSQL databases/schemas per service, while still using a shared generated Prisma client for the current TypeScript implementation. This keeps the app working while keeping service data ownership explicit.

### 13. UI Polish and Bug Fixes

AI helped fix several UI and UX issues:

- Role-based navigation.
- Provider dashboard and map.
- Operator dashboard and map.
- Provider profile changes.
- Subscription management screen.
- Export tabs and active states.
- Scrollability problems in provider/operator screens.
- Button styling and selected-tab contrast.
- Provider signup page scrollability.

The goal was to make the app usable in demo conditions and avoid confusing UI for different roles.

### 14. Test Planning

AI helped define what `npm test` should eventually cover:

- Unit tests for services and provider adapters.
- Integration tests for auth, reservations, analytics, exports, and audit events.
- API smoke tests for health endpoints and authorization.
- Frontend tests for role-specific routing and UI behavior.
- Separate live provider API tests for VPN/network-dependent checks.

The recommendation was that default `npm test` should use mocks and not depend on the professor’s live provider APIs.

### 15. Project Management

AI helped split the work across six team members and organize it into a two-week sprint.

The plan included work streams for:

- Provider integration/onboarding.
- Billing/payment.
- Analytics/export.
- Frontend role-based UI.
- Docker/project management/testing.
- Core EV user flows.

AI also helped explain how to create and manage GitHub Projects and issues for the sprint.

### 16. Documentation and Diagrams

AI helped keep documentation aligned with implementation:

- README updates.
- Docker run instructions.
- Service/port descriptions.
- Architecture consistency notes.
- PlantUML architecture updates.
- RabbitMQ messaging descriptions.
- Audit service documentation.

The diagrams were reviewed against the implementation so service names, ports, responsibilities, and communication patterns stayed consistent.

## Verification Performed With AI Assistance

During development, AI helped run and interpret:

- `docker compose config`
- `docker compose build`
- `docker compose up --build --force-recreate`
- `npm run build:web`
- `npm run build:services`
- Service-specific TypeScript builds.
- API health checks with `curl`.
- Local frontend preview checks.

When Docker port conflicts occurred, AI helped identify the conflicting host ports and introduced environment-variable overrides for local testing.

## Human Decisions and Review

Human project decisions included:

- Which features were required by the assignment.
- Which UI behavior made sense for each role.
- Which team member should own each work area.
- Whether RabbitMQ should be used for service-to-service messaging.
- Whether provider signup should support new providers beyond the three professor-provided APIs.
- Which features should be prioritized for demo readiness.

AI generated code and documentation suggestions, but the project direction and acceptance of changes were decided by the student/team.

## Known Limitations

- Live provider API behavior depends on network/VPN availability.
- Some payment behavior uses test/demo configuration.
- The current Prisma client is shared for implementation convenience, even though service databases/schemas are separated.
- More automated tests should be added for full grading confidence.
- The monitor service is a custom project health UI, not a replacement for production observability.

## Summary

AI was used as a coding and architecture assistant throughout the project. The main value was in accelerating migration from the previous EV charging app to a SaaS microservices system, keeping naming and diagrams consistent, implementing provider/operator features, integrating external provider APIs, building Docker deployment, adding RabbitMQ messaging, and documenting the final system.
