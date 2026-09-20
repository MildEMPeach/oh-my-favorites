FROM node:24-bookworm-slim

WORKDIR /app
RUN npm install --global pnpm@12.4.2

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @oh-my-favorites/mcp...

COPY apps/mcp-server apps/mcp-server
COPY packages/shared packages/shared

RUN pnpm --filter @oh-my-favorites/shared build \
 && pnpm --filter @oh-my-favorites/mcp build

ENV NODE_ENV=production
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8790
EXPOSE 8790

CMD ["pnpm", "--filter", "@oh-my-favorites/mcp", "start:http"]
