# MonitorService

Provides the health dashboard and checks service, infrastructure, gateway, login, and provider API status.

## Runtime

- Package: `services/monitor-service`
- Internal Docker port: `9090`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `GET /`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:monitor
npm run build:monitor
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
