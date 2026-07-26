import { loadFinanceSnapshot } from "@/db/finance";
import { financeRoute } from "./_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return financeRoute(request, async (user) => {
    const snapshot = await loadFinanceSnapshot(user.id);
    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        defaultCurrency: user.defaultCurrency,
      },
      ...snapshot,
    });
  });
}
