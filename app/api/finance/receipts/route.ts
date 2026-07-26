import {
  MAX_MULTIPART_BYTES,
  MAX_RECEIPT_BYTES,
  ReceiptStorageUnavailableError,
  createReceiptKey,
  encodeMetadataValue,
  getReceiptBucket,
  getReceiptOwner,
  jsonError,
  jsonResponse,
  normalizeReceiptContentType,
  receiptBytesMatchContentType,
  receiptMetadataFromObject,
  safeReceiptName,
} from "./_receipt-storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const owner = await getReceiptOwner(request);
  if (!owner) {
    return jsonError(
      401,
      "unauthenticated",
      "Sign in before uploading a receipt.",
    );
  }

  const contentType = request.headers.get("content-type")?.toLowerCase();
  if (!contentType?.startsWith("multipart/form-data")) {
    return jsonError(
      415,
      "unsupported_media_type",
      "Send the receipt as multipart form data in the `file` field.",
    );
  }

  const requestSize = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(requestSize) &&
    requestSize > MAX_MULTIPART_BYTES
  ) {
    return jsonError(
      413,
      "receipt_too_large",
      `Receipts must be ${MAX_RECEIPT_BYTES / 1024 / 1024} MiB or smaller.`,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(
      400,
      "invalid_multipart",
      "The multipart request could not be read.",
    );
  }

  const candidate = formData.get("file") ?? formData.get("receipt");
  if (!(candidate instanceof File)) {
    return jsonError(
      400,
      "file_required",
      "A receipt file is required in the `file` field.",
    );
  }

  if (candidate.size === 0) {
    return jsonError(
      400,
      "empty_receipt",
      "The receipt file is empty.",
    );
  }

  if (candidate.size > MAX_RECEIPT_BYTES) {
    return jsonError(
      413,
      "receipt_too_large",
      `Receipts must be ${MAX_RECEIPT_BYTES / 1024 / 1024} MiB or smaller.`,
    );
  }

  const canonicalContentType = normalizeReceiptContentType(candidate.type);
  if (!canonicalContentType) {
    return jsonError(
      415,
      "unsupported_receipt_type",
      "Use PDF, JPEG, PNG, WebP, HEIC, or HEIF receipt files.",
    );
  }

  const bytes = await candidate.arrayBuffer();
  if (!receiptBytesMatchContentType(bytes, canonicalContentType)) {
    return jsonError(
      415,
      "receipt_type_mismatch",
      "The file contents do not match the declared receipt type.",
    );
  }

  const key = createReceiptKey();
  const name = safeReceiptName(candidate.name);
  const uploadedAt = new Date().toISOString();

  try {
    const bucket = getReceiptBucket();
    await bucket.put(key, bytes, {
      customMetadata: {
        contentType: canonicalContentType,
        name: encodeMetadataValue(name),
        owner,
        size: String(candidate.size),
        uploadedAt,
      },
      httpMetadata: {
        contentType: canonicalContentType,
      },
    });

    const receipt = receiptMetadataFromObject(request, key, {
      customMetadata: {
        contentType: canonicalContentType,
        name: encodeMetadataValue(name),
        owner,
        size: String(candidate.size),
        uploadedAt,
      },
      httpMetadata: {
        contentType: canonicalContentType,
      },
      size: candidate.size,
    });

    return jsonResponse({ receipt }, 201);
  } catch (error) {
    if (error instanceof ReceiptStorageUnavailableError) {
      return jsonError(
        503,
        "receipt_storage_unavailable",
        "Receipt storage is not configured.",
      );
    }

    console.error("Receipt upload failed.", error);
    return jsonError(
      500,
      "receipt_upload_failed",
      "The receipt could not be uploaded.",
    );
  }
}
