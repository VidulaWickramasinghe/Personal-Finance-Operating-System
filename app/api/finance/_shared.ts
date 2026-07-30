import { FinanceAuthError, getFinanceUser } from "@/db/finance";

export class ApiInputError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiInputError";
    this.status = status;
  }
}

export async function financeRoute(
  request: Request,
  handler: (
    user: Awaited<ReturnType<typeof getFinanceUser>>,
  ) => Promise<Response>,
) {
  try {
    // Every finance request resolves identity and atomically upgrades the
    // workspace before the route handler reads or mutates user data.
    const user = await getFinanceUser(request);
    return await handler(user);
  } catch (error) {
    if (error instanceof FinanceAuthError) {
      return Response.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ApiInputError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    const message =
      error instanceof Error ? error.message : "Unexpected finance data error";
    console.error("Finance request failed.", {
      method: request.method,
      path: new URL(request.url).pathname,
      message,
    });
    const lower = message.toLowerCase();
    if (
      lower.includes("d1 binding") ||
      lower.includes("no such table") ||
      lower.includes("failed query")
    ) {
      return Response.json(
        {
          error:
            "Finance storage is not ready yet. Enable the DB binding and apply the included D1 migration.",
          detail: message,
        },
        { status: 503 },
      );
    }
    if (lower.includes("foreign key constraint")) {
      return Response.json(
        {
          error:
            "This record is still in use. Archive it or remove related records first.",
        },
        { status: 409 },
      );
    }
    if (lower.includes("unique constraint")) {
      return Response.json(
        { error: "A record with these details already exists." },
        { status: 409 },
      );
    }

    return Response.json({ error: message }, { status: 500 });
  }
}

export async function readJsonObject(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiInputError("A JSON request body is required.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiInputError("The request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function requiredText(
  payload: Record<string, unknown>,
  key: string,
  label = key,
) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiInputError(`${label} is required.`);
  }
  return value.trim();
}

export function optionalText(
  payload: Record<string, unknown>,
  key: string,
  fallback = "",
) {
  const value = payload[key];
  if (value === null) return null;
  return typeof value === "string" ? value.trim() : fallback;
}

export function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function positiveInteger(
  value: unknown,
  label: string,
  options: { allowZero?: boolean } = {},
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    (options.allowZero ? value < 0 : value <= 0)
  ) {
    throw new ApiInputError(
      `${label} must be ${options.allowZero ? "a non-negative" : "a positive"} integer.`,
    );
  }
  return value;
}

export function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  fallback?: T,
): T {
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }
  if (fallback !== undefined && value === undefined) return fallback;
  throw new ApiInputError(`${label} must be one of: ${allowed.join(", ")}.`);
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  return crypto.randomUUID();
}
