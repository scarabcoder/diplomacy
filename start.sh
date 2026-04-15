#!/bin/sh
set -e

echo "Starting server..."
exec bun run server.ts
