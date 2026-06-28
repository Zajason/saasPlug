# ChargerService

Owns searchable charger catalog, charger details, statuses, and admin/pricing operations.

## Runtime

- Package: `services/charger-service`
- Internal Docker port: `8084`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `GET /api/v1/points`
- `GET /api/v1/points/:id`
- `GET /api/v1/chargers`
- `GET /api/v1/chargers/:id`
- `GET /api/v1/pointstatus/:id/:from/:to`
- `POST /api/v1/admin/chargers`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:charger
npm run build:charger
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
