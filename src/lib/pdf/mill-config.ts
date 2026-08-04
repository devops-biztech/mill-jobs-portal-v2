import path from "node:path";

export type MillConfig = {
  /** Matches Application.companyName (case-insensitive). */
  companyCode: string;
  /** Large title printed at the top of page 1. */
  headerTitle: string;
  /** Short form used in compact Yes/No labels, e.g. "Worked for TRL before?" */
  shortCode: string;
  /** The three bold-italic policy sentences under the tagline. */
  policyLines: [string, string, string];
  /** Company name as used in the certification paragraph on page 2. */
  certCompanyName: string;
  footerText: string;
  logoPath: string;
  /** width / height of the source logo image, for undistorted scaling. */
  logoAspect: number;
};

const TEMPLATES_DIR = path.join(process.cwd(), "src/lib/pdf/templates");

export const MILL_CONFIGS: MillConfig[] = [
  {
    companyCode: "TRL",
    headerTitle: "Trinity River Lumber Company",
    shortCode: "TRL",
    policyLines: [
      "Trinity River Lumber Company is committed to promoting the safety and health of its employees.",
      "All applicants who are being considered for employment will be required to submit to a pre-employment drug test.",
      "Trinity River Lumber Company has zero tolerance and is a drug and alcohol free work environment.",
    ],
    certCompanyName: "Trinity River Lumber Company",
    footerText: "PO Box 249 Weaverville, CA 96093 · 530-623-5561 · trinityriverlumbercompany.com",
    logoPath: path.join(TEMPLATES_DIR, "trl-logo-color.png"),
    logoAspect: 400 / 261,
  },
  {
    companyCode: "SRM",
    headerTitle: "Shasta-Sustainable Resource Management",
    shortCode: "SRM",
    policyLines: [
      "Sustainable Resource Managment is committed to promoting the safety and health of its employees.",
      "All applicants who are being considered for employment will be required to submit to a pre-employment drug test.",
      "Sustainable Resource Management has zero tolerance and is a drug and alcohol free work environment.",
    ],
    certCompanyName: "Sustainable Resource Management",
    footerText: "20811 Industry Rd. Anderson, CA 96007 · staylor@trlcmill.com · 530-339-7600 · srm-energy.com",
    logoPath: path.join(TEMPLATES_DIR, "srm-logo-color.png"),
    logoAspect: 766 / 408,
  },
];

export function getMillConfig(companyName: string | null | undefined): MillConfig | null {
  const code = companyName?.trim().toUpperCase();
  if (!code) return null;
  return MILL_CONFIGS.find((mill) => mill.companyCode === code) ?? null;
}
