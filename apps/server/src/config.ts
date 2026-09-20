import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const localEnv = resolve(process.cwd(), ".env");
const workspaceEnv = resolve(process.cwd(), "../../.env");
loadEnv({ path: existsSync(localEnv) ? localEnv : workspaceEnv });

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().default("./data/favorites.db"),
  API_TOKEN: z.string().min(8),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ALLOWED_USER_ID: z.coerce.number().int().optional()
});

export const env = schema.parse(process.env);
