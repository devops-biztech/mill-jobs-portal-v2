import { getApplicationCompanies, getApplications, RECENT_WINDOW_MONTHS } from "@/lib/applications";
import { getAccessScope } from "@/lib/access";
import { ApplicationsTable } from "@/components/admin/applications-table";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; company?: string; range?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const query = params.q?.trim() ?? "";
  const company = params.company ?? "";
  const showAll = params.range === "all";

  const scope = await getAccessScope();
  const [
    { rows, total, totalAll, hiddenOlderCount, searchIgnoresRecency, pageCount },
    companies,
  ] = await Promise.all([
    getApplications({ scope, page, query: query || undefined, company: company || undefined, showAll }),
    getApplicationCompanies(scope),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          All job applications submitted through the portal.
        </p>
      </div>
      <ApplicationsTable
        rows={rows}
        total={total}
        totalAll={totalAll}
        hiddenOlderCount={hiddenOlderCount}
        searchIgnoresRecency={searchIgnoresRecency}
        page={page}
        pageCount={pageCount}
        query={query}
        company={company}
        companies={companies}
        showAll={showAll}
        recentWindowMonths={RECENT_WINDOW_MONTHS}
      />
    </div>
  );
}
