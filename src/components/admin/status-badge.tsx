import { Badge } from "@/components/ui/badge";
import type { ApplicationStatus } from "@/lib/application-status";
import { reviewerInitials, type Reviewer } from "@/lib/reviewer";

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  pending: "bg-status-pending text-status-pending-foreground",
  reviewed: "bg-status-reviewed text-status-reviewed-foreground",
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Pending",
  reviewed: "Reviewed",
};

/**
 * `reviewers` is optional: the list folds them into the badge label as
 * initials, while the detail page passes none and names them in full
 * underneath instead. Anything the sync flagged upstream has a status and no
 * reviewers, so it falls back to the plain label.
 */
export function StatusBadge({
  status,
  reviewers = [],
}: {
  status: ApplicationStatus;
  reviewers?: Reviewer[];
}) {
  const initials = reviewers.map((reviewer) => reviewerInitials(reviewer.name)).join(", ");
  const label =
    status === "reviewed" && initials ? `Reviewed by ${initials}` : STATUS_LABELS[status];

  return (
    <Badge
      variant="outline"
      className={STATUS_STYLES[status]}
      /* Initials collide at two letters; the full names disambiguate them. */
      title={reviewers.map((reviewer) => reviewer.name).join(", ") || undefined}
    >
      {label}
    </Badge>
  );
}
