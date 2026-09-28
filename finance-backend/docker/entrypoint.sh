#!/bin/bash
set -e

echo "==> Waiting for PostgreSQL..."
until php -r "new PDO('pgsql:host=${DB_HOST};port=${DB_PORT:-5432};dbname=${DB_DATABASE}', '${DB_USERNAME}', '${DB_PASSWORD}');" 2>/dev/null; do
  echo "    PostgreSQL not ready — retrying in 3s..."
  sleep 3
done
echo "==> PostgreSQL is ready."

# Fail fast if APP_KEY is missing — without it Laravel can't decrypt
# sessions/cookies and every request will throw a 500 with a cryptic error.
if [ -z "${APP_KEY}" ]; then
    echo "ERROR: APP_KEY environment variable is not set. Set it in HostForge env vars and redeploy."
    exit 1
fi

# Echo the resolved DB target so a bad deploy is obvious instead of silent.
# config/database.php maps "DB_HOST set but DB_CONNECTION unset" to pgsql;
# if it ever shows sqlite while DB_HOST is set, the Postgres env vars are
# not reaching this container and every redeploy would wipe the data.
echo "==> DB_CONNECTION=${DB_CONNECTION:-auto} DB_HOST=${DB_HOST:-(none)} DB_DATABASE=${DB_DATABASE:-(unset)}"
php artisan tinker --execute="echo '==> Laravel will use the [' . config('database.default') . '] connection' . PHP_EOL;"

# Full wipe & re-seed for defense / deployment:
# Set APP_RESET_ON_BOOT=true in HostForge before deploying to drop every table,
# re-migrate from scratch, and seed the entire defense dataset (10+ master records,
# 6 months of historical transactions for ARIMA AI forecasting).
# Set it back to false after the deploy, or keep it unset.
if [ "${APP_RESET_ON_BOOT:-false}" = "true" ]; then
    echo "==> APP_RESET_ON_BOOT=true — wiping and re-creating database with complete defense dataset..."
    php artisan migrate:fresh --force
    php artisan db:seed --force
    echo "==> Fresh database reset & full seeding complete."
elif [ "${APP_SEED_ON_BOOT:-false}" = "true" ]; then
    echo "==> APP_SEED_ON_BOOT=true — running migrations and seeding full defense dataset..."
    php artisan migrate --force
    php artisan db:seed --force
    echo "==> Database seeding complete."
else
    echo "==> Running migrations..."
    php artisan migrate --force
    echo "==> Ensuring core auth & permissions (idempotent)..."
    php artisan db:seed --class=RolesAndPermissionsSeeder --force
    php artisan db:seed --class=SuperAdminSeeder --force
    php artisan db:seed --class=TitleSeeder --force
fi

echo "==> Creating storage link..."
php artisan storage:link --force 2>/dev/null || true

echo "==> Caching config, routes, views..."
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo "==> Starting supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
