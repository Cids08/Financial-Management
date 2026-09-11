# =============================================================================
# finance-backend — Dockerfile
# PHP 8.2 (Sury packages — precompiled, no source build) + Nginx + Tesseract
# Supervisor runs: nginx, php-fpm, queue worker, Reverb WebSocket server
# =============================================================================
FROM debian:bookworm-slim

LABEL maintainer="Financial Management System"

# Add Sury PHP repository (precompiled extensions = fast install)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       apt-transport-https lsb-release ca-certificates curl gnupg \
    && curl -sSL https://packages.sury.org/php/apt.gpg \
       | gpg --dearmor -o /usr/share/keyrings/deb.sury.org-php.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/deb.sury.org-php.gpg] \
       https://packages.sury.org/php/ $(lsb_release -sc) main" \
       > /etc/apt/sources.list.d/sury-php.list \
    && apt-get update

# Install PHP 8.2 FPM + all required extensions as precompiled packages,
# plus nginx, supervisor, tesseract, and build tooling for composer.
RUN apt-get install -y --no-install-recommends \
    php8.2-fpm php8.2-cli php8.2-common \
    php8.2-pgsql php8.2-mbstring php8.2-xml php8.2-curl \
    php8.2-zip php8.2-bcmath php8.2-gd php8.2-opcache \
    php8.2-readline php8.2-intl php8.2-dom \
    nginx supervisor curl git unzip tesseract-ocr \
    && ln -sf /usr/bin/php8.2 /usr/bin/php \
    && rm -rf /var/lib/apt/lists/*

# Make php-fpm8.2 available as php-fpm (used by supervisor)
RUN ln -sf /usr/sbin/php-fpm8.2 /usr/sbin/php-fpm

# Configure PHP-FPM to listen on TCP 9000 (not a Unix socket)
RUN sed -i \
    -e 's|listen = /run/php/php8.2-fpm.sock|listen = 127.0.0.1:9000|' \
    -e 's|;clear_env = no|clear_env = no|' \
    /etc/php/8.2/fpm/pool.d/www.conf

# PHP-FPM pool tuning
RUN { \
    echo "pm = dynamic"; \
    echo "pm.max_children = 20"; \
    echo "pm.start_servers = 4"; \
    echo "pm.min_spare_servers = 2"; \
    echo "pm.max_spare_servers = 6"; \
    echo "pm.process_idle_timeout = 10s"; \
} >> /etc/php/8.2/fpm/pool.d/www.conf

# PHP ini settings
RUN { \
    echo "upload_max_filesize = 50M"; \
    echo "post_max_size = 50M"; \
    echo "memory_limit = 256M"; \
    echo "max_execution_time = 120"; \
} > /etc/php/8.2/fpm/conf.d/99-custom.ini \
  && cp /etc/php/8.2/fpm/conf.d/99-custom.ini /etc/php/8.2/cli/conf.d/99-custom.ini

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

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
