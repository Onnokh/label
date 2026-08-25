# syntax=docker/dockerfile:1.7

FROM oven/bun:1-debian AS build
WORKDIR /app
ARG VITE_API_BASE_URL
ARG VITE_WEB_BASE_URL
ARG VITE_RYBBIT_SITE_ID
ARG VITE_RYBBIT_SCRIPT_SRC
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WEB_BASE_URL=$VITE_WEB_BASE_URL \
    VITE_RYBBIT_SITE_ID=$VITE_RYBBIT_SITE_ID \
    VITE_RYBBIT_SCRIPT_SRC=$VITE_RYBBIT_SCRIPT_SRC

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/chrome-extension/package.json ./apps/chrome-extension/
COPY packages/contract ./packages/contract
RUN bun install --frozen-lockfile

COPY apps/web ./apps/web
RUN cd apps/web && bun run build

FROM oven/bun:1-debian AS runtime
WORKDIR /app/apps/web
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/web/node_modules ./node_modules
COPY --from=build /app/packages/contract /app/packages/contract
COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/apps/web/favicon.ico ./
COPY --from=build /app/apps/web/public/openapi.json ./public/openapi.json
COPY --from=build /app/apps/web/server.ts ./
COPY --from=build /app/apps/web/server ./server
COPY --from=build /app/apps/web/indexnow-notify.ts ./
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "server.ts"]
