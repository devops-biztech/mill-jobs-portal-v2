/**
 * Client-safe half of the review model, split from `reviews.ts` the same way
 * `application-status.ts` is split from `applications.ts`: the table renders
 * initials in a client component and cannot import a `server-only` module.
 */

export type Reviewer = {
  userId: string;
  name: string;
  at: Date;
};

/**
 * "Tim Davis" -> "TD". First and last initial only, because these render
 * beside the status badge in the list where a full name will not fit. Two
 * people can collide on the same pair, which is why callers put the full
 * names in a title attribute alongside.
 */
export function reviewerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (parts[0][0] + last).toUpperCase();
}
