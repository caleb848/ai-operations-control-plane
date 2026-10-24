import { connection } from "next/server";
import { ready } from "@/server/container";
import { safely } from "@/server/http";

export async function GET() {
  await connection();
  return safely(async () => {
    const c = await ready();
    const snap = await c.registry.snapshot();
    return Response.json({ models: snap.models, availability: snap.availability, ollama: snap.ollama, cloudLive: snap.cloudLive });
  });
}
