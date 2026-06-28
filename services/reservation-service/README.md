# ReservationService

Owns reservation lifecycle and bridges provider-backed reservation calls through IntegrationService.

## Runtime

- Package: `services/reservation-service`
- Internal Docker port: `8085`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `POST /api/v1/reserve/:id`
- `POST /api/v1/reserve/:id/:minutes`
- `POST /api/v1/reserve/:id/cancel`
- `GET /api/v1/internal/reservations/active`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:reservation
npm run build:reservation
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
