#!/bin/sh
set -e

echo "Running database migrations..."
bun run migrate.ts

echo "Starting server..."
exec bun run server.ts
