#!/bin/bash
set -e

echo "==> Waiting for PostgreSQL..."
until php -r "new PDO('pgsql:host=${DB_HOST};port=${DB_PORT:-5432};dbname=${DB_DATABASE}', '${DB_USERNAME}', '${DB_PASSWORD}');" 2>/dev/null; do
  echo "    PostgreSQL not ready — retrying in 3s..."
  sleep 3
done
echo "==> PostgreSQL is ready."

# Full wipe: set APP_RESET_ON_BOOT=true in HostForge before deploying to
# drop every table, re-migrate from scratch, and re-seed the base auth
# data (roles/permissions + super admin). Numbering restarts; super admin
# becomes user #1 (SA-0001), so the next employee is EMP-00002.
# Set it back to false after the reset deploy, or keep it unset.
if [ "${APP_RESET_ON_BOOT:-false}" = "true" ]; then
    echo "==> APP_RESET_ON_BOOT=true — wiping and re-creating database..."
    php artisan migrate:fresh --force
    php artisan db:seed --class=RolesAndPermissionsSeeder --force
    php artisan db:seed --class=SuperAdminSeeder --force
    php artisan db:seed --class=TitleSeeder --force
    echo "==> Database reset complete."
else
    echo "==> Running migrations..."
    php artisan migrate --force
fi

echo "==> Creating storage link..."
php artisan storage:link --force 2>/dev/null || true

echo "==> Seeding roles & permissions (idempotent)..."
php artisan db:seed --class=RolesAndPermissionsSeeder --force
php artisan db:seed --class=SuperAdminSeeder --force
php artisan db:seed --class=TitleSeeder --force

echo "==> Caching config, routes, views..."
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo "==> Starting supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
