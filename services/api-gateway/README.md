# ApiGateway

Routes frontend `/api/v1/*` requests to the correct internal service.

## Runtime

- Package: `services/api-gateway`
- Internal Docker port: `8080`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `GET /api/health`
- `Proxy routes based on path prefixes`


## Development

From the repository root:

```bash
npm run dev:gateway
npm run build:gateway
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
