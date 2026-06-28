#!/usr/bin/env bash
# Team 02 — presentation startup script
# Run this on the lab server (147.102.112.123) after git pull.
# Ports: 33xx web | 44xx API gateway | 55xx monitor | 66xx postgres | 77xx redis | 88xx rabbit AMQP | 99xx rabbit mgmt

set -e

# Allow overriding PUBLIC_HOST for local testing: PUBLIC_HOST=localhost bash start-presentation.sh
PUBLIC_HOST=${PUBLIC_HOST:-147.102.112.123} \
WEB_PORT=3302 \
API_GATEWAY_PORT=4402 \
MONITOR_PORT=5502 \
POSTGRES_PORT=6602 \
REDIS_PORT=7702 \
RABBITMQ_AMQP_PORT=8802 \
RABBITMQ_MANAGEMENT_PORT=9902 \
INTEGRATION_USE_MOCK=true \
MESSAGING_ENABLED=true \
docker compose up -d --build

echo ""
echo "=== Team 02 — services starting ==="
echo "  Web app  : http://147.102.112.123:3302"
echo "  API GW   : http://147.102.112.123:4402/api/v1"
echo "  Monitor  : http://147.102.112.123:5502"
echo ""
echo "Wait ~60s for db-init + seed to finish, then check:"
echo "  docker compose logs -f db-init"
