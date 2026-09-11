# =============================================================================
# finance-frontend — Dockerfile (Ultra-fast Bun Builder + Nginx)
# Stage 1: Bun installs packages & builds Vite in < 15 seconds (bypasses npm hang)
# Stage 2: Nginx Alpine serves the static dist files
# =============================================================================

# --- Stage 1: Fast Build with Bun -------------------------------------------
FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

# VITE_ build args baked into the JS bundle.
# Defaults are the production values so the build is correct even when
# HostForge does not pass these as --build-arg.
ARG VITE_API_BASE_URL=https://fms-backend-financial-management-system1.hostforgeplatforms.com
ARG VITE_API_URL=https://fms-backend-financial-management-system1.hostforgeplatforms.com
ARG VITE_REVERB_APP_KEY=e28f11fa00d789dbdd9e
ARG VITE_REVERB_HOST=fms-backend-financial-management-system1.hostforgeplatforms.com
ARG VITE_REVERB_PORT=443
ARG VITE_REVERB_SCHEME=https

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_REVERB_APP_KEY=$VITE_REVERB_APP_KEY
ENV VITE_REVERB_HOST=$VITE_REVERB_HOST
ENV VITE_REVERB_PORT=$VITE_REVERB_PORT
ENV VITE_REVERB_SCHEME=$VITE_REVERB_SCHEME

RUN bun run build

# --- Stage 2: Serve with Nginx ----------------------------------------------
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
