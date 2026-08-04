"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { getAccessScope, canAccessCompany } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function setApplicationStatus(id: string, status: "reviewed" | "pending") {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const scope = await getAccessScope();
  const app = await prisma.application.findUnique({ where: { id }, select: { companyName: true } });
  if (!app || !canAccessCompany(scope, app.companyName)) {
    throw new Error("Application not found");
  }

  // receivedByCompany and dismissApplicant are treated as the same real-world
  // action ("reviewed"), so both are set together to keep them in sync.
  await prisma.application.update({
    where: { id },
    data: {
      receivedByCompany: status === "reviewed",
      dismissApplicant: status === "reviewed",
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${id}`);
}
