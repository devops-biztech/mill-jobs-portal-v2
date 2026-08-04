"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setApplicationStatus } from "@/actions/applications";
import { Button } from "@/components/ui/button";
import type { ApplicationStatus } from "@/lib/application-status";

export function StatusActions({ id, status }: { id: string; status: ApplicationStatus }) {
  const [isPending, startTransition] = useTransition();

  function update(next: ApplicationStatus) {
    startTransition(async () => {
      await setApplicationStatus(id, next);
      toast.success(`Marked as ${next}`);
    });
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant={status === "reviewed" ? "default" : "outline"}
        disabled={isPending}
        onClick={() => update("reviewed")}
      >
        Mark reviewed
      </Button>
      {status !== "pending" && (
        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => update("pending")}>
          Reset to pending
        </Button>
      )}
    </div>
  );
}
