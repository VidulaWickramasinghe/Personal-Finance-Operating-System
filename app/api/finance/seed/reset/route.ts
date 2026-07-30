import {
  loadFinanceSnapshot,
  resetFinanceUser,
} from "@/db/finance";
import {
  ApiInputError,
  financeRoute,
  readJsonObject,
} from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    if (payload.confirmation !== "CLEAR FINANCE WORKSPACE") {
      throw new ApiInputError(
        'Type "CLEAR FINANCE WORKSPACE" to confirm permanent deletion.',
      );
    }
    const cleanUser = await resetFinanceUser(user);
    const snapshot = await loadFinanceSnapshot(cleanUser.id);
    return Response.json({
      reset: true,
      user: {
        id: cleanUser.id,
        email: cleanUser.email,
        displayName: cleanUser.displayName,
        defaultCurrency: cleanUser.defaultCurrency,
        workspaceVersion: cleanUser.workspaceVersion,
      },
      ...snapshot,
    });
  });
}
