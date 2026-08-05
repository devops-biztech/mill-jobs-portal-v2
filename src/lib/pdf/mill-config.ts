import path from "node:path";

/** Brand colors for the `modern` template. Ignored by `classic`. */
export type MillTheme = {
  /** Primary brand color: rules, section labels, employer card headers. */
  accent: string;
  /** Secondary brand color, used for the short bar beside the accent rule. */
  highlight: string;
  /** Very light tint behind cards and the meta strip. */
  panel: string;
  /** Hairline color for row separators and card borders. */
  rule: string;
  /** Body text. */
  ink: string;
  /** Field labels and other de-emphasized text. */
  muted: string;
};

export type MillConfig = {
  /** Matches Application.companyName (case-insensitive). */
  companyCode: string;
  /**
   * Which branded template renders this mill.
   *
   * `classic` is `MillApplicationPdf`, a facsimile of the mill's paper form.
   * `modern` is `ModernApplicationPdf`, laid out for reading on screen and
   * driven entirely by `theme`/`contactLines` below.
   */
  template: "classic" | "modern";
  /** Large title printed at the top of page 1. */
  headerTitle: string;
  /** Short form used in compact Yes/No labels, e.g. "Worked for TRL before?" */
  shortCode: string;
  /**
   * The three bold-italic policy sentences under the tagline. `classic` only —
   * the mills whose paper form carries them.
   */
  policyLines?: [string, string, string];
  /** Company name as used in the certification paragraph on page 2. */
  certCompanyName: string;
  /**
   * Certification wording, when the mill's form differs from the shared
   * paragraph. Falls back to the one built from `certCompanyName`.
   */
  certificationText?: string;
  footerText: string;
  /** Address/phone lines printed beside the logo. `modern` only. */
  contactLines?: string[];
  logoPath: string;
  /** width / height of the source logo image, for undistorted scaling. */
  logoAspect: number;
  /** Required by `modern`, ignored by `classic`. */
  theme?: MillTheme;
};

const TEMPLATES_DIR = path.join(process.cwd(), "src/lib/pdf/templates");

export const MILL_CONFIGS: MillConfig[] = [
  {
    companyCode: "TRL",
    template: "classic",
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
    template: "classic",
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
  {
    companyCode: "SLI",
    template: "modern",
    headerTitle: "Schmidbauer Lumber, Inc.",
    shortCode: "Schmidbauer",
    certCompanyName: "Schmidbauer Lumber, Inc.",
    // Verbatim from the Certification block on page 4 of sli-job-app.pdf. The
    // online form shows the applicant this same wording, so the rendered PDF
    // has to reproduce it rather than the shared TRL/SRM paragraph.
    certificationText:
      "My signature below certifies that all information in this application is correct and complete " +
      "to the best of my knowledge and belief and that I understand that providing false, inaccurate, " +
      "incomplete, or misleading information will result in refusal of employment or termination of " +
      "employment if discovered after date of hire. I acknowledge that the company will verify the " +
      "accuracy and completeness of the information I have provided and I authorize all entities and " +
      "individuals identified or discovered during the company's hiring process to provide information " +
      "regarding my employment, education, character and qualifications. I release all entities and " +
      "individuals who provide information in accordance with this release from all liability for any " +
      "damages that may result from furnishing information to the company. I understand that if I am " +
      "employed, I must conform to the company's rules, policies and procedures. I also understand that " +
      "my employment is “at will,” which means that the company or I may terminate my employment " +
      "at any time for any reason.",
    contactLines: ["P.O. Box 152, Eureka, CA 95502", "707-443-7025  ·  Fax 707-443-2356"],
    footerText: "Schmidbauer Lumber, Inc.  ·  P.O. Box 152, Eureka, CA 95502  ·  707-443-7025",
    logoPath: path.join(TEMPLATES_DIR, "sli/sli-logo-color.png"),
    logoAspect: 356 / 178,
    // Sampled from sli-logo-color.png: the green and yellow are the only two
    // colors in the mark.
    theme: {
      accent: "#268742",
      highlight: "#FFD626",
      panel: "#F4F7F4",
      rule: "#DFE4DF",
      ink: "#1A1D1B",
      muted: "#6B7280",
    },
  },
];

export function getMillConfig(companyName: string | null | undefined): MillConfig | null {
  const code = companyName?.trim().toUpperCase();
  if (!code) return null;
  return MILL_CONFIGS.find((mill) => mill.companyCode === code) ?? null;
}
