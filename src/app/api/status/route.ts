import { connection } from "next/server";
import { ready } from "@/server/container";
import { safely } from "@/server/http";
import { statusView } from "@/server/views";

export async function GET() {
  await connection();
  return safely(async () => Response.json(await statusView(await ready())));
}
