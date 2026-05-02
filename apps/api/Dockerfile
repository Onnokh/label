# syntax=docker/dockerfile:1.7

FROM oven/bun:1.2-debian AS deps
WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.2-debian AS runtime
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app/apps/api

USER root
COPY --from=deps /app/apps/api/node_modules ./node_modules
RUN DEBIAN_FRONTEND=noninteractive bunx playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /ms-playwright \
    && chown -R bun:bun /ms-playwright

USER bun
RUN bunx playwright install --only-shell chromium

COPY --chown=bun:bun apps/api ./
EXPOSE 3002
CMD ["sh", "-c", "bun src/migrate.ts && bun src/index.ts"]
