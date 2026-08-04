"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { createUser } from "@/actions/users";
import { MILL_CODES } from "@/lib/mills";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(undefined);
    startTransition(async () => {
      const result = await createUser({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) formRef.current?.reset();
      }}
    >
      <DialogTrigger render={<Button />}>
        <UserPlus />
        Add user
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            New users can only process applications — they won&apos;t have admin
            access.
          </DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" name="fullName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" autoComplete="off" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="homeMill">Home mill</Label>
            <Select name="homeMill" required>
              <SelectTrigger id="homeMill" className="w-full">
                <SelectValue placeholder="Select a mill" />
              </SelectTrigger>
              <SelectContent>
                {MILL_CODES.map((mill) => (
                  <SelectItem key={mill} value={mill}>
                    {mill}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Mill access</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {MILL_CODES.map((mill) => (
                <label
                  key={mill}
                  className="flex items-center gap-1.5 text-sm text-foreground"
                >
                  <Checkbox name="mills" value={mill} />
                  {mill}
                </label>
              ))}
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? "Creating..." : "Create user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
