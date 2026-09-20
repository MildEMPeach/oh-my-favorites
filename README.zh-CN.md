# Oh My Favorites

<p align="center">
  <img src="./apps/desktop/assets/icon.png" width="140" alt="Oh My Favorites 图标" />
</p>

<h3 align="center">做一只快乐的互联网小仓鼠</h3>

<p align="center">
  一个自托管的跨平台「稍后消费」Inbox。<br/>
  手机、Telegram、浏览器或 AI Agent 看到的内容，都可以先丢进来，之后在 PC 端统一处理。
</p>

<p align="center">
  <a href="./README.md">English</a>
  ·
  <a href="#快速开始">快速开始</a>
  ·
  <a href="#agent--mcp">MCP</a>
</p>

<p align="center">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-Desktop-47848F?logo=electron&logoColor=white" />
  <img alt="Fastify" src="https://img.shields.io/badge/Fastify-API-000000?logo=fastify&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-Storage-003B57?logo=sqlite&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Self--hosted-2496ED?logo=docker&logoColor=white" />
  <img alt="MCP" src="https://img.shields.io/badge/MCP-Agent%20ready-7C3AED" />
</p>

---

## 为什么做 Oh My Favorites？

几乎每个平台都有自己的「稍后再看」「收藏」「书签」，但它们彼此割裂。

你可能在 B 站有稍后再看，在 YouTube 有 Watch Later，在浏览器里有收藏夹，在 Telegram 里又给自己发了一堆链接。真正想回看的时候，内容早就散得到处都是。

Oh My Favorites 做的事情很简单：**把所有“现在没空看，之后再处理”的内容统一收进一个 Inbox。**

- 手机上刷到 B 站 / YouTube 视频 → 转发链接；
- 看到文章、GitHub 项目、论文 → 发给 Bot；
- 让 Agent 浏览网页 → 自动整理标题和标签后入库；
- 回到电脑前 → 在一个桌面客户端里统一查看和处理。

核心思路只有一句话：

> **尽可能低成本地收进来，等真正有时间时再统一消费。**

## 使用流程

| 📱 **发现它** | 🐹 **丢进来** | 📥 **统一收好** | 🖥️ **有空再看** |
| :---: | :---: | :---: | :---: |
| 视频、文章、项目、论文…… | 发给 Telegram Bot 或 Agent | 全部进入同一个 Inbox | 在桌面端阅读、观看、打标签或收藏 |

不用再记“这个链接到底收藏在哪个平台了”，回来只看一个地方就够了。

## 核心功能

| | 功能 | 说明 |
| --- | --- | --- |
| 📥 | **统一 Inbox** | Telegram、桌面端、MCP Agent 的链接统一进入一个列表。 |
| 👀 | **已读 / 未读** | 新收藏默认未读，真正打开或明确修改后才变成已读。 |
| ⭐ | **Favorites** | 把真正值得长期保存的内容留下。 |
| 🏷️ | **标签** | 一个条目支持多个标签，也可以按标签浏览。 |
| ✏️ | **自定义标题** | 手动重命名，或者让 Agent 根据页面内容生成更清晰的标题。 |
| 🤖 | **Agent 接入** | 同时支持本地 stdio MCP 和远程 Streamable HTTP MCP。 |
| 📱 | **移动端快速收集** | 手机上直接把链接转发给 Telegram Bot，不需要折腾浏览器收藏夹。 |
| 🖥️ | **桌面端集中消费** | Electron 客户端内嵌隔离 Chromium 页面。 |
| 🌗 | **桌面体验** | 深浅色主题、可折叠侧边栏、Timeline / Unread / Favorites / Tags。 |
| 🐳 | **自托管** | Fastify + SQLite，可直接使用 Docker Compose 部署。 |

## 架构

协议入口和核心业务服务是分开的。Telegram 与 MCP 最终都会走同一套服务端数据模型和 REST API。

```text
                  值得存下来的东西

    📱 Telegram                🤖 Agent
         │                  stdio / HTTP
         │                       │
         └──────────┬────────────┘
                    ▼
             🐹 OMF Server
              Fastify :8787
                    │
                    ▼
               🗄️ SQLite
                    ▲
                    │
             🖥️ Desktop App
              浏览 · 阅读 · 整理
```

MCP 既可以通过本地 **stdio** 使用，也可以通过远程 **Streamable HTTP :8790** 使用；它不会维护第二份数据，最终都回到同一个 OMF Server。

