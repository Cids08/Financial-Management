# =============================================================================
# Base image: php:8.2-fpm + tesseract-ocr + pgsql/pdo_pgsql + nginx + supervisor
# Built once on GitHub Actions, pushed to ghcr.io, then referenced by the
# finance-backend HostForge Dockerfile (keeps HostForge build under 20 min).
# =============================================================================
FROM php:8.2-fpm

LABEL maintainer="Financial Management System"
LABEL description="php:8.2-fpm with tesseract-ocr, pgsql/pdo_pgsql, nginx, supervisor"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    nginx \
    supervisor \
    curl \
    unzip \
    libpq-dev \
    && docker-php-ext-install -j$(nproc) pgsql pdo_pgsql pcntl \
    && rm -rf /var/lib/apt/lists/*

