# ROOMS server services (access, activities, admin) for the self-hosted stack.
# Build context is the repository root:
#   docker build -f deploy/server.Dockerfile -t rooms-server .
FROM node:22.22.0-bookworm-slim AS build
WORKDIR /src
RUN npm install --global --ignore-scripts pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Electron and Playwright binaries are not needed to bundle the services.
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY apps/services ./apps/services
COPY packages ./packages
COPY scripts/build-services.mjs ./scripts/
ARG ROOMS_SOURCE_SHA=unknown
RUN ROOMS_SOURCE_SHA="$ROOMS_SOURCE_SHA" node scripts/build-services.mjs access activities admin

FROM node:22.22.0-bookworm-slim
WORKDIR /service
COPY --from=build /src/dist-services/access.cjs /src/dist-services/activities.cjs /src/dist-services/admin.cjs ./
USER 1000:1000
ENV SERVICE_HOST=0.0.0.0 NODE_ENV=production
CMD ["node", "access.cjs"]
