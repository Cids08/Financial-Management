# =============================================================================
# finance-frontend — Dockerfile
# Stage 1: Node 20 builds the Vite/React app
# Stage 2: Nginx alpine serves the static dist
# =============================================================================

# --- Stage 1: Build ----------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

# VITE_ vars are baked into the JS bundle at build time.
# Pass them as build-args in docker-compose.
ARG VITE_API_BASE_URL
ARG VITE_API_URL
ARG VITE_REVERB_APP_KEY
ARG VITE_REVERB_HOST
ARG VITE_REVERB_PORT=443
ARG VITE_REVERB_SCHEME=https

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_REVERB_APP_KEY=$VITE_REVERB_APP_KEY
ENV VITE_REVERB_HOST=$VITE_REVERB_HOST
ENV VITE_REVERB_PORT=$VITE_REVERB_PORT
ENV VITE_REVERB_SCHEME=$VITE_REVERB_SCHEME

RUN npm run build

# --- Stage 2: Serve ----------------------------------------------------------
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
