#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Pulling latest code..."
git pull --ff-only

echo "Rebuilding and restarting containers..."
sudo docker compose --env-file .env.server -f docker-compose.server.yml up -d --build

echo "Container status:"
sudo docker compose --env-file .env.server -f docker-compose.server.yml ps

echo "API health:"
curl -fsS http://127.0.0.1/api/health
echo

echo "Update complete. Open http://8.160.180.16 and press Ctrl+F5 if the old page is cached."
