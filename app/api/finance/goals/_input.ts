import { ApiInputError, enumValue } from "../_shared";

const GOAL_STATUSES = [
  "active",
  "completed",
  "paused",
  "archived",
] as const;

function has(payload: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function text(
  payload: Record<string, unknown>,
  key: string,
  options: { required?: boolean; fallback?: string } = {},
) {
  const value = payload[key];
  if (value === undefined && !options.required) return options.fallback ?? "";
  if (typeof value !== "string") {
    throw new ApiInputError(`${key} must be text.`);
  }
  const trimmed = value.trim();
  if (options.required && !trimmed) {
    throw new ApiInputError(`${key} is required.`);
  }
  return trimmed;
}

function cents(
  value: unknown,
  label: string,
  options: { positive?: boolean; fallback?: number } = {},
) {
  if (value === undefined && options.fallback !== undefined) {
    return options.fallback;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    (options.positive ? value <= 0 : value < 0)
  ) {
    throw new ApiInputError(
      `${label} must be ${options.positive ? "a positive" : "a non-negative"} integer number of cents.`,
    );
  }
  return value;
}

function deadline(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new ApiInputError("deadline must be a valid YYYY-MM-DD date or null.");
  }
  return value;
}

export function goalCreateInput(payload: Record<string, unknown>) {
  return {
    name: text(payload, "name", { required: true }),
    targetAmountCents: cents(
      payload.targetAmountCents,
      "targetAmountCents",
      { positive: true },
    ),
    currentAmountCents: cents(
      payload.currentAmountCents,
      "currentAmountCents",
      { fallback: 0 },
    ),
    deadline: deadline(payload.deadline),
    monthlyContributionCents: cents(
      payload.monthlyContributionCents,
      "monthlyContributionCents",
      { fallback: 0 },
    ),
    notes: text(payload, "notes"),
    status: enumValue(
      payload.status,
      GOAL_STATUSES,
      "status",
      "active",
    ),
  };
}

export function goalPatchInput(payload: Record<string, unknown>) {
  const result: Record<string, string | number | null> = {};

  if (has(payload, "name")) {
    result.name = text(payload, "name", { required: true });
  }
  if (has(payload, "targetAmountCents")) {
    result.targetAmountCents = cents(
      payload.targetAmountCents,
      "targetAmountCents",
      { positive: true },
    );
  }
  if (has(payload, "currentAmountCents")) {
    result.currentAmountCents = cents(
      payload.currentAmountCents,
      "currentAmountCents",
    );
  }
  if (has(payload, "deadline")) {
    result.deadline = deadline(payload.deadline);
  }
  if (has(payload, "monthlyContributionCents")) {
    result.monthlyContributionCents = cents(
      payload.monthlyContributionCents,
      "monthlyContributionCents",
    );
  }
  if (has(payload, "notes")) {
    result.notes = text(payload, "notes");
  }
  if (has(payload, "status")) {
    result.status = enumValue(payload.status, GOAL_STATUSES, "status");
  }

  if (Object.keys(result).length === 0) {
    throw new ApiInputError("At least one goal field is required.");
  }
  return result;
}
