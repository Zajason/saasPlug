# IntegrationService

Owns external provider API adapters, provider API configuration, charger sync, and webhook records.

## Runtime

- Package: `services/integration-service`
- Internal Docker port: `8090`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `POST /api/v1/integration/config`
- `GET /api/v1/integration/config`
- `POST /api/v1/integration/sync`
- `GET /api/v1/integration/chargers`
- `GET /api/v1/internal/provider-chargers`
- `POST /api/v1/internal/provider-chargers/:chargerId/reserve`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:integration
npm run build:integration
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
