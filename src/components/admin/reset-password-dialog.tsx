"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { resetUserPassword } from "@/actions/users";
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

export function ResetPasswordDialog({
  userId,
  fullName,
  username,
}: {
  userId: string;
  fullName: string;
  username: string;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const passwordId = useId();
  const confirmId = useId();

  function reset() {
    setPassword("");
    setConfirmPassword("");
    setError(undefined);
  }

  function handleSubmit() {
    if (password !== confirmPassword) {
      setError("Those two passwords don't match.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await resetUserPassword(userId, password);
      if (result.error) {
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
      toast.success(`Password reset for ${username}`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <KeyRound />
        Reset password
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Sets a new password for {fullName} ({username}). They aren&apos;t notified — tell them
            what it is, and note that any session they already have stays signed in for up to
            eight hours.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={passwordId}>New password</Label>
            <Input
              id={passwordId}
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={confirmId}>Confirm new password</Label>
            <Input
              id={confirmId}
              type="password"
              value={confirmPassword}
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={pending || !password} onClick={handleSubmit}>
            {pending ? "Resetting..." : "Reset password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
