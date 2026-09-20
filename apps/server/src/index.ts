import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createDatabase } from "@oh-my-favorites/database";
import { buildApp } from "./app.js";
import { createTelegramBot } from "./bot.js";
import { env } from "./config.js";
import { ItemService } from "./item-service.js";

const databasePath = resolve(env.DATABASE_URL);
await mkdir(dirname(databasePath), { recursive: true });

const db = createDatabase(databasePath);
const items = new ItemService(db);
const app = await buildApp(items, env.API_TOKEN);

await app.listen({ host: env.HOST, port: env.PORT });

if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ALLOWED_USER_ID) {
  const bot = createTelegramBot(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_ALLOWED_USER_ID, items);
  bot.start({ onStart: () => app.log.info("Telegram bot started") });
} else {
  app.log.warn("Telegram bot disabled: token or allowed user id is missing");
}
