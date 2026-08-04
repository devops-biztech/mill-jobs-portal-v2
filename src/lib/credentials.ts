import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const BCRYPT_PREFIX = /^\$2[aby]\$/;

const ACCESS_FIELDS = ["nflAccess", "trlAccess", "srmAccess", "sliAccess", "stlcAccess", "glAccess"] as const;

/**
 * Verifies a login and transparently upgrades legacy plaintext passwords
 * (inherited from the pre-Prisma DocuSign-era User table) to bcrypt hashes
 * on first successful login.
 *
 * `adminAccess` is a "sees every mill" override, not the login gate itself —
 * any user with at least one mill flag (or the admin override) can sign in;
 * what they can see is scoped separately (see src/lib/access.ts).
 */
export async function verifyAdminCredentials(username: string, password: string) {
  const user = await prisma.user.findFirst({ where: { username } });
  if (!user) return null;

  const hasAccess = user.adminAccess || ACCESS_FIELDS.some((field) => user[field]);
  if (!hasAccess) return null;

  const storedIsHashed = BCRYPT_PREFIX.test(user.password);
  const isValid = storedIsHashed
    ? await bcrypt.compare(password, user.password)
    : user.password === password;

  if (!isValid) return null;

  if (!storedIsHashed) {
    const newHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: newHash } });
  }

  return user;
}
