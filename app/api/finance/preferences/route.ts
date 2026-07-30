import { eq } from "drizzle-orm";
import { getD1Binding, getDb } from "@/db";
import { userPreferences, users } from "@/db/schema";
import {
  ApiInputError,
  financeRoute,
  newId,
  readJsonObject,
} from "../_shared";

export const dynamic = "force-dynamic";

const TIMEZONES = [
  "Australia/Melbourne",
  "Australia/Sydney",
  "Australia/Perth",
] as const;
const LANGUAGES = ["en-AU", "en-US"] as const;

function optionalCurrency(value: unknown, fallback: string) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[a-z]{3}$/i.test(value.trim())) {
    throw new ApiInputError("defaultCurrency must be a three-letter code.");
  }
  return value.trim().toUpperCase();
}

function optionalChoice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  label: string,
) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ApiInputError(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

function optionalBoolean(value: unknown, fallback: boolean, label: string) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new ApiInputError(`${label} must be a boolean.`);
  }
  return value;
}

async function loadPreferences(userId: string) {
  const db = getDb();
  const [profile, preferences] = await Promise.all([
    db
      .select({ defaultCurrency: users.defaultCurrency })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1),
  ]);

  if (!profile[0] || !preferences[0]) {
    throw new ApiInputError("Finance preferences were not found.", 404);
  }

  return {
    defaultCurrency: profile[0].defaultCurrency,
    timezone: preferences[0].timezone,
    language: preferences[0].language,
    billReminders: preferences[0].billReminders,
    budgetAlerts: preferences[0].budgetAlerts,
    largeTransactionAlerts: preferences[0].largeTransactionAlerts,
  };
}

export async function GET(request: Request) {
  return financeRoute(request, async (user) => {
    return Response.json({ item: await loadPreferences(user.id) });
  });
}

export async function PATCH(request: Request) {
  return financeRoute(request, async (user) => {
    const current = await loadPreferences(user.id);
    const payload = await readJsonObject(request);
    const next = {
      defaultCurrency: optionalCurrency(
        payload.defaultCurrency,
        current.defaultCurrency,
      ),
      timezone: optionalChoice(
        payload.timezone,
        TIMEZONES,
        current.timezone as (typeof TIMEZONES)[number],
        "timezone",
      ),
      language: optionalChoice(
        payload.language,
        LANGUAGES,
        current.language as (typeof LANGUAGES)[number],
        "language",
      ),
      billReminders: optionalBoolean(
        payload.billReminders,
        current.billReminders,
        "billReminders",
      ),
      budgetAlerts: optionalBoolean(
        payload.budgetAlerts,
        current.budgetAlerts,
        "budgetAlerts",
      ),
      largeTransactionAlerts: optionalBoolean(
        payload.largeTransactionAlerts,
        current.largeTransactionAlerts,
        "largeTransactionAlerts",
      ),
    };

    const d1 = getD1Binding();
    await d1.batch([
      d1
        .prepare(
          `UPDATE users
           SET default_currency = ?,
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE id = ?`,
        )
        .bind(next.defaultCurrency, user.id),
      d1
        .prepare(
          `UPDATE user_preferences
           SET timezone = ?, language = ?, bill_reminders = ?,
               budget_alerts = ?, large_transaction_alerts = ?,
               updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           WHERE user_id = ?`,
        )
        .bind(
          next.timezone,
          next.language,
          next.billReminders ? 1 : 0,
          next.budgetAlerts ? 1 : 0,
          next.largeTransactionAlerts ? 1 : 0,
          user.id,
        ),
      d1
        .prepare(
          `INSERT INTO activity (
             id, user_id, entity_type, entity_id, action, summary, metadata_json
           ) VALUES (?, ?, 'preferences', ?, 'updated',
                     'Updated finance preferences', '{}')`,
        )
        .bind(newId(), user.id, user.id),
    ]);

    return Response.json({ item: await loadPreferences(user.id) });
  });
}
