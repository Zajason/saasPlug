# AuditService

Consumes RabbitMQ domain events and stores operator-visible audit events.

## Runtime

- Package: `services/audit-service`
- Internal Docker port: `8091`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `GET /api/v1/audit/events`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:audit
npm run build:audit
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
