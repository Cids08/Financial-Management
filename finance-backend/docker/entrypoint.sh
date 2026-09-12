#!/bin/bash
set -e

echo "==> Waiting for PostgreSQL..."
until php -r "new PDO('pgsql:host=${DB_HOST};port=${DB_PORT:-5432};dbname=${DB_DATABASE}', '${DB_USERNAME}', '${DB_PASSWORD}');" 2>/dev/null; do
  echo "    PostgreSQL not ready — retrying in 3s..."
  sleep 3
done
echo "==> PostgreSQL is ready."

echo "==> Running migrations..."
php artisan migrate --force

echo "==> Creating storage link..."
php artisan storage:link --force 2>/dev/null || true

echo "==> Seeding roles & permissions (idempotent)..."
php artisan db:seed --class=RolesAndPermissionsSeeder --force
php artisan db:seed --class=SuperAdminSeeder --force

echo "==> Caching config, routes, views..."
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo "==> Starting supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
