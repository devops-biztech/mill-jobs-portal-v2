"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { addApplicationReview, withdrawApplicationReview } from "@/actions/applications";
import { Button } from "@/components/ui/button";

/**
 * `hasReviewed` is about the current user, not the application: several
 * people can sign off on the same one, so the button offers to add your own
 * review even when colleagues have already reviewed it, and only offers to
 * withdraw the one that is yours to withdraw.
 */
export function StatusActions({ id, hasReviewed }: { id: string; hasReviewed: boolean }) {
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<void>, message: string) {
    startTransition(async () => {
      await action();
      toast.success(message);
    });
  }

  if (hasReviewed) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => run(() => withdrawApplicationReview(id), "Your review was withdrawn")}
      >
        Withdraw my review
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      disabled={isPending}
      onClick={() => run(() => addApplicationReview(id), "Marked as reviewed")}
    >
      Mark reviewed
    </Button>
  );
}
