"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { syncFromAws } from "@/actions/aws-sync";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncAwsButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const result = await syncFromAws();

        if (result.demoMode) {
          toast.info("Sync is disabled in demo mode", {
            description: "There's no live AWS connection to pull from here.",
          });
          return;
        }

        const hadFailures = result.failedDecrypt > 0 || result.failedOther > 0;
        // Deleted records are held back rather than re-imported; say so, so
        // that a sync which appears to do nothing is legible.
        const heldBack = result.skippedDeleted
          ? `, ${result.skippedDeleted} held back as deleted`
          : "";
        const summary = `${result.created} new of ${result.totalFetched} fetched (${result.skippedExisting} already up to date${heldBack})`;

        if (hadFailures) {
          toast.warning("Sync completed with some issues", {
            description: `${summary}. ${result.failedDecrypt} failed to decrypt, ${result.failedOther} had unexpected data.`,
          });
        } else {
          toast.success("Synced from AWS", { description: summary });
        }

        router.refresh();
      } catch (error) {
        toast.error("Sync failed", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
      <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
      {isPending ? "Syncing…" : "Sync from AWS"}
    </Button>
  );
}
