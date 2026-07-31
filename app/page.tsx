import CashflowApp from "./cashflow-app";
import { getChatGPTUser } from "./chatgpt-auth";
import { headers } from "next/headers";
import { getFinanceUser, loadFinanceSnapshot } from "@/db/finance";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [user, requestHeaders] = await Promise.all([getChatGPTUser(), headers()]);
  const displayName =
    user?.fullName ?? user?.displayName?.split("@")[0] ?? "there";
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const request = new Request(`${protocol}://${host}/`, {
    headers: requestHeaders,
  });
  const financeUser = await getFinanceUser(request);
  const initialData = await loadFinanceSnapshot(financeUser.id);

  return <CashflowApp userName={displayName} initialData={initialData} initialPreferences={financeUser} />;
}
