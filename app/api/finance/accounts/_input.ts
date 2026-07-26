import { ApiInputError, enumValue } from "../_shared";

const ACCOUNT_PURPOSES = [
  "salary",
  "daily",
  "bills",
  "international",
  "savings",
  "custom",
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

function cents(value: unknown, label: string, fallback?: number) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value)
  ) {
    throw new ApiInputError(`${label} must be an integer number of cents.`);
  }
  return value;
}

function currency(value: unknown, fallback?: string) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !/^[a-z]{3}$/i.test(value.trim())) {
    throw new ApiInputError("currency must be a three-letter code.");
  }
  return value.trim().toUpperCase();
}

function boolean(value: unknown, label: string, fallback?: boolean) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new ApiInputError(`${label} must be a boolean.`);
  }
  return value;
}

export function accountCreateInput(
  payload: Record<string, unknown>,
  defaultCurrency: string,
) {
  const openingBalanceCents = cents(
    payload.openingBalanceCents,
    "openingBalanceCents",
    0,
  );

  return {
    name: text(payload, "name", { required: true }),
    bankName: text(payload, "bankName"),
    accountType: text(payload, "accountType", { fallback: "checking" }),
    purpose: enumValue(
      payload.purpose,
      ACCOUNT_PURPOSES,
      "purpose",
      "custom",
    ),
    openingBalanceCents,
    currentBalanceCents: cents(
      payload.currentBalanceCents,
      "currentBalanceCents",
      openingBalanceCents,
    ),
    currency: currency(payload.currency, defaultCurrency),
    color: text(payload, "color", { fallback: "#6556E8" }),
    icon: text(payload, "icon", { fallback: "wallet" }),
    notes: text(payload, "notes"),
    isArchived: boolean(payload.isArchived, "isArchived", false),
  };
}

export function accountPatchInput(payload: Record<string, unknown>) {
  const result: Record<string, string | number | boolean> = {};

  if (has(payload, "name")) {
    result.name = text(payload, "name", { required: true });
  }
  if (has(payload, "bankName")) {
    result.bankName = text(payload, "bankName");
  }
  if (has(payload, "accountType")) {
    result.accountType = text(payload, "accountType", { required: true });
  }
  if (has(payload, "purpose")) {
    result.purpose = enumValue(
      payload.purpose,
      ACCOUNT_PURPOSES,
      "purpose",
    );
  }
  if (has(payload, "openingBalanceCents")) {
    result.openingBalanceCents = cents(
      payload.openingBalanceCents,
      "openingBalanceCents",
    );
  }
  if (has(payload, "currentBalanceCents")) {
    result.currentBalanceCents = cents(
      payload.currentBalanceCents,
      "currentBalanceCents",
    );
  }
  if (has(payload, "currency")) {
    result.currency = currency(payload.currency);
  }
  if (has(payload, "color")) {
    result.color = text(payload, "color", { required: true });
  }
  if (has(payload, "icon")) {
    result.icon = text(payload, "icon", { required: true });
  }
  if (has(payload, "notes")) {
    result.notes = text(payload, "notes");
  }
  if (has(payload, "isArchived")) {
    result.isArchived = boolean(payload.isArchived, "isArchived");
  }

  if (Object.keys(result).length === 0) {
    throw new ApiInputError("At least one account field is required.");
  }
  return result;
}
