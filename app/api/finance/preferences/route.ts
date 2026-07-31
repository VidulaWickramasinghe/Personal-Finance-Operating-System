import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ApiInputError, financeRoute, readJsonObject } from "../_shared";

const currencies = ["AUD", "USD", "NZD", "EUR", "GBP", "JPY"] as const;
const timezones = ["Australia/Melbourne", "Australia/Sydney", "Australia/Perth", "UTC"] as const;
const languages = ["en-AU", "en-US"] as const;
const themes = ["light", "dark", "system"] as const;
const densities = ["comfortable", "compact"] as const;
const startPages = ["overview", "transactions", "accounts", "budgets", "goals", "bills", "reports"] as const;

function choice<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value === "string" && values.includes(value as T)) return value as T;
  throw new ApiInputError(`${label} is invalid.`);
}

export async function PATCH(request: Request) {
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const [item] = await getDb().update(users).set({
      defaultCurrency: choice(payload.defaultCurrency, currencies, "Currency"),
      timezone: choice(payload.timezone, timezones, "Timezone"),
      language: choice(payload.language, languages, "Language"),
      theme: choice(payload.theme, themes, "Theme"),
      billReminders: payload.billReminders !== false,
      budgetAlerts: payload.budgetAlerts !== false,
      largeTransactionAlerts: payload.largeTransactionAlerts !== false,
      displayName: typeof payload.displayName === "string" && payload.displayName.trim() ? payload.displayName.trim().slice(0, 80) : user.displayName,
      dashboardDensity: choice(payload.dashboardDensity, densities, "Dashboard density"),
      startPage: choice(payload.startPage, startPages, "Start page"),
      showHealthScore: payload.showHealthScore !== false,
      showUpcomingBills: payload.showUpcomingBills !== false,
      updatedAt: new Date().toISOString(),
    }).where(eq(users.id, user.id)).returning();
    return Response.json({ preferences: item });
  });
}
