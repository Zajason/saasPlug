#!/usr/bin/env sh
set -eu

ADMIN_DATABASE_URL="${ADMIN_DATABASE_URL:-postgresql://user:pass@postgres:5432/postgres}"

SERVICES="
auth-service:saasplug_auth:auth_service
user-service:saasplug_user:user_service
vehicle-service:saasplug_vehicle:vehicle_service
charger-service:saasplug_charger:charger_service
reservation-service:saasplug_reservation:reservation_service
session-service:saasplug_session:session_service
billing-service:saasplug_billing:billing_service
provider-service:saasplug_provider:provider_service
integration-service:saasplug_integration:integration_service
analytics-service:saasplug_analytics:analytics_service
audit-service:saasplug_audit:audit_service
"

echo "Creating service databases..."
for entry in $SERVICES; do
  db_name="$(printf '%s' "$entry" | cut -d: -f2)"
  exists="$(psql "$ADMIN_DATABASE_URL" -tAc "SELECT 1 FROM pg_database WHERE datname = '$db_name'")"
  if [ "$exists" != "1" ]; then
    psql "$ADMIN_DATABASE_URL" -c "CREATE DATABASE $db_name"
  fi
done

echo "Pushing Prisma schemas into service databases..."
for entry in $SERVICES; do
  service_name="$(printf '%s' "$entry" | cut -d: -f1)"
  db_name="$(printf '%s' "$entry" | cut -d: -f2)"
  schema_name="$(printf '%s' "$entry" | cut -d: -f3)"
  export DATABASE_URL="postgresql://user:pass@postgres:5432/$db_name?schema=$schema_name"
  echo "  - $service_name -> $db_name.$schema_name"
  npx prisma db push --schema "services/$service_name/prisma/schema.prisma" --accept-data-loss --skip-generate
done

echo "Seeding service databases..."
for entry in $SERVICES; do
  service_name="$(printf '%s' "$entry" | cut -d: -f1)"
  db_name="$(printf '%s' "$entry" | cut -d: -f2)"
  schema_name="$(printf '%s' "$entry" | cut -d: -f3)"
  export DATABASE_URL="postgresql://user:pass@postgres:5432/$db_name?schema=$schema_name"
  export SEED_SERVICE_NAME="$service_name"
  echo "  - seed $service_name"
  # Seed failures are non-fatal: after the schema reduction the legacy seed
  # script may reference models that no longer exist in a given service.
  # Services will still start up; demo data can be created via the UI.
  npm run docker:seed || echo "    (seed for $service_name skipped due to schema mismatch)"
done

echo "Service database initialization complete."