### 仓库结构

```text
apps/
├── desktop/      Electron + React 桌面客户端
├── mcp-server/   stdio + Streamable HTTP MCP 适配器
└── server/       Fastify API + Telegram Bot

packages/
├── database/     Drizzle Schema + SQLite
└── shared/       共享 TypeScript 类型
```

## 快速开始

### 环境要求

- Node.js 24+
- pnpm 12+
- Docker + Docker Compose

### 1. 安装依赖

```bash
pnpm install
cp .env.example .env
```

至少需要设置一个足够长的 API Token：

```env
API_TOKEN=replace-with-a-long-random-token
```

### 2. 启动服务端

```bash
docker compose up -d --build
```

REST API 默认位于 `http://localhost:8787`。

### 3. 启动桌面端

```bash
pnpm dev:desktop
```

打开桌面端 **Settings**，配置：

- Server URL：`http://localhost:8787`
- API Token：与 `.env` 中的 `API_TOKEN` 相同

## Telegram 快速入库

Telegram 是可选入口。在 `.env` 中配置：

```env
TELEGRAM_BOT_TOKEN=123456:your-bot-token
TELEGRAM_ALLOWED_USER_ID=123456789
```

支持：

```text
https://example.com
https://example.com 自定义标题
```

只有 `TELEGRAM_ALLOWED_USER_ID` 指定的用户可以通过 Bot 入库。

## Agent / MCP

MCP 适配器允许 Agent 使用自己的浏览能力先阅读网页，再决定标题和标签，最后保存到 Oh My Favorites。

目前提供：

```text
save_url
get_item
list_items
list_tags
update_item
add_tags
remove_tags
```

`save_url` 新增的条目始终保持 **未读**。只有显式调用 `update_item` 才会修改已读状态。

### 本地 stdio MCP

先构建：

```bash
pnpm build:mcp
```

通用 MCP 配置示例：

```json
{
  "mcpServers": {
    "oh-my-favorites": {
      "command": "node",
      "args": ["/absolute/path/to/oh-my-favorites/apps/mcp-server/dist/index.js"],
      "env": {
        "OMF_BASE_URL": "http://127.0.0.1:8787",
        "OMF_API_TOKEN": "your-server-api-token"
      }
    }
  }
}
```

### 远程 Streamable HTTP MCP

在 `.env` 中增加独立的 MCP Token：

```env
MCP_TOKEN=replace-with-a-different-long-random-token
MCP_PORT=8790
```

启动 Server + MCP：

```bash
docker compose --profile mcp up -d --build
```

默认 MCP 地址：

```text
http://localhost:8790/mcp
```

客户端需要携带：

```http
Authorization: Bearer <MCP_TOKEN>
```

如果 MCP 暴露到公网，请放在 HTTPS 反向代理后面。

### Hermes 示例

如果 Hermes 跑在 macOS 的 Docker Desktop 中：

```bash
hermes mcp add oh-my-favorites \
  --url http://host.docker.internal:8790/mcp \
  --auth header
```

Hermes 要求输入 Bearer Token 时，直接填写原始 `MCP_TOKEN` 即可。

更多细节见 [`apps/mcp-server/README.md`](./apps/mcp-server/README.md)。

## 桌面端打包

使用 electron-builder：

```bash
pnpm --filter @oh-my-favorites/desktop package
```

当前配置的目标：

- macOS：DMG + ZIP
- Windows：NSIS
- Linux：AppImage

构建产物输出到 `apps/desktop/release/`。

## 数据与安全

- SQLite 数据默认保存在 Docker volume `favorites-data` 中。
- `readStatus` 与 `isFavorite` 是相互独立的状态。
- 元数据抓取会校验 DNS / IP 与重定向目标，降低 SSRF 风险。
- 元数据下载有超时和大小限制。
- 远程网页运行在隔离的 Electron Browser Session 中，Node.js 默认关闭。
- `/api/*` 使用 Bearer Token 鉴权。
- 远程 MCP 使用独立的 `MCP_TOKEN`。

## 开发与验证

```bash
# 同时启动 server + desktop
pnpm dev

# 验证
pnpm test
pnpm typecheck
pnpm build
```

---

<p align="center">
  <b>把所有“之后再看”收进同一个 Inbox。</b>
</p>
