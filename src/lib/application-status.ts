export type ApplicationStatus = "pending" | "reviewed";

/**
 * Maps the underlying `dismissApplicant`/`receivedByCompany` DB fields to a
 * status. The two fields are treated as equivalent ("received" and
 * "reviewed" are the same real-world action: HR has seen and processed the
 * application) — either one being true means "reviewed".
 */
export function getApplicationStatus(app: {
  receivedByCompany: boolean;
  dismissApplicant: boolean;
}): ApplicationStatus {
  return app.receivedByCompany || app.dismissApplicant ? "reviewed" : "pending";
}
