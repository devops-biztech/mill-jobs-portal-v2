"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { ApplicationListRow } from "@/lib/applications";
import { getApplicationStatus } from "@/lib/application-status";
import { formatDate } from "@/lib/format-date";
import { StatusBadge } from "@/components/admin/status-badge";

export const applicationsColumns: ColumnDef<ApplicationListRow>[] = [
  {
    id: "name",
    header: "Applicant",
    cell: ({ row }) => {
      const app = row.original;
      const name = [app.firstName, app.lastName].filter(Boolean).join(" ") || "—";
      return (
        <Link href={`/admin/applications/${app.id}`} className="font-medium hover:underline">
          {name}
        </Link>
      );
    },
  },
  {
    accessorKey: "applicationPosition",
    header: "Position",
    cell: ({ getValue }) => (getValue() as string) || "—",
  },
  {
    accessorKey: "companyName",
    header: "Company",
    cell: ({ getValue }) => (getValue() as string) || "—",
  },
  {
    accessorKey: "date",
    header: "Submitted",
    cell: ({ getValue }) => formatDate(getValue() as string | null),
  },
  {
    id: "contact",
    header: "Contact",
    cell: ({ row }) => (
      <div className="flex flex-col text-sm">
        <span>{row.original.email || "—"}</span>
        <span className="text-muted-foreground">{row.original.primaryPhone || "—"}</span>
      </div>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={getApplicationStatus(row.original)} />,
  },
];
