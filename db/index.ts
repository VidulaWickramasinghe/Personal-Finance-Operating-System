import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getD1Binding() {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Enable the `DB` D1 binding for this site before using finance data."
    );
  }

  return binding;
}

export function getDb() {
  return drizzle(getD1Binding(), { schema });
}
