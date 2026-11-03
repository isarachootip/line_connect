# ==============================================================================
# Stage 1: Base & Dependencies Installation
# ==============================================================================
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/liff/package.json ./apps/liff/
COPY apps/admin/package.json ./apps/admin/

RUN npm ci

# ==============================================================================
# Stage 2: Builder (Build Shared, Prisma Client, NestJS API, LIFF & Admin)
# ==============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build --workspace=@line-connect/shared \
  && npm run prisma:generate --workspace=@line-connect/api \
  && npm run build --workspace=@line-connect/api \
  && npm run build --workspace=@line-connect/liff \
  && npm run build --workspace=@line-connect/admin \
  && npm prune --omit=dev

# ==============================================================================
# Stage 3: Production Runner (Non-root Container สำหรับ NestJS API Gateway / BFF)
# ==============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV APP_ENV=prod
ENV PORT=3000

# รันด้วยสิทธิ์ผู้ใช้ทั่วไป (Non-root user: node) ตามมาตรฐานความปลอดภัย CISO
USER node

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /app/apps/api/prisma ./apps/api/prisma

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live || exit 1

CMD ["node", "apps/api/dist/main.js"]
