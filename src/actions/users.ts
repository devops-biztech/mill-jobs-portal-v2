"use server";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getAccessScope, MILL_CODES, type MillCode } from "@/lib/access";
import { usernameExists } from "@/lib/users";
import { AUDIT_ACTIONS, recordAudit, type AuditActor } from "@/lib/audit";

async function requireAdmin() {
  const scope = await getAccessScope();
  if (!scope.isAdmin) throw new Error("Not authorized");
}

/**
 * Admin check and actor identity in one pass, for the actions that write to
 * the activity log and so need to know who is acting, not just that they're
 * allowed to.
 */
async function requireAdminActor(): Promise<AuditActor> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  await requireAdmin();
  return { id: session.userId, name: session.fullName };
}

/**
 * Grants/revokes an existing user's per-mill access. Deliberately does not
 * touch adminAccess or credentials — biztech is the only admin, and that's
 * only ever changed via direct database access, not this UI.
 */
export async function updateUserMillAccess(userId: string, mills: MillCode[]) {
  await requireAdmin();

  const millSet = new Set(mills);
  await prisma.user.update({
    where: { id: userId },
    data: {
      trlAccess: millSet.has("TRL"),
      srmAccess: millSet.has("SRM"),
      sliAccess: millSet.has("SLI"),
      nflAccess: millSet.has("NFL"),
      stlcAccess: millSet.has("STLC"),
      glAccess: millSet.has("GL"),
    },
  });

  revalidatePath("/admin/users");
}

const createUserSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .regex(/^[a-z0-9_.-]+$/i, "Only letters, numbers, and . _ - are allowed"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  homeMill: z.enum(MILL_CODES),
  mills: z.array(z.enum(MILL_CODES)),
});

export type CreateUserState = { error?: string; success?: boolean };

export async function createUser(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const actor = await requireAdminActor();

  const parsed = createUserSchema.safeParse({
    fullName: formData.get("fullName"),
    username: formData.get("username"),
    password: formData.get("password"),
    homeMill: formData.get("homeMill"),
    mills: formData.getAll("mills"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { fullName, username, password, homeMill, mills } = parsed.data;

  if (await usernameExists(username)) {
    return { error: "That username is already taken." };
  }

  const millSet = new Set(mills);
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: userId,
        fullName,
        username,
        password: passwordHash,
        homeMill,
        adminAccess: false,
        trlAccess: millSet.has("TRL"),
        srmAccess: millSet.has("SRM"),
        sliAccess: millSet.has("SLI"),
        nflAccess: millSet.has("NFL"),
        stlcAccess: millSet.has("STLC"),
        glAccess: millSet.has("GL"),
      },
    });

    await recordAudit(
      {
        actor,
        action: AUDIT_ACTIONS.userCreated,
        targetId: userId,
        targetLabel: username,
        detail: mills.length ? `access: ${mills.join(", ")}` : "no mill access",
      },
      tx,
    );
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/logs");
  return { success: true };
}

const resetPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

export type ResetPasswordState = { error?: string; success?: boolean };

/**
 * Sets a user's password on their behalf. There is no self-service password
 * change anywhere in the app, so this is the only reset path there is.
 *
 * Known gap: sessions are stateless JWTs with an 8-hour life and nothing
 * server-side to revoke them, so an existing session survives the reset until
 * it expires. That's fine for the ordinary "they forgot it" case and wrong
 * for "lock this person out right now" — which needs their mill access
 * cleared as well, since that is checked fresh on every request.
 */
export async function resetUserPassword(
  userId: string,
  password: string,
): Promise<ResetPasswordState> {
  const actor = await requireAdminActor();

  const parsed = resetPasswordSchema.safeParse(password);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid password" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!user) return { error: "That user no longer exists." };

  const passwordHash = await bcrypt.hash(parsed.data, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { password: passwordHash } });

    await recordAudit(
      {
        actor,
        action: AUDIT_ACTIONS.userPasswordReset,
        targetId: user.id,
        targetLabel: user.username,
      },
      tx,
    );
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/logs");
  return { success: true };
}
