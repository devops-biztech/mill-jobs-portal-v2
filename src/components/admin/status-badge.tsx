import { Badge } from "@/components/ui/badge";
import type { ApplicationStatus } from "@/lib/application-status";

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  pending: "bg-status-pending text-status-pending-foreground",
  reviewed: "bg-status-reviewed text-status-reviewed-foreground",
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Pending",
  reviewed: "Reviewed",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
