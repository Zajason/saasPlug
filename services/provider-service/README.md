# ProviderService

Owns provider registration, profile, account ownership, subscription references, and owned charger views.

## Runtime

- Package: `services/provider-service`
- Internal Docker port: `8088`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `POST /api/v1/providers/register`
- `GET /api/v1/providers/me`
- `PATCH /api/v1/providers/me`
- `GET /api/v1/providers/me/chargers`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:provider
npm run build:provider
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
