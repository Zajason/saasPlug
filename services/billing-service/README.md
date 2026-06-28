# BillingService

Owns EV user payments and provider SaaS billing.

## Runtime

- Package: `services/billing-service`
- Internal Docker port: `8087`
- Health endpoint: `GET /api/health`

## Main Endpoints

- `POST /api/v1/payments/create-setup-intent`
- `GET /api/v1/payments/methods`
- `GET /api/v1/payments/history`
- `GET /api/v1/payments/provider/subscription`
- `GET /api/v1/payments/provider/invoices`
- `GET /api/health`


## Development

From the repository root:

```bash
npm run dev:billing
npm run build:billing
```

In Docker this service is started by `docker-compose.yml` with its own container and environment variables.

## Architecture Notes

- Public browser traffic reaches this service through ApiGateway unless otherwise noted.
- Persistent services use a service-owned PostgreSQL database/schema.
- JWT-protected endpoints validate the shared token and role claims.
- Cross-service side effects should use RabbitMQ events or explicit internal HTTP endpoints, not cross-service database joins.
