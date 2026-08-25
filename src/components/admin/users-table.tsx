"use client";

import { useState, useTransition } from "react";
import { updateUserMillAccess } from "@/actions/users";
import { MILL_CODES, type MillCode } from "@/lib/mills";
import type { UserSummary } from "@/lib/users";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";
import { ResetPasswordDialog } from "@/components/admin/reset-password-dialog";

function MillAccessRow({ user }: { user: UserSummary }) {
  const [mills, setMills] = useState<MillCode[]>(user.mills);
  const [isPending, startTransition] = useTransition();

  function toggle(mill: MillCode, checked: boolean) {
    const next = checked ? [...mills, mill] : mills.filter((m) => m !== mill);
    setMills(next);
    startTransition(async () => {
      try {
        await updateUserMillAccess(user.id, next);
      } catch {
        setMills(mills);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {MILL_CODES.map((mill) => (
        <label
          key={mill}
          className="flex items-center gap-1.5 text-sm text-foreground"
        >
          <Checkbox
            checked={mills.includes(mill)}
            disabled={isPending}
            onCheckedChange={(checked) => toggle(mill, checked === true)}
          />
          {mill}
        </label>
      ))}
    </div>
  );
}

export function UsersTable({ users }: { users: UserSummary[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateUserDialog />
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Home mill</TableHead>
              <TableHead>Mill access</TableHead>
              <TableHead className="text-right">Password</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.fullName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {user.username}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.homeMill || "—"}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {user.adminAccess ? (
                    <Badge variant="secondary">Admin — sees all mills</Badge>
                  ) : (
                    <MillAccessRow user={user} />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <ResetPasswordDialog
                    userId={user.id}
                    fullName={user.fullName}
                    username={user.username}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
