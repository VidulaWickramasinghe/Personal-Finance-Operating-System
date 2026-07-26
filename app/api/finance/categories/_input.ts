import { ApiInputError, enumValue } from "../_shared";

const CATEGORY_TYPES = ["income", "expense"] as const;

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

function boolean(value: unknown, label: string, fallback?: boolean) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new ApiInputError(`${label} must be a boolean.`);
  }
  return value;
}

export function categoryCreateInput(payload: Record<string, unknown>) {
  return {
    name: text(payload, "name", { required: true }),
    type: enumValue(payload.type, CATEGORY_TYPES, "type"),
    color: text(payload, "color", { fallback: "#8D80F8" }),
    icon: text(payload, "icon", { fallback: "circle" }),
    isSystem: boolean(payload.isSystem, "isSystem", false),
  };
}

export function categoryPatchInput(payload: Record<string, unknown>) {
  const result: Record<string, string | boolean> = {};

  if (has(payload, "name")) {
    result.name = text(payload, "name", { required: true });
  }
  if (has(payload, "type")) {
    result.type = enumValue(payload.type, CATEGORY_TYPES, "type");
  }
  if (has(payload, "color")) {
    result.color = text(payload, "color", { required: true });
  }
  if (has(payload, "icon")) {
    result.icon = text(payload, "icon", { required: true });
  }
  if (has(payload, "isSystem")) {
    result.isSystem = boolean(payload.isSystem, "isSystem");
  }

  if (Object.keys(result).length === 0) {
    throw new ApiInputError("At least one category field is required.");
  }
  return result;
}
