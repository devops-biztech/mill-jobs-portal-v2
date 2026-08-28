import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getApplicationStatus } from "@/lib/application-status";
import { looksLikeConfirmationNumber } from "@/lib/confirmation-number";
import { companyWhereClause, type AccessScope } from "@/lib/access";
import { getReviewersForApplications, type Reviewer } from "@/lib/reviews";

export const APPLICATIONS_PAGE_SIZE = 25;
export const RECENT_WINDOW_MONTHS = 6;

export type { ApplicationStatus } from "@/lib/application-status";
export { getApplicationStatus } from "@/lib/application-status";

// The Application model has ~87 columns; the applications list and pending
// tables only ever render these. Selecting them explicitly (instead of the
// default full-row fetch) cuts the page payload substantially at scale.
const APPLICATION_LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  applicationPosition: true,
  companyName: true,
  date: true,
  email: true,
  primaryPhone: true,
  receivedByCompany: true,
  dismissApplicant: true,
} satisfies Prisma.ApplicationSelect;

type ApplicationListSelection = Prisma.ApplicationGetPayload<{
  select: typeof APPLICATION_LIST_SELECT;
}>;

/**
 * List rows carry their reviewers so the table can show who signed off
 * without a query per row. Empty for anything the sync flagged upstream,
 * which has a status but no reviewer to name.
 */
export type ApplicationListRow = ApplicationListSelection & { reviewers: Reviewer[] };

export async function getApplications({
  scope,
  page = 1,
  pageSize = APPLICATIONS_PAGE_SIZE,
  query,
  company,
  showAll = false,
}: {
  scope: AccessScope;
  page?: number;
  pageSize?: number;
  query?: string;
  company?: string;
  showAll?: boolean;
}) {
  // Tokenize so a full-name search like "Dylan Price" matches a record
  // where "Dylan" is the first name and "Price" is the last name — each
  // token must match some field, but not necessarily the same one.
  const tokens = query?.trim().split(/\s+/).filter(Boolean) ?? [];

  const where: Prisma.ApplicationWhereInput = {
    AND: [
      companyWhereClause(scope),
      company ? { companyName: company } : {},
      ...tokens.map((token) => ({
        OR: [
          { firstName: { contains: token } },
          { lastName: { contains: token } },
          { email: { contains: token } },
          { applicationPosition: { contains: token } },
          { primaryPhone: { contains: token } },
          /*
           * The id doubles as the confirmation number the applicant is given
           * on submission, so it's searchable through the same box — an
           * applicant who insists they applied can read theirs back and be
           * found even when nothing about their name or email matches what
           * they remember typing.
           *
           * Only for tokens shaped like part of a UUID: see
           * looksLikeConfirmationNumber for why an unguarded id match would
           * swamp ordinary name searches.
           */
          ...(looksLikeConfirmationNumber(token) ? [{ id: { contains: token } }] : []),
        ],
      })),
    ],
  };

  // `date` is stored as an inconsistently formatted free-text string (e.g.
  // "9/8/2023, 9:39:25 AM" vs "01/01/2024, 11:08:27 PM"), so a SQL-level
  // `ORDER BY date` sorts lexicographically, not chronologically. Sort by
  // parsed timestamp in application code instead, then page against that.
  const matches = await prisma.application.findMany({
    where,
    select: { id: true, date: true },
  });

  const parsed = matches.map((m) => {
    const time = m.date ? new Date(m.date).getTime() : NaN;
    return { id: m.id, time: Number.isNaN(time) ? -Infinity : time };
  });

  const totalAll = parsed.length;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RECENT_WINDOW_MONTHS);
  const cutoffTime = cutoff.getTime();

  // An active search always searches the full history — the recency window
  // is a browse-time default, not a search filter. Silently excluding a
  // real match because it's old is worse than showing an older result.
  const searchIgnoresRecency = tokens.length > 0 && !showAll;
  const effectiveShowAll = showAll || tokens.length > 0;

  const sorted = (effectiveShowAll ? parsed : parsed.filter((m) => m.time >= cutoffTime)).sort(
    (a, b) => b.time - a.time,
  );

  const total = sorted.length;
  const pageIds = sorted
    .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    .map((s) => s.id);

  const unorderedRows = await prisma.application.findMany({
    where: { id: { in: pageIds } },
    select: APPLICATION_LIST_SELECT,
  });
  const orderIndex = new Map(pageIds.map((id, i) => [id, i]));
  const reviewersByApplication = await getReviewersForApplications(pageIds);
  const rows: ApplicationListRow[] = unorderedRows
    .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0))
    .map((row) => ({ ...row, reviewers: reviewersByApplication.get(row.id) ?? [] }));

  return {
    rows,
    total,
    totalAll,
    hiddenOlderCount: totalAll - total,
    searchIgnoresRecency,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getPendingApplications({
  scope,
  limit = 20,
}: {
  scope: AccessScope;
  limit?: number;
}) {
  const matches = await prisma.application.findMany({
    where: {
      AND: [{ receivedByCompany: false, dismissApplicant: false }, companyWhereClause(scope)],
    },
    select: { id: true, date: true },
  });

  const sortedIds = matches
    .map((m) => {
      const time = m.date ? new Date(m.date).getTime() : NaN;
      return { id: m.id, time: Number.isNaN(time) ? -Infinity : time };
    })
    .sort((a, b) => b.time - a.time)
    .slice(0, limit)
    .map((m) => m.id);

  const unorderedRows = await prisma.application.findMany({
    where: { id: { in: sortedIds } },
    select: APPLICATION_LIST_SELECT,
  });
  const orderIndex = new Map(sortedIds.map((id, i) => [id, i]));
  // Pending by definition means nobody has signed off, so there are no
  // reviewers to look up — the empty list keeps the row shape uniform.
  const rows: ApplicationListRow[] = unorderedRows
    .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0))
    .map((row) => ({ ...row, reviewers: [] }));

  return { rows, total: matches.length };
}

