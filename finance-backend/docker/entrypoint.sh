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

# ---------------------------------------------------------------------------
# Webserver-first boot:
#   APP_RESET_ON_BOOT=true  -> drop every table, re-migrate, seed the full
#                              defense dataset (~20 seeders, 6 months of
#                              transactions). This is SLOWER than the platform
#                              health-check window, so it now runs in the
#                              background AFTER the web stack is up — the app
#                              comes online first and the seed finishes behind
#                              it. Progress/errors go to /tmp/db-seed.log.
#   APP_SEED_ON_BOOT=true   -> migrate + full seed in the background.
#   (default)               -> migrate + 3 idempotent core seeders in the
#                              foreground (fast, well under the health window).
# Set RESET/SEED to false after the first successful deploy — the database
# persists on the managed Postgres, so you only need to seed once.
# ---------------------------------------------------------------------------
echo "==> Starting supervisord (web stack first; seed may run behind it)..."
/usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf &
SUPERVISOR_PID=$!

seed_log=/tmp/db-seed.log

if [ "${APP_RESET_ON_BOOT:-false}" = "true" ]; then
    echo "==> APP_RESET_ON_BOOT=true — wiping + full seed running in the background (tail ${seed_log})..."
    ( php artisan migrate:fresh --force && php artisan db:seed --force; echo "==> reset+seed exit code: $?" ) > "$seed_log" 2>&1 &
elif [ "${APP_SEED_ON_BOOT:-false}" = "true" ]; then
    echo "==> APP_SEED_ON_BOOT=true — migrate + full seed running in the background (tail ${seed_log})..."
    ( php artisan migrate --force && php artisan db:seed --force; echo "==> seed exit code: $?" ) > "$seed_log" 2>&1 &
else
    echo "==> Running migrations (foreground)..."
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
php artisan route:cache || echo "    (route:cache skipped — not all routes are cacheable, continuing without it)"
php artisan view:cache

echo "==> Waiting for supervisord..."
wait "$SUPERVISOR_PID"
