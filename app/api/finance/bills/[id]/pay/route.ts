import { payBill } from "@/db/ledger";
import {
  ApiInputError,
  financeRoute,
} from "../../../_shared";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return financeRoute(request, async (user) => {
    const { id } = await context.params;
    const result = await payBill(user.id, id);
    if (!result) throw new ApiInputError("Bill not found.", 404);
    return Response.json(result);
  });
}