/**
 * Returns null both when the id doesn't exist and when it exists but is
 * outside the caller's access scope — callers should treat both the same
 * way (404), so this never leaks whether an out-of-scope id exists.
 */
export async function getApplicationById(id: string, scope: AccessScope) {
  return prisma.application.findFirst({
    where: { AND: [{ id }, companyWhereClause(scope)] },
  });
}

export async function getApplicationCompanies(scope: AccessScope) {
  const rows = await prisma.application.findMany({
    where: { AND: [{ companyName: { not: null } }, companyWhereClause(scope)] },
    select: { companyName: true },
    distinct: ["companyName"],
    orderBy: { companyName: "asc" },
  });
  return rows.map((r) => r.companyName as string);
}

export const RECENT_STATS_WINDOW_DAYS = 90;
export const CHART_WINDOW_MONTHS = 12;

export async function getDashboardStats(scope: AccessScope) {
  const applications = await prisma.application.findMany({
    where: companyWhereClause(scope),
    select: { date: true, companyName: true, receivedByCompany: true, dismissApplicant: true },
  });

  const recentCutoff = Date.now() - RECENT_STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const chartCutoffDate = new Date();
  chartCutoffDate.setMonth(chartCutoffDate.getMonth() - CHART_WINDOW_MONTHS);
  const chartCutoff = chartCutoffDate.getTime();

  let pending = 0;
  let recentCount = 0;
  let reviewedRecent = 0;
  const byMonthMap = new Map<string, number>();
  const byCompanyMap = new Map<string, number>();

  for (const app of applications) {
    const isReviewed = getApplicationStatus(app) === "reviewed";
    if (!isReviewed) pending += 1;

    const parsed = app.date ? new Date(app.date) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) continue;

    const time = parsed.getTime();

    if (time >= recentCutoff) {
      recentCount += 1;
      if (isReviewed) reviewedRecent += 1;
    }

    // Charts only reflect the last CHART_WINDOW_MONTHS of submissions.
    if (time >= chartCutoff) {
      const monthKey = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
      byMonthMap.set(monthKey, (byMonthMap.get(monthKey) ?? 0) + 1);

      const company = app.companyName ?? "Unknown";
      byCompanyMap.set(company, (byCompanyMap.get(company) ?? 0) + 1);
    }
  }

  const byMonth = Array.from(byMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-CHART_WINDOW_MONTHS)
    .map(([month, count]) => ({ month, count }));

  const byCompany = Array.from(byCompanyMap.entries())
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => b.count - a.count);

  return { recentCount, reviewedRecent, pending, byMonth, byCompany };
}
