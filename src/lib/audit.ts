import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Every action the activity log records. Stored as the literal string, so
 * these values are effectively part of the schema — rename one and the
 * existing rows stop matching it.
 */
export const AUDIT_ACTIONS = {
  applicationReviewed: "application.reviewed",
  applicationUnreviewed: "application.unreviewed",
  applicationDeleted: "application.deleted",
  userCreated: "user.created",
  userPasswordReset: "user.password_reset",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_PAGE_SIZE = 50;

export type AuditActor = { id: string; name: string };

export type AuditEntry = {
  actor: AuditActor;
  action: AuditAction;
  targetId: string;
  /** Applicant name or username — whatever a person would recognise. */
  targetLabel?: string | null;
  companyName?: string | null;
  detail?: string | null;
};

/**
 * Accepts either the shared client or a transaction client, so a log entry
 * can be made atomic with the change it describes. `deleteApplication` relies
 * on that: a delete that committed without its log entry would be exactly the
 * event the log exists to capture, silently missing.
 */
type AuditWriter = Pick<Prisma.TransactionClient, "auditLog">;

export async function recordAudit(
  entry: AuditEntry,
  client: AuditWriter = prisma,
): Promise<void> {
  await client.auditLog.create({
    data: {
      id: randomUUID(),
      actorId: entry.actor.id,
      actorName: entry.actor.name,
      action: entry.action,
      targetId: entry.targetId,
      targetLabel: entry.targetLabel ?? null,
      companyName: entry.companyName ?? null,
      detail: entry.detail ?? null,
    },
  });
}

export type AuditLogRow = {
  id: string;
  createdAt: Date;
  actorName: string;
  action: string;
  targetId: string;
  targetLabel: string | null;
  companyName: string | null;
  detail: string | null;
};

/**
 * The log is admin-only and admins already see every mill, so there is no
 * per-mill scoping here — unlike every query in `applications.ts`. The page
 * that calls this is responsible for the admin check.
 */
export async function getAuditLog({
  page = 1,
  pageSize = AUDIT_PAGE_SIZE,
}: {
  page?: number;
  pageSize?: number;
} = {}) {
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count(),
  ]);

  return {
    rows: rows as AuditLogRow[],
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type ApplicationReviewer = { name: string; at: Date };

/**
 * Who last marked this application reviewed, when the portal was what did it.
 *
 * Null means the current reviewed state has no actor behind it, which is the
 * common case rather than an edge one: the AWS sync inserts applications with
 * the upstream review flags already set and deliberately records no audit
 * entry, and anything reviewed before the activity log existed has none
 * either. The status badge is still correct for those — only the attribution
 * is missing, so the caller omits the line rather than inventing a name.
 *
 * The newest reviewed/unreviewed entry has to be a `reviewed` one to count.
 * A later unreview means the name attached to the older entry no longer
 * describes the current state, and a stale reviewer is worse than none.
 *
 * No mill scoping here, for the same reason as `getAuditLog`: callers reach
 * this only after `getApplicationById` has already refused ids outside their
 * scope, so the id itself is the gate.
 */
export async function getApplicationReviewer(
  applicationId: string,
): Promise<ApplicationReviewer | null> {
  const latest = await prisma.auditLog.findFirst({
    where: {
      targetId: applicationId,
      action: {
        in: [AUDIT_ACTIONS.applicationReviewed, AUDIT_ACTIONS.applicationUnreviewed],
      },
    },
    orderBy: { createdAt: "desc" },
    select: { action: true, actorName: true, createdAt: true },
  });

  if (latest?.action !== AUDIT_ACTIONS.applicationReviewed) return null;
  return { name: latest.actorName, at: latest.createdAt };
}
