# AuthService

Owns authentication, signup, signin, Google login, and JWT role creation.

## Runtime

- Package: `services/auth-service`
- Internal Docker port: `8081`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/signin`
- `POST /api/v1/auth/google`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:auth
npm run build:auth
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
