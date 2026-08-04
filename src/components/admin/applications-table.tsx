"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { ApplicationListRow } from "@/lib/applications";
import { applicationsColumns } from "@/components/admin/applications-columns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ApplicationsTable({
  rows,
  total,
  totalAll,
  hiddenOlderCount,
  searchIgnoresRecency,
  page,
  pageCount,
  query,
  company,
  companies,
  showAll,
  recentWindowMonths,
}: {
  rows: ApplicationListRow[];
  total: number;
  totalAll: number;
  hiddenOlderCount: number;
  searchIgnoresRecency: boolean;
  page: number;
  pageCount: number;
  query: string;
  company: string;
  companies: string[];
  showAll: boolean;
  recentWindowMonths: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(query);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSearch(query);
  }, [query]);

  function pushParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (search !== query) pushParams({ q: search || undefined, page: undefined });
    }, 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const table = useReactTable({
    data: rows,
    columns: applicationsColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search name, email, phone, position..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          items={{ all: "All companies", ...Object.fromEntries(companies.map((c) => [c, c])) }}
          value={company || "all"}
          onValueChange={(value) =>
            pushParams({ company: value && value !== "all" ? value : undefined, page: undefined })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {total} application{total === 1 ? "" : "s"}
          {!showAll && hiddenOlderCount > 0 ? ` of ${totalAll} total` : ""}
        </span>
      </div>

      {searchIgnoresRecency ? (
        <div className="flex items-center rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span>
            Searching all applications — matches aren&apos;t limited to the last{" "}
            {recentWindowMonths} months.
          </span>
        </div>
      ) : null}

      {!showAll && hiddenOlderCount > 0 ? (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span>
            Showing applications from the last {recentWindowMonths} months. {hiddenOlderCount}{" "}
            older application{hiddenOlderCount === 1 ? "" : "s"} hidden.
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => pushParams({ range: "all", page: undefined })}
          >
            Show all applications
          </Button>
        </div>
      ) : null}

      {showAll ? (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span>
            Showing all {totalAll} application{totalAll === 1 ? "" : "s"}, including older ones.
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => pushParams({ range: undefined, page: undefined })}
          >
            Show recent only
          </Button>
        </div>
      ) : null}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={applicationsColumns.length} className="h-24 text-center">
                  {query ? `No applications match "${query}".` : "No applications found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isPending}
            onClick={() => pushParams({ page: String(page - 1) })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount || isPending}
            onClick={() => pushParams({ page: String(page + 1) })}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
