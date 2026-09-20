FROM node:24-bookworm-slim

WORKDIR /app
RUN npm install --global pnpm@12.4.2

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY apps/server apps/server
COPY packages/database packages/database
COPY packages/shared packages/shared

RUN pnpm --filter @oh-my-favorites/shared build \
 && pnpm --filter @oh-my-favorites/database build \
 && pnpm --filter @oh-my-favorites/server build

ENV NODE_ENV=production
EXPOSE 8787
CMD ["pnpm", "--filter", "@oh-my-favorites/server", "start"]
