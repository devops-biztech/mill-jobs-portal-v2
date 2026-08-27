import type { ApplicationStatus } from "@/lib/application-status";

/**
 * Portal review state, as the PDFs show it.
 *
 * `reviewer` is null whenever nothing in the portal claims responsibility for
 * the current state: applications imported from the AWS dataset arrive with
 * the upstream review flags already set and no actor behind them, and
 * anything reviewed before the activity log existed has no entry either. See
 * `getApplicationReviewer`.
 */
export type PdfReview = {
  status: ApplicationStatus;
  reviewer: { name: string; at: Date } | null;
};

/**
 * The single wording every template prints.
 *
 * AGENTS.md requires a field added to one template to be added to all three.
 * Sharing the formatter rather than the field alone is what stops the three
 * from drifting into three phrasings of the same fact the next time one of
 * them is edited.
 *
 * "Reviewed" without a name is deliberate rather than a blank: the status is
 * genuinely known, only the attribution is missing, and today that is true of
 * every application already in the database.
 */
export function formatReview(review: PdfReview): string {
  if (review.status !== "reviewed") return "Pending review";
  if (!review.reviewer) return "Reviewed";

  const on = review.reviewer.at.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `Reviewed by ${review.reviewer.name} on ${on}`;
}
