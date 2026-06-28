# VehicleService

Owns EV car catalog and user car ownership.

## Runtime

- Package: `services/vehicle-service`
- Internal Docker port: `8083`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `GET /api/v1/cars/search`
- `GET /api/v1/car-ownership`
- `POST /api/v1/car-ownership/:carId`
- `DELETE /api/v1/car-ownership/:ownershipId`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:vehicle
npm run build:vehicle
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
