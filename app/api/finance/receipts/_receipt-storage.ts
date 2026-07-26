import { env } from "cloudflare:workers";

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
export const MAX_MULTIPART_BYTES = MAX_RECEIPT_BYTES + 512 * 1024;

const AUTHENTICATED_USER_EMAIL_HEADER = "oai-authenticated-user-email";
const LOCAL_DEVELOPMENT_USER = "local-dev@cashflow-os.invalid";
const RECEIPT_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CONTENT_TYPE_ALIASES: Readonly<Record<string, string>> = {
  "image/jpg": "image/jpeg",
};

const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type ReceiptHttpMetadata = {
  contentType?: string;
};

export type ReceiptObjectMetadata = {
  customMetadata?: Record<string, string>;
  httpEtag?: string;
  httpMetadata?: ReceiptHttpMetadata;
  size: number;
};

export type ReceiptObjectBody = ReceiptObjectMetadata & {
  body: ReadableStream<Uint8Array>;
};

export type ReceiptBucket = {
  delete(key: string): Promise<void>;
  get(key: string): Promise<ReceiptObjectBody | null>;
  head(key: string): Promise<ReceiptObjectMetadata | null>;
  put(
    key: string,
    value: ArrayBuffer,
    options: {
      customMetadata: Record<string, string>;
      httpMetadata: ReceiptHttpMetadata;
    },
  ): Promise<unknown>;
};

export type ReceiptMetadata = {
  contentType: string;
  key: string;
  name: string;
  size: number;
  uploadedAt: string;
  url: string;
};

export class ReceiptStorageUnavailableError extends Error {
  constructor() {
    super("Cloudflare R2 binding `RECEIPTS` is unavailable.");
    this.name = "ReceiptStorageUnavailableError";
  }
}

export function getReceiptBucket(): ReceiptBucket {
  const bucket = (
    env as unknown as {
      RECEIPTS?: ReceiptBucket;
    }
  ).RECEIPTS;

  if (!bucket) {
    throw new ReceiptStorageUnavailableError();
  }

  return bucket;
}

export function receiptKeyIsValid(key: string): boolean {
  return RECEIPT_KEY_PATTERN.test(key);
}

export function createReceiptKey(): string {
  return crypto.randomUUID();
}

export function normalizeReceiptContentType(contentType: string): string | null {
  const normalized = contentType.trim().toLowerCase();
  const canonical = CONTENT_TYPE_ALIASES[normalized] ?? normalized;
  return ALLOWED_CONTENT_TYPES.has(canonical) ? canonical : null;
}

export function safeReceiptName(name: string): string {
  const basename = name.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const printable = basename
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"<>]/g, "_")
    .trim();

  return Array.from(printable || "receipt").slice(0, 120).join("");
}

export function receiptBytesMatchContentType(
  bytes: ArrayBuffer,
  contentType: string,
): boolean {
  const view = new Uint8Array(bytes);

  switch (contentType) {
    case "application/pdf":
      return startsWith(view, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "image/jpeg":
      return startsWith(view, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(view, [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
    case "image/webp":
      return (
        asciiAt(view, 0, "RIFF") &&
        asciiAt(view, 8, "WEBP")
      );
    case "image/heic":
    case "image/heif":
      return isHeifFamily(view);
    default:
      return false;
  }
}

export async function getReceiptOwner(
  request: Request,
): Promise<string | null> {
  const email = request.headers
    .get(AUTHENTICATED_USER_EMAIL_HEADER)
    ?.trim()
    .toLowerCase();
  const identity =
    email ||
    (process.env.NODE_ENV !== "production"
      ? LOCAL_DEVELOPMENT_USER
      : null);

  if (!identity) {
    return null;
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function receiptBelongsTo(
  object: ReceiptObjectMetadata,
  owner: string,
): boolean {
  return object.customMetadata?.owner === owner;
}

export function receiptMetadataFromObject(
  request: Request,
  key: string,
  object: ReceiptObjectMetadata,
): ReceiptMetadata {
  const metadata = object.customMetadata;
  const contentType =
    object.httpMetadata?.contentType ||
    metadata?.contentType ||
    "application/octet-stream";
  const parsedSize = Number(metadata?.size);
  const size = Number.isFinite(parsedSize) ? parsedSize : object.size;
  const name = decodeMetadataValue(metadata?.name, "receipt");
  const uploadedAt = metadata?.uploadedAt ?? "";

  return {
    contentType,
    key,
    name,
    size,
    uploadedAt,
    url: new URL(
      `/api/finance/receipts/${encodeURIComponent(key)}`,
      request.url,
    ).toString(),
  };
}

export function encodeMetadataValue(value: string): string {
  return encodeURIComponent(value);
}

export function contentDispositionFilename(name: string): string {
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="receipt"; filename*=UTF-8''${encoded}`;
}

export function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse({ error: { code, message } }, status);
}

function startsWith(
  bytes: Uint8Array,
  signature: readonly number[],
): boolean {
  return (
    bytes.length >= signature.length &&
    signature.every((byte, index) => bytes[index] === byte)
  );
}

function asciiAt(
  bytes: Uint8Array,
  offset: number,
  value: string,
): boolean {
  if (bytes.length < offset + value.length) {
    return false;
  }

  return Array.from(value).every(
    (character, index) =>
      bytes[offset + index] === character.charCodeAt(0),
  );
}

function isHeifFamily(bytes: Uint8Array): boolean {
  if (!asciiAt(bytes, 4, "ftyp") || bytes.length < 12) {
    return false;
  }

  const brand = String.fromCharCode(...bytes.slice(8, 12));
  return new Set([
    "heic",
    "heix",
    "hevc",
    "hevx",
    "mif1",
    "msf1",
  ]).has(brand);
}

function decodeMetadataValue(
  value: string | undefined,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return fallback;
  }
}
