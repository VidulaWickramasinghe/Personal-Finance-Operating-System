import {
  ReceiptStorageUnavailableError,
  contentDispositionFilename,
  getReceiptBucket,
  getReceiptOwner,
  jsonError,
  jsonResponse,
  receiptBelongsTo,
  receiptKeyIsValid,
  receiptMetadataFromObject,
} from "../_receipt-storage";

export const dynamic = "force-dynamic";

type ReceiptRouteContext = {
  params: Promise<{
    key: string;
  }>;
};

export async function GET(
  request: Request,
  context: ReceiptRouteContext,
): Promise<Response> {
  const owner = await getReceiptOwner(request);
  if (!owner) {
    return jsonError(
      401,
      "unauthenticated",
      "Sign in before viewing a receipt.",
    );
  }

  const { key } = await context.params;
  if (!receiptKeyIsValid(key)) {
    return receiptNotFound();
  }

  try {
    const bucket = getReceiptBucket();
    const object = await bucket.get(key);

    if (!object || !receiptBelongsTo(object, owner)) {
      return receiptNotFound();
    }

    const receipt = receiptMetadataFromObject(request, key, object);
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": contentDispositionFilename(receipt.name),
      "Content-Length": String(object.size),
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Content-Type": receipt.contentType,
      "X-Content-Type-Options": "nosniff",
    });

    if (object.httpEtag) {
      headers.set("ETag", object.httpEtag);
    }

    return new Response(object.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    if (error instanceof ReceiptStorageUnavailableError) {
      return jsonError(
        503,
        "receipt_storage_unavailable",
        "Receipt storage is not configured.",
      );
    }

    console.error("Receipt read failed.", error);
    return jsonError(
      500,
      "receipt_read_failed",
      "The receipt could not be read.",
    );
  }
}

export async function DELETE(
  request: Request,
  context: ReceiptRouteContext,
): Promise<Response> {
  const owner = await getReceiptOwner(request);
  if (!owner) {
    return jsonError(
      401,
      "unauthenticated",
      "Sign in before deleting a receipt.",
    );
  }

  const { key } = await context.params;
  if (!receiptKeyIsValid(key)) {
    return receiptNotFound();
  }

  try {
    const bucket = getReceiptBucket();
    const object = await bucket.head(key);

    if (!object || !receiptBelongsTo(object, owner)) {
      return receiptNotFound();
    }

    await bucket.delete(key);
    return jsonResponse({ deleted: true, key });
  } catch (error) {
    if (error instanceof ReceiptStorageUnavailableError) {
      return jsonError(
        503,
        "receipt_storage_unavailable",
        "Receipt storage is not configured.",
      );
    }

    console.error("Receipt deletion failed.", error);
    return jsonError(
      500,
      "receipt_delete_failed",
      "The receipt could not be deleted.",
    );
  }
}

function receiptNotFound(): Response {
  return jsonError(
    404,
    "receipt_not_found",
    "The receipt was not found.",
  );
}
