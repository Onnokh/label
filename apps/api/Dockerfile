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
RUN bunx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && chown -R bun:bun /ms-playwright

COPY apps/api ./

USER bun
EXPOSE 3002
CMD ["sh", "-c", "bunx drizzle-kit migrate && bun src/index.ts"]
