# Multi-stage build for the Next.js app. Postgres is a separate service
# (docker-compose.yml) — this image is the app only.

FROM node:20-alpine AS base
# Prisma's query engine on Alpine needs OpenSSL; libc6-compat covers a few
# native deps that assume glibc.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ---- deps: full install (incl. devDependencies) for building ----
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
# `postinstall` runs `prisma generate`, which needs the schema present —
# copy it before `npm ci`, not just package.json.
COPY prisma ./prisma
# The build only needs the schema, not a reachable database — prisma
# generate reads env("DATABASE_URL") from the schema but never connects.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm ci

# ---- prod-deps: separate install, --omit=dev, for the runtime image ----
FROM base AS prod-deps
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm ci --omit=dev

# ---- builder: compile the Next.js app ----
FROM base AS builder
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runner: lean runtime image ----
FROM base AS runner
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
# No public/ directory in this project yet (the favicon uses the App
# Router's file-based icon.svg convention) — add a `COPY ... ./public` line
# back here if one gets added later.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh && \
    addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 && \
    chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENV PORT=3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]
