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
