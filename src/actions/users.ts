"use server";

import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAccessScope, MILL_CODES, type MillCode } from "@/lib/access";
import { usernameExists } from "@/lib/users";

async function requireAdmin() {
  const scope = await getAccessScope();
  if (!scope.isAdmin) throw new Error("Not authorized");
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
  await requireAdmin();

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

  await prisma.user.create({
    data: {
      id: randomUUID(),
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

  revalidatePath("/admin/users");
  return { success: true };
}
