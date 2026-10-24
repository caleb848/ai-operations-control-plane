"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { announceChange } from "@/components/shell/status-context";
import { Button } from "@/components/ui/primitives";

export function ResetSession() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/budget", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset_session" }) });
        setBusy(false);
        announceChange();
        router.refresh();
      }}
    >
      <RotateCcw className="size-3.5" /> Start new session
    </Button>
  );
}
