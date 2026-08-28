import type { ApplicationStatus } from "@/lib/application-status";

/**
 * Portal review state, as the PDFs show it.
 *
 * `reviewers` is a list because several people can sign off on the same
 * application. It is empty whenever nothing in the portal claims
 * responsibility for the current state: applications imported from the AWS
 * dataset arrive with the upstream review flags already set and nobody
 * behind them.
 */
export type PdfReview = {
  status: ApplicationStatus;
  reviewers: { name: string; at: Date }[];
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
  if (review.reviewers.length === 0) return "Reviewed";

  const on = (at: Date) =>
    at.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // A single reviewer reads as a sentence; several need their own dates, so
  // each name carries its own rather than the list sharing the latest one and
  // implying everybody signed off the same day.
  const [first, ...rest] = review.reviewers;
  if (rest.length === 0) return `Reviewed by ${first.name} on ${on(first.at)}`;

  return `Reviewed by ${review.reviewers.map((r) => `${r.name} (${on(r.at)})`).join(", ")}`;
}
