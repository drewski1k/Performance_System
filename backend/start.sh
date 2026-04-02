#!/bin/bash
set -e

echo "Waiting for database..."
until python -c "import psycopg2; psycopg2.connect('$DATABASE_URL')" 2>/dev/null; do
  sleep 1
done

echo "Running migrations..."
alembic upgrade head

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
