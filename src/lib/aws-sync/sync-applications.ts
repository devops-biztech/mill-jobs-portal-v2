import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSubmission, DecryptionError, type KeyPair } from "@/lib/aws-sync/decrypt";
import { getReceiverKeys, getSenderKeys } from "@/lib/aws-sync/keys";

export type SyncResult = {
  totalFetched: number;
  created: number;
  /** Already present locally, so skipped entirely: no decrypt, no write. */
  skippedExisting: number;
  skippedNfl: number;
  skippedNoKeys: number;
  failedDecrypt: number;
  failedOther: number;
  /** Applications whose payload carried the voluntary EEO survey. */
  demographicsRecorded: number;
  /** Small sample of error messages, for surfacing to the admin. */
  errors: string[];
};

type ParsedItem = {
  id: string;
  company: string;
  date: string;
  cipherText: Uint8Array;
  nonce: Uint8Array;
  /** Present only on ephemeral-sender records (see decrypt.ts). */
  senderPublicKey?: Uint8Array;
  receivedByCompany: boolean;
  dismissApplicant: boolean;
};

/**
 * Byte arrays arrive either as JSON arrays (newer senders) or as objects with
 * numeric keys (older senders, from `JSON.stringify` of a Uint8Array).
 * `Object.values` flattens both to the same number[].
 */
type ByteArray = Record<string, number> | number[];

function toBytes(value: ByteArray): Uint8Array {
  return new Uint8Array(Object.values(value));
}

