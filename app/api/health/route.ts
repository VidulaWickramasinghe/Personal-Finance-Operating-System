export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "cashflow-os",
    storage: process.env.FINANCE_BACKEND_URL ? "connected" : "external-unconfigured",
  });
}
