/**
 * Applicants are shown their application's id as a "confirmation number" on
 * the submission confirmation screen of the public forms (see
 * `SubmissionConfirmation` in trl-emp-online and sli-emp-online). That id is
 * the upstream record id, which the AWS sync reuses verbatim as the local
 * primary key — so the number an applicant reads back over the phone is
 * exactly `Application.id`, with no lookup table in between.
 *
 * Shared between server and client: the applications query uses it to decide
 * whether to search ids at all, and the table uses it to tell "no results" for
 * a name apart from "no results" for a confirmation number, which mean
 * different things to the person searching.
 */

/**
 * Whether a search term looks like a confirmation number (or a fragment of
 * one) rather than a name, email or phone number.
 *
 * The guard is what makes id search safe to fold into the general search box.
 * Matching `id contains <token>` unconditionally would let a one-character
 * term LIKE its way across every row in the table and bury the real name
 * matches; requiring eight hex digits means only something that could
 * genuinely be part of a UUID is ever compared against an id.
 */
export function looksLikeConfirmationNumber(value: string): boolean {
  const token = value.trim();
  if (!/^[0-9a-f-]+$/i.test(token)) return false;
  return token.replace(/-/g, "").length >= 8;
}

/**
 * Shortens a confirmation number for display in a table cell or log entry.
 * The first block of a UUID is enough to recognise a record you already have
 * in front of you; the detail page shows the whole thing for reading back.
 */
export function shortConfirmationNumber(id: string): string {
  return id.split("-")[0] ?? id;
}