function parseRawItem(item: unknown): ParsedItem | null {
  if (typeof item !== "object" || item === null) return null;
  const record = item as Record<string, unknown>;

  const { id, company, date, package: pkg } = record;
  if (typeof id !== "string" || !id) return null;
  if (typeof company !== "string" || !company.trim()) return null;
  if (typeof pkg !== "string") return null;

  let parsedPackage: {
    cipher_text?: ByteArray;
    one_time_code?: ByteArray;
    sender_public_key?: ByteArray;
  };
  try {
    parsedPackage = JSON.parse(pkg);
  } catch {
    return null;
  }
  if (!parsedPackage.cipher_text || !parsedPackage.one_time_code) return null;

  return {
    id,
    company,
    date: typeof date === "string" ? date : "",
    cipherText: toBytes(parsedPackage.cipher_text),
    nonce: toBytes(parsedPackage.one_time_code),
    senderPublicKey: parsedPackage.sender_public_key
      ? toBytes(parsedPackage.sender_public_key)
      : undefined,
    receivedByCompany: record.receivedByCompany === true,
    dismissApplicant: record.dismissApplicant === true,
  };
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function bool(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Voluntary EEO survey answers, if this payload carried them at all.
 *
 * Presence of the *keys* is the test, not truthiness: a blank answer means
 * the applicant was asked and declined, which is a real data point and must
 * be recorded. Returning null means the form had no survey — true of the
 * older TRL/SRM applications — and no demographics row is written for those,
 * so response rates aren't diluted by forms that never asked.
 *
 * Deliberately separate from `mapDecryptedFields`: these values must never
 * be spread onto the Application record. See `ApplicantDemographics` in
 * prisma/schema.prisma for why the segregation exists.
 */
function mapDemographics(d: Record<string, unknown>) {
  const asked = "eeoRacialEthnic" in d || "eeoSex" in d || "eeoVeteran" in d;
  if (!asked) return null;

  return {
    eeoRacialEthnic: str(d.eeoRacialEthnic),
    eeoSex: str(d.eeoSex),
    eeoVeteran: str(d.eeoVeteran),
  };
}

/** Maps a decrypted submission payload onto the Application model's fields. */
function mapDecryptedFields(d: Record<string, unknown>) {
  return {
    applicationPosition: str(d.applicationPosition),
    lastName: str(d.lastName),
    firstName: str(d.firstName),
    middleName: str(d.middleName),
    primaryPhone: str(d.primaryPhone),
    secondaryPhone: str(d.secondaryPhone),
    email: str(d.email),
    mailingAddress: str(d.mailingAddress),
    city: str(d.city),
    state: str(d.state),
    zipCode: str(d.zipCode),
    availableForAnyShift: bool(d.availableForAnyShift),
    availableWeekends: bool(d.availableWeekends),
    ageVerified: bool(d.ageVerified),
    previouslyEmployedByCompany: bool(d.previouslyEmployedByCompany),
    datesPreviouslyEmployed: str(d.datesPreviouslyEmployed),
    relatedToCompanyEmployee: bool(d.relatedToCompanyEmployee),
    relatedTo: str(d.relatedTo),
    highschoolName: str(d.highschoolName),
    highschoolLocation: str(d.highschoolLocation),
    hsGradStatus: str(d.hsGradStatus),
    collegeOneName: str(d.collegeOneName),
    collegeOneCourseOfStudy: str(d.collegeOneCourseOfStudy),
    collegeOneDegree: str(d.collegeOneDegree),
    collegeTwoName: str(d.collegeTwoName),
    collegeTwoCourseOfStudy: str(d.collegeTwoCourseOfStudy),
    collegeTwoDegree: str(d.collegeTwoDegree),
    collegeThreeName: str(d.collegeThreeName),
    collegeThreeCourseOfStudy: str(d.collegeThreeCourseOfStudy),
    collegeThreeDegree: str(d.collegeThreeDegree),
    tradeSchoolOneName: str(d.tradeSchoolOneName),
    tradeSchoolOneCourseOfStudy: str(d.tradeSchoolOneCourseOfStudy),
    tradeSchoolOneCertificate: str(d.tradeSchoolOneCertificate),
    tradeSchoolTwoName: str(d.tradeSchoolTwoName),
    tradeSchoolTwoCourseOfStudy: str(d.tradeSchoolTwoCourseOfStudy),
    tradeSchoolTwoCertificate: str(d.tradeSchoolTwoCertificate),
    tradeSchoolThreeName: str(d.tradeSchoolThreeName),
    tradeSchoolThreeCourseOfStudy: str(d.tradeSchoolThreeCourseOfStudy),
    tradeSchoolThreeCertificate: str(d.tradeSchoolThreeCertificate),
    // Original payload stores this under the odd key "licenseOneNamelicenseOne".
    licenseOneName: str(d.licenseOneNamelicenseOne ?? d.licenseOneName),
    licenseOneIssuedBy: str(d.licenseOneIssuedBy),
    licenseOneExpirationDate: str(d.licenseOneExpirationDate),
    licenseTwoName: str(d.licenseTwoName),
    licenseTwoIssuedBy: str(d.licenseTwoIssuedBy),
    licenseTwoExpirationDate: str(d.licenseTwoExpirationDate),
    licenseThreeName: str(d.licenseThreeName),
    licenseThreeIssuedBy: str(d.licenseThreeIssuedBy),
    licenseThreeExpirationDate: str(d.licenseThreeExpirationDate),
    mayWeContactCurrentEmployer: bool(d.mayWeContactCurrentEmployer),
    currentEmployer: str(d.currentEmployer),
    currentEmployerAddress: str(d.currentEmployerAddress),
    currentEmploymentDates: str(d.currentEmploymentDates),
    currentJobTitle: str(d.currentJobTitle),
    currentHrsPerWeek: str(d.currentHrsPerWeek),
    currentSupervisorName: str(d.currentSupervisorName),
    currentEmployerPhone: str(d.currentEmployerPhone),
    currentDutiesPerformed: str(d.currentDutiesPerformed),
    currentReasonForLeaving: str(d.currentReasonForLeaving),
    mayWeContactPreviousEmployerOne: bool(d.mayWeContactPreviousEmployerOne),
    previousEmployerOne: str(d.previousEmployerOne),
    previousEmployerAddressOne: str(d.previousEmployerAddressOne),
    previousEmploymentDatesOne: str(d.previousEmploymentDatesOne),
    previousJobTitleOne: str(d.previousJobTitleOne),
    previousHrsPerWeekOne: str(d.previousHrsPerWeekOne),
    previousSupervisorNameOne: str(d.previousSupervisorNameOne),
    previousEmployerPhoneOne: str(d.previousEmployerPhoneOne),
    previousDutiesPerformedOne: str(d.previousDutiesPerformedOne),
    previousReasonForLeavingOne: str(d.previousReasonForLeavingOne),
    mayWeContactPreviousEmployerTwo: bool(d.mayWeContactPreviousEmployerTwo),
    previousEmployerTwo: str(d.previousEmployerTwo),
    previousEmployerAddressTwo: str(d.previousEmployerAddressTwo),
    previousEmploymentDatesTwo: str(d.previousEmploymentDatesTwo),
    previousJobTitleTwo: str(d.previousJobTitleTwo),
    previousHrsPerWeekTwo: str(d.previousHrsPerWeekTwo),
    previousSupervisorNameTwo: str(d.previousSupervisorNameTwo),
    previousEmployerPhoneTwo: str(d.previousEmployerPhoneTwo),
    previousDutiesPerformedTwo: str(d.previousDutiesPerformedTwo),
    previousReasonForLeavingTwo: str(d.previousReasonForLeavingTwo),
    // References — only the SLI form sends these; null on TRL/SRM records.
    referenceOneName: str(d.referenceOneName),
    referenceOneAddress: str(d.referenceOneAddress),
    referenceOneTelephone: str(d.referenceOneTelephone),
    referenceOneOccupation: str(d.referenceOneOccupation),
    referenceTwoName: str(d.referenceTwoName),
    referenceTwoAddress: str(d.referenceTwoAddress),
    referenceTwoTelephone: str(d.referenceTwoTelephone),
    referenceTwoOccupation: str(d.referenceTwoOccupation),
    referenceThreeName: str(d.referenceThreeName),
    referenceThreeAddress: str(d.referenceThreeAddress),
    referenceThreeTelephone: str(d.referenceThreeTelephone),
    referenceThreeOccupation: str(d.referenceThreeOccupation),
    documentLink: str(d.documentLink),
    envelopeId: str(d.envelopeId),
    agreeToTerms: bool(d.agreeToTerms),
  };
}

/**
 * Pulls all submissions from the AWS endpoint and creates any that aren't
 * already in the local Application table. Records whose id already exists
 * locally are skipped entirely (no decrypt, no write) — this app is the
 * source of truth for existing rows once synced, so re-running this never
 * re-decrypts unchanged data or clobbers an admin's review status.
 *
 * The AWS endpoint itself has no way to ask for "just what's new since X"
 * (no query param support), so every sync still downloads the full dataset —
 * this only saves the decrypt/write work on the ones we've already seen.
 *
 * TODO: add a `since`/cursor filter on the AWS/Vercel endpoint itself so we
 * stop re-downloading old submissions too, not just re-processing them.
 */
export async function syncApplicationsFromAws(): Promise<SyncResult> {
  const endpoint = process.env.APPS_PUBLIC_HOST;
  if (!endpoint) throw new Error("APPS_PUBLIC_HOST is not set");

  const response = await fetch(endpoint, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`AWS fetch failed: ${response.status} ${response.statusText}`);
  }

  const raw: unknown = await response.json();
  if (!Array.isArray(raw)) {
    throw new Error("Unexpected AWS response shape (expected an array)");
  }

  /*
   * Resolved lazily and only for legacy records. Ephemeral-sender records
   * (SLI) carry their own sender public key, so a deployment that only
   * ingests those never needs S_PUB/S_SEC configured at all — and shouldn't
   * fail the whole sync for missing keys it isn't going to use.
   */
  let legacySenderKeys: KeyPair | null | undefined;
  const getLegacySenderKeys = (): KeyPair | null => {
    if (legacySenderKeys === undefined) {
      try {
        legacySenderKeys = getSenderKeys();
      } catch {
        legacySenderKeys = null;
      }
    }
    return legacySenderKeys;
  };

  const existingIds = new Set(
    (await prisma.application.findMany({ select: { id: true } })).map((row) => row.id),
  );

  const result: SyncResult = {
    totalFetched: raw.length,
    created: 0,
    skippedExisting: 0,
    skippedNfl: 0,
    skippedNoKeys: 0,
    failedDecrypt: 0,
    failedOther: 0,
    demographicsRecorded: 0,
    errors: [],
  };

  function recordError(message: string) {
    if (result.errors.length < 10) result.errors.push(message);
  }

  for (const raw_item of raw) {
    const item = parseRawItem(raw_item);
    if (!item) {
      result.failedOther += 1;
      recordError("Skipped a record with an unrecognized shape");
      continue;
    }

    if (item.company.trim().toUpperCase() === "NFL") {
      result.skippedNfl += 1;
      continue;
    }

    if (existingIds.has(item.id)) {
      result.skippedExisting += 1;
      continue;
    }

    const receiverKeys = getReceiverKeys(item.company);
    if (!receiverKeys) {
      result.skippedNoKeys += 1;
      continue;
    }

    let decrypted: Record<string, unknown>;
    try {
      decrypted = decryptSubmission(
        {
          cipherText: item.cipherText,
          nonce: item.nonce,
          senderPublicKey: item.senderPublicKey,
        },
        item.senderPublicKey ? null : getLegacySenderKeys(),
        receiverKeys,
      ) as Record<string, unknown>;
    } catch (error) {
      result.failedDecrypt += 1;
      if (error instanceof DecryptionError) recordError(`${item.id}: ${error.message}`);
      continue;
    }

    try {
      const fields = mapDecryptedFields(decrypted);
      const demographics = mapDemographics(decrypted);

      /*
       * One transaction: an application without its demographics row would
       * silently under-report, and a demographics row without its
       * application would be an orphan no report could scope correctly.
       */
      await prisma.$transaction(async (tx) => {
        await tx.application.create({
          data: {
            id: item.id,
            companyName: item.company,
            date: item.date,
            ...fields,
            receivedByCompany: item.receivedByCompany,
            dismissApplicant: item.dismissApplicant,
          },
        });

        if (demographics) {
          await tx.applicantDemographics.create({
            data: {
              applicationId: item.id,
              companyName: item.company,
              date: item.date,
              ...demographics,
            },
          });
        }
      });

      result.created += 1;
      if (demographics) result.demographicsRecorded += 1;
    } catch (error) {
      result.failedOther += 1;
      recordError(`${item.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return result;
}
