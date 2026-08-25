"use client";

import { useId, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteApplication } from "@/actions/applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Typed to confirm. Deliberately not the applicant's name — half the reason
 *  to delete is a duplicate pair with identical names, so typing one proves
 *  nothing about having picked the right row. The record summary above the
 *  field is what does that job; this is only here to stop a reflex click. */
const CONFIRM_WORD = "DELETE";

export function DeleteApplicationDialog({
  id,
  applicantName,
  companyName,
  submittedDate,
}: {
  id: string;
  applicantName: string;
  companyName: string | null;
  submittedDate: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const fieldId = useId();

  const canDelete = confirmation.trim().toUpperCase() === CONFIRM_WORD;

  function handleDelete() {
    if (!canDelete) return;
    setError(undefined);
    startTransition(async () => {
      try {
        // Redirects to the applications list on success, so nothing after
        // this runs on the happy path.
        await deleteApplication(id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not delete this application.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmation("");
          setError(undefined);
        }
      }}
    >
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 />
        Delete permanently
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this application permanently?</DialogTitle>
          <DialogDescription>
            This removes the record and its EEO survey answers from the database outright. It
            cannot be undone, and a re-sync will not bring it back unless the record still exists
            upstream in AWS.
          </DialogDescription>
        </DialogHeader>

        {/*
          * Every value here is free text of unpredictable length, so each one
          * gets `min-w-0` and is allowed to wrap. Without it a flex item's
          * `min-width: auto` resolves to its full unbroken width, which the
          * dialog's grid column then has to honour — one long value and the
          * whole dialog overflows its own max-width.
          */}
        <dl className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">Applicant</dt>
            <dd className="min-w-0 text-right font-medium">{applicantName || "—"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">Company</dt>
            <dd className="min-w-0 text-right">{companyName || "—"}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">Submitted</dt>
            <dd className="min-w-0 text-right">{submittedDate || "—"}</dd>
          </div>
          {/*
            * The confirmation number gets its own full-width line and wraps
            * rather than truncating. Two duplicate records are identical in
            * every other field shown here, so this is the only thing that
            * tells them apart — an ellipsis in the middle of it would defeat
            * the point of showing this summary before a permanent delete.
            */}
          <div className="border-t pt-2">
            <dt className="text-muted-foreground">Confirmation no.</dt>
            <dd className="mt-1 font-mono text-xs break-all select-all">{id}</dd>
          </div>
        </dl>

        <div className="space-y-2">
          <Label htmlFor={fieldId}>
            Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
          </Label>
          <Input
            id={fieldId}
            value={confirmation}
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" disabled={!canDelete || pending} onClick={handleDelete}>
            {pending ? "Deleting..." : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
