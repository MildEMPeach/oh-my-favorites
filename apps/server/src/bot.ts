import { Bot } from "grammy";
import type { ItemService } from "./item-service.js";

const URL_RE = /https?:\/\/[^\s]+/i;

export async function processTelegramText(
  fromUserId: number,
  text: string,
  allowedUserId: number,
  save: (url: string, source: "telegram") => Promise<{ url: string }>
) {
  if (fromUserId !== allowedUserId) return "Unauthorized.";

  const match = text.match(URL_RE);
  if (!match) return "Send me a URL to save it.";

  try {
    const item = await save(match[0], "telegram");
    return `Saved: ${item.url}`;
  } catch {
    return "Invalid URL.";
  }
}

export function createTelegramBot(token: string, allowedUserId: number, items: ItemService) {
  const bot = new Bot(token);

  bot.on("message:text", async (ctx) => {
    const reply = await processTelegramText(
      ctx.from.id,
      ctx.message.text,
      allowedUserId,
      (url, source) => items.create(url, source)
    );
    await ctx.reply(reply);
  });

  return bot;
}
