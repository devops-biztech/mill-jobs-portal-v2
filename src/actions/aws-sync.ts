"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { syncApplicationsFromAws, type SyncResult } from "@/lib/aws-sync/sync-applications";

export type SyncFromAwsResult = SyncResult & { demoMode?: boolean };

/**
 * Demo mode has no APPS_PUBLIC_HOST or decryption keys configured — this is
 * the only place in the app that makes an outbound network call, so it's the
 * one thing that needs a demo-mode short circuit.
 */
export async function syncFromAws(): Promise<SyncFromAwsResult> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  if (process.env.DEMO_MODE === "true") {
    return {
      totalFetched: 0,
      created: 0,
      skippedExisting: 0,
      skippedDeleted: 0,
      skippedNfl: 0,
      skippedNoKeys: 0,
      failedDecrypt: 0,
      failedOther: 0,
      demographicsRecorded: 0,
      errors: [],
      demoMode: true,
    };
  }

  const result = await syncApplicationsFromAws();

  revalidatePath("/admin");
  revalidatePath("/admin/applications");

  return result;
}
