# --- Stage 1: install deps + build the Next.js app ---
FROM oven/bun:1.2 AS build
WORKDIR /app

# Install dependencies using the lockfile for reproducibility.
COPY package.json bun.lock ./
RUN bun install

# Build the application (TypeScript errors are intentionally ignored by the
# project's next.config, matching local dev behaviour).
COPY . .
RUN bunx prisma generate
# Ensure a schema exists so `next build`'s static generation is safe; the throwaway
# db file here is masked at runtime by the persistent /app/db volume.
RUN bunx prisma db push --skip-generate
RUN bun run build

# --- Stage 2: production runtime ---
FROM oven/bun:1.2 AS runner
WORKDIR /app
ENV NODE_ENV=production

# The whole build stage (node_modules, .next, prisma schema, public assets,
# scripts) is copied so `prisma db push` can run at startup and `next start`
# can serve the compiled app. Source code is excluded by .dockerignore.
COPY --from=build /app ./

# Persistent data lives on a host-mounted volume (see docker-compose.yml).
RUN mkdir -p /app/db /app/app-data /app/public \
    && chmod +x /app/scripts/entrypoint.sh

EXPOSE 3000
CMD ["sh", "/app/scripts/entrypoint.sh"]