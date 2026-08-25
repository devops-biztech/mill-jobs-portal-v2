"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAccessScope, canAccessCompany } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS, recordAudit, type AuditActor } from "@/lib/audit";

/** The applicant's name as the log should show it, or null if we have none. */
function applicantLabel(app: { firstName: string | null; lastName: string | null }) {
  return [app.firstName, app.lastName].filter(Boolean).join(" ") || null;
}

export async function setApplicationStatus(id: string, status: "reviewed" | "pending") {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const scope = await getAccessScope();
  const app = await prisma.application.findUnique({
    where: { id },
    select: { companyName: true, firstName: true, lastName: true },
  });
  if (!app || !canAccessCompany(scope, app.companyName)) {
    throw new Error("Application not found");
  }

  const actor: AuditActor = { id: session.userId, name: session.fullName };

  // receivedByCompany and dismissApplicant are treated as the same real-world
  // action ("reviewed"), so both are set together to keep them in sync.
  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id },
      data: {
        receivedByCompany: status === "reviewed",
        dismissApplicant: status === "reviewed",
      },
    });

    await recordAudit(
      {
        actor,
        action:
          status === "reviewed"
            ? AUDIT_ACTIONS.applicationReviewed
            : AUDIT_ACTIONS.applicationUnreviewed,
        targetId: id,
        targetLabel: applicantLabel(app),
        companyName: app.companyName,
      },
      tx,
    );
  });

  revalidatePath("/admin");
  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${id}`);
  revalidatePath("/admin/logs");
}

/**
 * Permanently removes an application. Unlike marking one reviewed, this is
 * not reversible and there is no soft-delete flag to undo — it exists so
 * admins can clear the upstream duplicates described in the README, which
 * would otherwise inflate every report the portal produces.
 *
 * Admin-only, and deliberately not exposed anywhere a row can be deleted in
 * passing: the only entry point is the detail page, where whoever is deleting
 * has the actual record in front of them. Two upstream duplicates differ only
 * by id, and at least one apparent duplicate is a genuine second application,
 * so "which row is this" is a judgement the UI can't make for you.
 */
export async function deleteApplication(id: string) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const scope = await getAccessScope();
  if (!scope.isAdmin) throw new Error("Not authorized");

  const app = await prisma.application.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true, companyName: true, date: true },
  });
  if (!app) throw new Error("Application not found");

  await prisma.$transaction(async (tx) => {
    /*
     * ApplicantDemographics has no relation to Application on purpose (see
     * the schema), which also means no cascade — its row has to be removed
     * by hand. Leaving it would be worse than an orphan: the EEO aggregates
     * would keep counting a submission whose application no longer exists,
     * so deleting a duplicate would fix the application counts while
     * permanently skewing the demographic ones.
     */
    await tx.applicantDemographics.deleteMany({ where: { applicationId: id } });
    await tx.application.delete({ where: { id } });

    /*
     * Tombstone the upstream id, or this delete lasts only until the next
     * sync. The record still exists in AWS and nothing here can remove it;
     * the sync skips what it already has locally, and deleting the row is
     * exactly what makes it stop looking already-had. Without this the
     * application returns on the next sync carrying the upstream review
     * flags, so a reviewed one comes back pending.
     */
    /*
     * Upsert, not create: a record deleted before this tombstone existed can
     * already be back in the table and tombstoned at the same time, and
     * deleting it again must not fail on the primary key. Re-deleting simply
     * restamps who did it and when.
     */
    await tx.deletedApplication.upsert({
      where: { id: app.id },
      create: {
        id: app.id,
        actorId: session.userId,
        actorName: session.fullName,
        companyName: app.companyName,
      },
      update: {
        deletedAt: new Date(),
        actorId: session.userId,
        actorName: session.fullName,
        companyName: app.companyName,
      },
    });

    /*
     * Inside the transaction: a delete that committed without its log entry
     * is precisely the event this log exists to record.
     */
    await recordAudit(
      {
        actor: { id: session.userId, name: session.fullName },
        action: AUDIT_ACTIONS.applicationDeleted,
        targetId: app.id,
        targetLabel: applicantLabel(app),
        companyName: app.companyName,
        detail: app.date ? `submitted ${app.date}` : null,
      },
      tx,
    );
  });

  revalidatePath("/admin");
  revalidatePath("/admin/applications");
  revalidatePath("/admin/logs");
  redirect("/admin/applications");
}
