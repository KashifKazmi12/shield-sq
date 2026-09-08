#!/bin/sh
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting SQSecure..."
exec "$@"
