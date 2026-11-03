# Dockerfile สำหรับสร้างและรันหน้าเว็บ Admin Backoffice (apps/admin) ด้วย Nginx บน Coolify
FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/liff/package.json ./apps/liff/
COPY apps/admin/package.json ./apps/admin/

RUN npm ci

COPY packages/shared ./packages/shared
COPY apps/admin ./apps/admin

RUN npm run build --workspace=@line-connect/shared \
  && npm run build --workspace=@line-connect/admin

FROM nginx:1.27-alpine AS runner
RUN printf 'server {\n  listen 80;\n  server_name _;\n  root /usr/share/nginx/html;\n  index index.html;\n  location /health {\n    return 200 "ok";\n    add_header Content-Type text/plain;\n  }\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/health || exit 1
