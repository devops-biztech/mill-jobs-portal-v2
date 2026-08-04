import { ClipboardCheck, Clock, FileStack } from "lucide-react";
import {
  CHART_WINDOW_MONTHS,
  getDashboardStats,
  getPendingApplications,
  RECENT_STATS_WINDOW_DAYS,
} from "@/lib/applications";
import { getAccessScope } from "@/lib/access";
import { StatCard } from "@/components/admin/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicationsTrendChart } from "@/components/admin/applications-trend-chart";
import { ApplicationsCompanyChart } from "@/components/admin/applications-company-chart";
import { PendingApplicationsTable } from "@/components/admin/pending-applications-table";
import { SyncAwsButton } from "@/components/admin/sync-aws-button";

const PENDING_LIMIT = 20;

export default async function AdminOverviewPage() {
  const scope = await getAccessScope();
  const [stats, pending] = await Promise.all([
    getDashboardStats(scope),
    getPendingApplications({ scope, limit: PENDING_LIMIT }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Snapshot of job applications submitted through the portal.
          </p>
        </div>
        <SyncAwsButton />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={`Applications (last ${RECENT_STATS_WINDOW_DAYS} days)`}
          value={stats.recentCount}
          icon={FileStack}
        />
        <StatCard label="Pending review" value={stats.pending} icon={Clock} tone="pending" />
        <StatCard
          label={`Reviewed (last ${RECENT_STATS_WINDOW_DAYS} days)`}
          value={stats.reviewedRecent}
          icon={ClipboardCheck}
          tone="reviewed"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Applications over time</CardTitle>
            <CardDescription>Last {CHART_WINDOW_MONTHS} months</CardDescription>
          </CardHeader>
          <CardContent>
            <ApplicationsTrendChart data={stats.byMonth} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Applications by company</CardTitle>
            <CardDescription>Last {CHART_WINDOW_MONTHS} months</CardDescription>
          </CardHeader>
          <CardContent>
            <ApplicationsCompanyChart data={stats.byCompany} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending review</CardTitle>
        </CardHeader>
        <CardContent>
          <PendingApplicationsTable rows={pending.rows} />
          {pending.total > pending.rows.length ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Showing {pending.rows.length} most recent of {pending.total} pending applications.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
