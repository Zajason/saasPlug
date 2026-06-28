# AnalyticsService

Owns provider/global analytics, date-ranged reports, CSV/JSON export jobs, and map statistics.

## Runtime

- Package: `services/analytics-service`
- Internal Docker port: `8089`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `GET /api/v1/analytics/provider`
- `GET /api/v1/analytics/global`
- `POST /api/v1/analytics/exports`
- `GET /api/v1/analytics/exports`
- `GET /api/v1/analytics/exports/:id/download`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:analytics
npm run build:analytics
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
