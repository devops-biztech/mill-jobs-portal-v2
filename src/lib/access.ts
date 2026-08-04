import "server-only";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";
import { MILL_CODES, ACCESS_FIELD_BY_MILL, type MillCode } from "@/lib/mills";

export { MILL_CODES, ACCESS_FIELD_BY_MILL };
export type { MillCode };

export type AccessScope = {
  isAdmin: boolean;
  /** Mill codes the user is explicitly flagged for. Irrelevant when isAdmin is true. */
  companies: MillCode[];
};

/**
 * Resolves the current session's mill access, reading fresh from the User
 * table (not from the session cookie) so that revoking a mill flag takes
 * effect on the user's very next request rather than waiting for their
 * session to expire.
 */
export async function getAccessScope(): Promise<AccessScope> {
  const session = await getSession();
  if (!session) return { isAdmin: false, companies: [] };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { isAdmin: false, companies: [] };

  const companies = MILL_CODES.filter((code) => user[ACCESS_FIELD_BY_MILL[code]]);
  return { isAdmin: user.adminAccess, companies };
}

/** Prisma `where` fragment scoping a query to the given access scope. */
export function companyWhereClause(scope: AccessScope): Prisma.ApplicationWhereInput {
  if (scope.isAdmin) return {};
  return { companyName: { in: scope.companies } };
}

export function canAccessCompany(scope: AccessScope, companyName: string | null): boolean {
  if (scope.isAdmin) return true;
  if (!companyName) return false;
  return scope.companies.includes(companyName as MillCode);
}
