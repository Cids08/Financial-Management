# =============================================================================
# finance-backend — Dockerfile
# PHP 8.2 FPM (official image) + Nginx + Supervisor (queue + reverb)
# Minimal: only pgsql extension compiled; everything else ships built-in.
# Tesseract removed to stay within HostForge 20-min build limit.
# =============================================================================
FROM php:8.2-fpm

LABEL maintainer="Financial Management System"

# Install minimal runtime deps + pgsql extension
# php:8.2-fpm ships: bcmath, curl, dom, fileinfo, filter, iconv, mbstring,
# openssl, pcntl, pdo, sockets, tokenizer, xml, zip, opcache, etc.
# We only need the PostgreSQL PDO driver.
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx supervisor curl unzip libpq-dev \
    && docker-php-ext-install -j$(nproc) pgsql \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# PHP-FPM pool tuning
RUN { \
    echo "pm = dynamic"; \
    echo "pm.max_children = 20"; \
    echo "pm.start_servers = 4"; \
    echo "pm.min_spare_servers = 2"; \
    echo "pm.max_spare_servers = 6"; \
    echo "pm.process_idle_timeout = 10s"; \
} > /usr/local/etc/php-fpm.d/zzz-tuning.conf

# PHP ini settings
RUN { \
    echo "upload_max_filesize = 50M"; \
    echo "post_max_size = 50M"; \
    echo "memory_limit = 256M"; \
    echo "max_execution_time = 120"; \
} > /usr/local/etc/php/conf.d/zz-custom.ini

# Configure PHP-FPM to listen on TCP 9000 (not a Unix socket)
RUN sed -i \
    -e 's|listen = /run/php/php8.2-fpm.sock|listen = 127.0.0.1:9000|' \
    -e 's|;clear_env = no|clear_env = no|' \
    /usr/local/etc/php-fpm.d/www.conf

WORKDIR /var/www/html

COPY composer.json composer.lock ./

RUN composer install \
    --no-dev \
    --no-scripts \
    --no-autoloader \
    --prefer-dist \
    --optimize-autoloader

COPY . .

RUN composer dump-autoload --optimize --no-dev

COPY docker/nginx/default.conf /etc/nginx/sites-available/default
COPY docker/supervisor/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache \
    && chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
