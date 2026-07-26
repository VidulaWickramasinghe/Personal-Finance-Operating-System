import {
  loadFinanceSnapshot,
  resetFinanceUser,
} from "@/db/finance";
import { financeRoute } from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return financeRoute(
    request,
    async (user) => {
      const seededUser = await resetFinanceUser(user);
      const snapshot = await loadFinanceSnapshot(seededUser.id);
      return Response.json({
        reset: true,
        user: {
          id: seededUser.id,
          email: seededUser.email,
          displayName: seededUser.displayName,
          defaultCurrency: seededUser.defaultCurrency,
        },
        ...snapshot,
      });
    },
    { seed: false },
  );
}
