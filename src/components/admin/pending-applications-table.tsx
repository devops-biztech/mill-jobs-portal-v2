"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ApplicationListRow } from "@/lib/applications";
import { formatDate } from "@/lib/format-date";
import { addApplicationReview } from "@/actions/applications";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export function PendingApplicationsTable({ rows }: { rows: ApplicationListRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No applications are currently pending review.
      </p>
    );
  }

  function markReviewed(id: string) {
    startTransition(async () => {
      await addApplicationReview(id);
      toast.success("Marked as reviewed");
      router.refresh();
    });
  }

  function downloadPdf(id: string) {
    window.open(`/api/admin/applications/${id}/pdf`, "_blank", "noopener,noreferrer");
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Applicant</TableHead>
          <TableHead>Position</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead>Contact</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((app) => {
          const name = [app.firstName, app.lastName].filter(Boolean).join(" ") || "—";
          return (
            <ContextMenu key={app.id}>
              <ContextMenuTrigger
                render={
                  <TableRow
                    className="cursor-pointer"
                    aria-disabled={isPending}
                    onClick={() => router.push(`/admin/applications/${app.id}`)}
                  />
                }
              >
                <TableCell className="font-medium">{name}</TableCell>
                <TableCell>{app.applicationPosition || "—"}</TableCell>
                <TableCell>{app.companyName || "—"}</TableCell>
                <TableCell>{formatDate(app.date)}</TableCell>
                <TableCell>
                  <div className="flex flex-col text-sm">
                    <span>{app.email || "—"}</span>
                    <span className="text-muted-foreground">{app.primaryPhone || "—"}</span>
                  </div>
                </TableCell>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem disabled={isPending} onClick={() => markReviewed(app.id)}>
                  Mark as reviewed
                </ContextMenuItem>
                <ContextMenuItem onClick={() => downloadPdf(app.id)}>Download PDF</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </TableBody>
    </Table>
  );
}
