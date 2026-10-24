import { connection, type NextRequest } from "next/server";
import { ready } from "@/server/container";
import { safely } from "@/server/http";

export async function GET(req: NextRequest) {
  await connection();
  return safely(async () => {
    const c = await ready();
    const status = req.nextUrl.searchParams.get("status");
    const approvals = c.approvals.list(status === "pending" || status === "approved" || status === "rejected" ? status : undefined);
    return Response.json({ approvals });
  });
}
