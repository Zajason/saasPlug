# UserService

Owns user profile data.

## Runtime

- Package: `services/user-service`
- Internal Docker port: `8082`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `GET /api/v1/me`
- `PATCH /api/v1/me`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:user
npm run build:user
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
