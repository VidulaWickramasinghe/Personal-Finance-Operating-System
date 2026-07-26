import CashflowApp from "./cashflow-app";
import { getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  const displayName = user?.fullName ?? user?.displayName?.split("@")[0] ?? "Wiche";

  return <CashflowApp userName={displayName} />;
}
