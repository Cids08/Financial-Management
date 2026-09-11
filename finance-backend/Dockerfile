# =============================================================================
# finance-backend — Dockerfile
# PHP 8.2 + Nginx + Tesseract + Supervisor (queue + reverb)
# =============================================================================

# --- Stage 1: Composer install -----------------------------------------------
FROM php:8.2-fpm AS vendor

RUN apt-get update && apt-get install -y --no-install-recommends \
    git unzip libpq-dev libzip-dev libpng-dev libjpeg-dev libwebp-dev \
    libfreetype6-dev libonig-dev libxml2-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j$(nproc) \
       pdo pdo_pgsql pgsql zip gd bcmath mbstring xml pcntl sockets exif \
    && rm -rf /var/lib/apt/lists/*

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

# --- Stage 2: Runtime --------------------------------------------------------
FROM php:8.2-fpm

LABEL maintainer="Financial Management System"

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev libzip-dev libpng-dev libjpeg-dev libwebp-dev \
    libfreetype6-dev libonig-dev libxml2-dev \
    nginx supervisor curl \
    tesseract-ocr \
    && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j$(nproc) \
       pdo pdo_pgsql pgsql zip gd bcmath mbstring xml pcntl sockets exif \
    && rm -rf /var/lib/apt/lists/*

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

WORKDIR /var/www/html

COPY --from=vendor /var/www/html /var/www/html

COPY docker/nginx/default.conf /etc/nginx/sites-available/default
COPY docker/supervisor/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache \
    && chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
