# SessionService

Owns charging session start/stop/history.

## Runtime

- Package: `services/session-service`
- Internal Docker port: `8086`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `POST /api/v1/newsession`
- `GET /api/v1/sessions/my-history`
- `POST /api/v1/charging/start`
- `POST /api/v1/charging/stop`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:session
npm run build:session
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
