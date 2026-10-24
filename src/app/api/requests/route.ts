import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { ready } from "@/server/container";
import { safely } from "@/server/http";

const query = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  data: z.enum(["real", "all"]).optional(),
  classification: z.enum(["public", "internal", "confidential", "restricted"]).optional(),
  location: z.enum(["local", "cloud", "blocked"]).optional(),
  mode: z.enum(["local", "live", "demo"]).optional(),
  q: z.string().max(200).optional(),
});

export async function GET(req: NextRequest) {
  await connection();
  return safely(async () => {
    const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return Response.json({ error: "Invalid query", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
    const p = parsed.data;
    const c = await ready();
    return Response.json(
      c.executions.list({ limit: p.limit, offset: p.offset, realOnly: p.data === "real", classification: p.classification, location: p.location, mode: p.mode, search: p.q }),
    );
  });
}
