# syntax=docker/dockerfile:1.7

FROM oven/bun:1.2-debian AS deps
WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/bun.lock ./
RUN bun install --frozen-lockfile

FROM mcr.microsoft.com/playwright:v1.59.1-noble AS runtime
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app/apps/api

USER root
RUN npm install -g bun@1.2.23
COPY --from=deps --chown=pwuser:pwuser /app/apps/api/node_modules ./node_modules
COPY --chown=pwuser:pwuser apps/api ./

USER pwuser
EXPOSE 3002
CMD ["sh", "-c", "bun src/migrate.ts && bun src/index.ts"]
