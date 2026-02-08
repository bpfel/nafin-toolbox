#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "Stopping containers and wiping DB volume..."
docker compose down -v

echo "Building and starting containers..."
docker compose up -d --build

echo "Waiting for API..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:8081/api/health > /dev/null 2>&1; then
    echo "API is healthy."
    break
  fi
  sleep 1
done

echo ""
docker compose ps
echo ""
echo "Frontend: http://localhost:3000"
echo "API:      http://localhost:8081/api"
