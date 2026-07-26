import { ApiInputError, enumValue } from "../_shared";

const BUDGET_STATUSES = ["active", "paused"] as const;

function has(payload: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function requiredText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiInputError(`${key} is required.`);
  }
  return value.trim();
}

function optionalAccountId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiInputError("accountId must be a non-empty string or null.");
  }
  return value.trim();
}

function nonNegativeCents(value: unknown, label: string, fallback?: number) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new ApiInputError(
      `${label} must be a non-negative integer number of cents.`,
    );
  }
  return value;
}

function resetDay(value: unknown, fallback?: number) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 28
  ) {
    throw new ApiInputError("resetDay must be an integer from 1 to 28.");
  }
  return value;
}

export function budgetCreateInput(payload: Record<string, unknown>) {
  return {
    categoryId: requiredText(payload, "categoryId"),
    accountId: optionalAccountId(payload.accountId),
    name: requiredText(payload, "name"),
    monthlyLimitCents: nonNegativeCents(
      payload.monthlyLimitCents,
      "monthlyLimitCents",
      0,
    ),
    weeklyLimitCents: nonNegativeCents(
      payload.weeklyLimitCents,
      "weeklyLimitCents",
      0,
    ),
    dailyLimitCents: nonNegativeCents(
      payload.dailyLimitCents,
      "dailyLimitCents",
      0,
    ),
    resetDay: resetDay(payload.resetDay, 1),
    status: enumValue(
      payload.status,
      BUDGET_STATUSES,
      "status",
      "active",
    ),
  };
}

export function budgetPatchInput(payload: Record<string, unknown>) {
  const result: Record<string, string | number | null> = {};

  if (has(payload, "categoryId")) {
    result.categoryId = requiredText(payload, "categoryId");
  }
  if (has(payload, "accountId")) {
    result.accountId = optionalAccountId(payload.accountId);
  }
  if (has(payload, "name")) {
    result.name = requiredText(payload, "name");
  }
  if (has(payload, "monthlyLimitCents")) {
    result.monthlyLimitCents = nonNegativeCents(
      payload.monthlyLimitCents,
      "monthlyLimitCents",
    );
  }
  if (has(payload, "weeklyLimitCents")) {
    result.weeklyLimitCents = nonNegativeCents(
      payload.weeklyLimitCents,
      "weeklyLimitCents",
    );
  }
  if (has(payload, "dailyLimitCents")) {
    result.dailyLimitCents = nonNegativeCents(
      payload.dailyLimitCents,
      "dailyLimitCents",
    );
  }
  if (has(payload, "resetDay")) {
    result.resetDay = resetDay(payload.resetDay);
  }
  if (has(payload, "status")) {
    result.status = enumValue(payload.status, BUDGET_STATUSES, "status");
  }

  if (Object.keys(result).length === 0) {
    throw new ApiInputError("At least one budget field is required.");
  }
  return result;
}
