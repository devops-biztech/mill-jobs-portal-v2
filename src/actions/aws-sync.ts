"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { syncApplicationsFromAws, type SyncResult } from "@/lib/aws-sync/sync-applications";

export async function syncFromAws(): Promise<SyncResult> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const result = await syncApplicationsFromAws();

  revalidatePath("/admin");
  revalidatePath("/admin/applications");

  return result;
}
