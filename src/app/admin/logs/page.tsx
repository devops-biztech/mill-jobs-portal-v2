import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessScope } from "@/lib/access";
import { getAuditLog } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { AuditLogTable } from "@/components/admin/audit-log-table";

/**
 * Pagination control for a server-rendered page. Renders a real disabled
 * button at the ends rather than a disabled link — `disabled` does nothing to
 * an anchor, so a link styled as unavailable would still navigate.
 */
function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" nativeButton={false} render={<Link href={href} />}>
      {children}
    </Button>
  );
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const scope = await getAccessScope();
  if (!scope.isAdmin) redirect("/admin");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const { rows, total, pageCount } = await getAuditLog({ page });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Who changed what in the portal. Records review status changes, new accounts, password
          resets and permanent deletions — not the AWS sync, which has no person behind it.
        </p>
      </div>

      <div className="flex items-center justify-end">
        <span className="text-sm text-muted-foreground">
          {total} entr{total === 1 ? "y" : "ies"}
        </span>
      </div>

      <AuditLogTable rows={rows} />

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <PageLink href={`/admin/logs?page=${page - 1}`} disabled={page <= 1}>
            Previous
          </PageLink>
          <PageLink href={`/admin/logs?page=${page + 1}`} disabled={page >= pageCount}>
            Next
          </PageLink>
        </div>
      </div>
    </div>
  );
}
