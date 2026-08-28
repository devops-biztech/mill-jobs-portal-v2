import "server-only";
import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS, recordAudit, type AuditActor } from "@/lib/audit";
import type { Reviewer } from "@/lib/reviewer";

export type { Reviewer } from "@/lib/reviewer";
export { reviewerInitials } from "@/lib/reviewer";

/*
 * No mill scoping in this module, matching `audit.ts`: callers reach it only
 * with ids that `getApplications`/`getApplicationById` already filtered by
 * access scope, so the ids themselves are the gate.
 */

/** Everyone who has signed off on one application, oldest first. */
export async function getApplicationReviewers(applicationId: string): Promise<Reviewer[]> {
  const rows = await prisma.applicationReview.findMany({
    where: { applicationId },
    orderBy: { reviewedAt: "asc" },
  });
  return rows.map((r) => ({ userId: r.userId, name: r.reviewerName, at: r.reviewedAt }));
}

/**
 * The same, for a page of applications at once — one query for the whole
 * table rather than one per row.
 */
export async function getReviewersForApplications(
  applicationIds: string[],
): Promise<Map<string, Reviewer[]>> {
  const byApplication = new Map<string, Reviewer[]>();
  if (applicationIds.length === 0) return byApplication;

  const rows = await prisma.applicationReview.findMany({
    where: { applicationId: { in: applicationIds } },
    orderBy: { reviewedAt: "asc" },
  });

  for (const row of rows) {
    const list = byApplication.get(row.applicationId) ?? [];
    list.push({ userId: row.userId, name: row.reviewerName, at: row.reviewedAt });
    byApplication.set(row.applicationId, list);
  }
  return byApplication;
}

/**
 * The write half, kept out of `actions/applications.ts` because a `use server`
 * module may only export server actions — which leaves no way to exercise this
 * logic except through an authenticated request. The actions authenticate and
 * scope, then delegate here.
 */
type ReviewTarget = {
  applicationId: string;
  actor: AuditActor;
  applicantLabel: string | null;
  companyName: string | null;
};

/**
 * Adds one person's sign-off and flags the application reviewed.
 *
 * `upsert`, not `create`: clicking twice restamps the time rather than
 * failing on the composite key. The status booleans are set here and only
 * cleared when the last review is withdrawn, so `getApplicationStatus` needs
 * no knowledge of this table.
 */
export async function recordReview({
  applicationId,
  actor,
  applicantLabel,
  companyName,
}: ReviewTarget): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.applicationReview.upsert({
      where: { applicationId_userId: { applicationId, userId: actor.id } },
      create: { applicationId, userId: actor.id, reviewerName: actor.name },
      /*
       * `reviewedAt` is deliberately not restamped. It records when this
       * person first signed off, and reviewers are listed in that order — so
       * restamping would silently reorder the list on a repeat click without
       * anything having changed. Only the name refreshes, in case theirs did.
       */
      update: { reviewerName: actor.name },
    });

    // receivedByCompany and dismissApplicant are the same real-world action
    // ("reviewed"), so both are set together.
    await tx.application.update({
      where: { id: applicationId },
      data: { receivedByCompany: true, dismissApplicant: true },
    });

    await recordAudit(
      {
        actor,
        action: AUDIT_ACTIONS.applicationReviewed,
        targetId: applicationId,
        targetLabel: applicantLabel,
        companyName,
      },
      tx,
    );
  });
}

/**
 * Removes only this person's sign-off, and returns how many others remain.
 *
 * Someone else's review is not theirs to withdraw, so the application stays
 * reviewed while anyone is still on it. An application the sync flagged has
 * no review rows at all, so the first withdrawal clears the upstream flags —
 * which is what the old single "Reset to pending" button did.
 */
export async function removeReview({
  applicationId,
  actor,
  applicantLabel,
  companyName,
}: ReviewTarget): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.applicationReview.deleteMany({
      where: { applicationId, userId: actor.id },
    });

    const remaining = await tx.applicationReview.count({ where: { applicationId } });
    if (remaining === 0) {
      await tx.application.update({
        where: { id: applicationId },
        data: { receivedByCompany: false, dismissApplicant: false },
      });
    }

    await recordAudit(
      {
        actor,
        action: AUDIT_ACTIONS.applicationUnreviewed,
        targetId: applicationId,
        targetLabel: applicantLabel,
        companyName,
        detail: remaining > 0 ? `${remaining} other reviewer(s) remain` : null,
      },
      tx,
    );

    return remaining;
  });
}
