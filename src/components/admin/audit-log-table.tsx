import Link from "next/link";
import { AUDIT_ACTIONS, type AuditLogRow } from "@/lib/audit";
import { shortConfirmationNumber } from "@/lib/confirmation-number";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const ACTIONS: Record<string, { label: string; variant: BadgeVariant }> = {
  [AUDIT_ACTIONS.applicationReviewed]: { label: "Marked reviewed", variant: "secondary" },
  [AUDIT_ACTIONS.applicationUnreviewed]: { label: "Reset to pending", variant: "outline" },
  [AUDIT_ACTIONS.applicationDeleted]: { label: "Deleted permanently", variant: "destructive" },
  [AUDIT_ACTIONS.userCreated]: { label: "User created", variant: "secondary" },
  [AUDIT_ACTIONS.userPasswordReset]: { label: "Password reset", variant: "outline" },
};

function formatTimestamp(value: Date) {
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Subject({ entry }: { entry: AuditLogRow }) {
  const isApplication = entry.action.startsWith("application.");

  if (!isApplication) {
    return <span className="font-medium">{entry.targetLabel ?? entry.targetId}</span>;
  }

  const shortId = shortConfirmationNumber(entry.targetId);

  /*
   * A deleted application has no detail page left to link to, so its entry
   * renders as plain text. That row is also the only place the applicant's
   * name still exists in the database — everything else about them is gone.
   */
  const label = (
    <>
      <span className="font-medium">{entry.targetLabel ?? "Applicant"}</span>{" "}
      <span className="font-mono text-xs text-muted-foreground">{shortId}…</span>
    </>
  );

  if (entry.action === AUDIT_ACTIONS.applicationDeleted) {
    return <span className="text-muted-foreground">{label}</span>;
  }

  return (
    <Link href={`/admin/applications/${entry.targetId}`} className="hover:underline">
      {label}
    </Link>
  );
}

export function AuditLogTable({ rows }: { rows: AuditLogRow[] }) {
  return (
    <div className="rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Who</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Application / user</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((entry) => {
              const action = ACTIONS[entry.action];
              return (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatTimestamp(entry.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">{entry.actorName}</TableCell>
                  <TableCell>
                    <Badge variant={action?.variant ?? "outline"}>
                      {action?.label ?? entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Subject entry={entry} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[entry.companyName, entry.detail].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                Nothing has been recorded yet. Reviewing an application, creating a user or
                resetting a password will show up here.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
