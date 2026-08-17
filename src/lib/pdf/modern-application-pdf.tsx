import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Application } from "@/generated/prisma/client";
import { getApplicationStatus } from "@/lib/application-status";
import type { MillConfig, MillTheme } from "@/lib/pdf/mill-config";

/**
 * Branded application PDF laid out for reading rather than for matching a
 * paper form — the counterpart to `MillApplicationPdf`, which is a facsimile
 * of the TRL/SRM forms. Mills opt in with `template: "modern"` in
 * `mill-config.ts`; everything company-specific comes from that config, so
 * nothing here is SLI-only.
 *
 * It must carry the same fields as the other two templates. Adding a field to
 * one template and not the others silently drops it for whichever mills use
 * the others.
 *
 * It must NOT carry the voluntary EEO answers. Those live in
 * `ApplicantDemographics`, are unreachable from `Application`, and are kept
 * from anyone making a hiring decision — which is the only reason collecting
 * them is defensible. See the README.
 */

const FALLBACK_THEME: MillTheme = {
  accent: "#1F2937",
  highlight: "#9CA3AF",
  panel: "#F5F6F7",
  rule: "#E2E4E7",
  ink: "#1A1D1B",
  muted: "#6B7280",
};

const styles = StyleSheet.create({
  // No `lineHeight` here: on @react-pdf 4.x a line height on the Page drops
  // every absolutely positioned child, which silently loses the footer and the
  // running header. Set it on the individual text styles instead.
  page: {
    paddingTop: 34,
    paddingHorizontal: 40,
    paddingBottom: 54,
    fontSize: 9,
    fontFamily: "Helvetica",
  },

  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  contact: { fontSize: 7.5, textAlign: "right", lineHeight: 1.4 },
  rules: { flexDirection: "row", marginTop: 10, marginBottom: 16 },
  ruleMain: { flex: 1, height: 2.5 },
  ruleTip: { width: 34, height: 2.5, marginLeft: 3 },

  title: { fontSize: 17, fontFamily: "Helvetica-Bold", letterSpacing: -0.3, lineHeight: 1.2 },
  eeoNote: { fontSize: 8, lineHeight: 1.35, marginTop: 3 },

  /**
   * Standing policy sentences, for the mills whose paper form carries them.
   * Bold italic, matching how they are set on the printed originals and how
   * `classic` already renders the same strings.
   *
   * Added when TRL moved from `classic` to `modern`: `policyLines` used to be
   * classic-only, so the move would otherwise have dropped TRL's three
   * drug-free-workplace sentences off the printed application without a word.
   * Mills that declare no `policyLines` (SLI) render nothing here.
   */
  policyLine: {
    fontSize: 8,
    lineHeight: 1.35,
    marginTop: 2,
    fontFamily: "Helvetica-BoldOblique",
  },

  /**
   * Repeated on pages 2+ so a detached page still names the applicant. It sits
   * in the top padding, out of the flow, and renders as empty text on page 1
   * where the full masthead already is.
   */
  runningHeader: { position: "absolute", top: 14, left: 40, right: 40, fontSize: 7.5 },

  meta: {
    flexDirection: "row",
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 3,
  },
  metaItem: { flex: 1, paddingRight: 8 },

  section: { marginTop: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  sectionLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginRight: 7,
  },
  sectionRule: { flex: 1, height: 0.75 },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  field: { marginBottom: 9, paddingRight: 12 },
  label: { fontSize: 6.8, letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 1.5 },
  value: { fontSize: 9.5, lineHeight: 1.35 },

  qaRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4.5,
    borderBottomWidth: 0.75,
    borderBottomStyle: "solid",
  },
  qaQuestion: { flex: 1, fontSize: 9, lineHeight: 1.35 },
  qaDetail: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Oblique",
    lineHeight: 1.35,
    marginRight: 8,
    textAlign: "right",
    flex: 1,
  },
  badge: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.6,
    color: "#FFFFFF",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 7,
    width: 30,
    textAlign: "center",
  },

  tableHead: {
    flexDirection: "row",
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  tableHeadCell: { fontSize: 6.8, fontFamily: "Helvetica-Bold", letterSpacing: 0.7 },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4.5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.75,
    borderBottomStyle: "solid",
  },
  tableCell: { fontSize: 9, lineHeight: 1.35 },

  card: { borderRadius: 3, borderWidth: 0.75, borderStyle: "solid", marginBottom: 8 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  cardTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.8, color: "#FFFFFF" },
  cardTag: { fontSize: 7.5, color: "#FFFFFF" },
  cardBody: { paddingTop: 8, paddingHorizontal: 9, paddingBottom: 1 },

  empty: { fontSize: 8.5, fontFamily: "Helvetica-Oblique", lineHeight: 1.35, paddingVertical: 3 },

  certification: { fontSize: 7.5, lineHeight: 1.5, textAlign: "justify" },
  signatureRow: { flexDirection: "row", alignItems: "flex-end", marginTop: 22 },
  signatureLine: { borderBottomWidth: 0.75, borderBottomStyle: "solid" },
  signatureLabel: { fontSize: 7, letterSpacing: 0.6, marginTop: 3 },

  footer: {
    position: "absolute",
    bottom: 26,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.75,
    borderTopStyle: "solid",
    paddingTop: 6,
    fontSize: 7,
  },
});

const LOGO_HEIGHT = 32;

function text(value?: string | null) {
  return value?.trim() ? value.trim() : "—";
}

function hasAny(...values: (string | null | undefined)[]) {
  return values.some((value) => value?.trim());
}

/** `app.date` is a free-text string from the submitting form; leave it alone when it isn't a date. */
function formatDate(value?: string | null) {
  if (!value?.trim()) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.trim();
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function Field({
  label,
  value,
  width = "33.33%",
  theme,
}: {
  label: string;
  value?: string | null;
  width?: string;
  theme: MillTheme;
}) {
  return (
    <View style={[styles.field, { width }]}>
      <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.ink }]}>{text(value)}</Text>
    </View>
  );
}

function SectionHeading({
  title,
  theme,
  /** Points of content that must fit below the heading, else break first. */
  keepAhead = 90,
}: {
  title: string;
  theme: MillTheme;
  keepAhead?: number;
}) {
  return (
    <View style={styles.sectionHeader} minPresenceAhead={keepAhead}>
      <Text style={[styles.sectionLabel, { color: theme.accent }]}>{title}</Text>
      <View style={[styles.sectionRule, { backgroundColor: theme.rule }]} />
    </View>
  );
}

function Section({
  title,
  theme,
  children,
  keepAhead,
  /** Move the whole section to the next page rather than split it. */
  keepTogether = false,
}: {
  title: string;
  theme: MillTheme;
  children: React.ReactNode;
  keepAhead?: number;
  keepTogether?: boolean;
}) {
  return (
    <View style={styles.section} {...(keepTogether ? { wrap: false } : {})}>
      <SectionHeading title={title} theme={theme} keepAhead={keepAhead} />
      {children}
    </View>
  );
}

function YesNoRow({
  question,
  answer,
  detail,
  detailLabel,
  theme,
}: {
  question: string;
  answer: boolean;
  detail?: string | null;
  detailLabel?: string;
  theme: MillTheme;
}) {
  return (
    <View style={[styles.qaRow, { borderBottomColor: theme.rule }]}>
      <Text style={[styles.qaQuestion, { color: theme.ink }]}>{question}</Text>
      {answer && detail?.trim() ? (
        <Text style={[styles.qaDetail, { color: theme.muted }]}>
          {detailLabel ? `${detailLabel}: ` : ""}
          {detail.trim()}
        </Text>
      ) : null}
      <Text style={[styles.badge, { backgroundColor: answer ? theme.accent : theme.muted }]}>
        {answer ? "YES" : "NO"}
      </Text>
    </View>
  );
}

type Column = { header: string; flex: number };

function Table({
  columns,
  rows,
  theme,
}: {
  columns: Column[];
  rows: (string | null | undefined)[][];
  theme: MillTheme;
}) {
  return (
    <View wrap={false}>
      <View style={[styles.tableHead, { backgroundColor: theme.panel }]}>
        {columns.map((column) => (
          <Text
            key={column.header}
            style={[styles.tableHeadCell, { flex: column.flex, color: theme.muted }]}
          >
            {column.header.toUpperCase()}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View key={index} style={[styles.tableRow, { borderBottomColor: theme.rule }]}>
          {row.map((cell, cellIndex) => (
            <Text
              key={cellIndex}
              style={[styles.tableCell, { flex: columns[cellIndex].flex, color: theme.ink }]}
            >
              {text(cell)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Empty({ children, theme }: { children: React.ReactNode; theme: MillTheme }) {
  return <Text style={[styles.empty, { color: theme.muted }]}>{children}</Text>;
}

type EmploymentData = {
  mayWeContact: boolean;
  employer: string | null;
  address: string | null;
  dates: string | null;
  jobTitle: string | null;
  hoursPerWeek: string | null;
  supervisorName: string | null;
  phone: string | null;
  dutiesPerformed: string | null;
  reasonForLeaving: string | null;
};

function EmploymentCard({
  title,
  data,
  theme,
}: {
  title: string;
  data: EmploymentData;
  theme: MillTheme;
}) {
  return (
    <View style={[styles.card, { borderColor: theme.rule }]} wrap={false}>
      <View style={[styles.cardHeader, { backgroundColor: theme.accent }]}>
        <Text style={styles.cardTitle}>{title.toUpperCase()}</Text>
        <Text style={styles.cardTag}>
          May we contact this employer? {data.mayWeContact ? "Yes" : "No"}
        </Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.grid}>
          <Field label="Employer" value={data.employer} width="50%" theme={theme} />
          <Field label="Address" value={data.address} width="50%" theme={theme} />
          <Field label="Job title" value={data.jobTitle} theme={theme} />
          <Field label="Employment dates" value={data.dates} theme={theme} />
          <Field label="Hours per week" value={data.hoursPerWeek} theme={theme} />
          <Field label="Supervisor" value={data.supervisorName} theme={theme} />
          <Field label="Employer phone" value={data.phone} theme={theme} />
          <Field label="Reason for leaving" value={data.reasonForLeaving} theme={theme} />
          <Field
            label="Duties performed, skills used or learned, promotions"
            value={data.dutiesPerformed}
            width="100%"
            theme={theme}
          />
        </View>
      </View>
    </View>
  );
}

export function ModernApplicationPdf({ app, mill }: { app: Application; mill: MillConfig }) {
  const theme = mill.theme ?? FALLBACK_THEME;
  const fullName = [app.firstName, app.middleName, app.lastName].filter(Boolean).join(" ");
  const status = getApplicationStatus(app);
  const logoWidth = LOGO_HEIGHT * mill.logoAspect;

  const schooling = [
    [app.collegeOneName, app.collegeOneCourseOfStudy, app.collegeOneDegree],
    [app.collegeTwoName, app.collegeTwoCourseOfStudy, app.collegeTwoDegree],
    [app.collegeThreeName, app.collegeThreeCourseOfStudy, app.collegeThreeDegree],
    [app.tradeSchoolOneName, app.tradeSchoolOneCourseOfStudy, app.tradeSchoolOneCertificate],
    [app.tradeSchoolTwoName, app.tradeSchoolTwoCourseOfStudy, app.tradeSchoolTwoCertificate],
    [app.tradeSchoolThreeName, app.tradeSchoolThreeCourseOfStudy, app.tradeSchoolThreeCertificate],
  ].filter((row) => hasAny(...row));

  const licenses = [
    [app.licenseOneName, app.licenseOneIssuedBy, app.licenseOneExpirationDate],
    [app.licenseTwoName, app.licenseTwoIssuedBy, app.licenseTwoExpirationDate],
    [app.licenseThreeName, app.licenseThreeIssuedBy, app.licenseThreeExpirationDate],
  ].filter((row) => hasAny(...row));

  const employment: { title: string; data: EmploymentData }[] = [
    {
      title: "Current or most recent employer",
      data: {
        mayWeContact: app.mayWeContactCurrentEmployer,
        employer: app.currentEmployer,
        address: app.currentEmployerAddress,
        dates: app.currentEmploymentDates,
        jobTitle: app.currentJobTitle,
        hoursPerWeek: app.currentHrsPerWeek,
        supervisorName: app.currentSupervisorName,
        phone: app.currentEmployerPhone,
        dutiesPerformed: app.currentDutiesPerformed,
        reasonForLeaving: app.currentReasonForLeaving,
      },
    },
    {
      title: "Previous employer",
      data: {
        mayWeContact: app.mayWeContactPreviousEmployerOne,
        employer: app.previousEmployerOne,
        address: app.previousEmployerAddressOne,
        dates: app.previousEmploymentDatesOne,
        jobTitle: app.previousJobTitleOne,
        hoursPerWeek: app.previousHrsPerWeekOne,
        supervisorName: app.previousSupervisorNameOne,
        phone: app.previousEmployerPhoneOne,
        dutiesPerformed: app.previousDutiesPerformedOne,
        reasonForLeaving: app.previousReasonForLeavingOne,
      },
    },
    {
      title: "Previous employer",
      data: {
        mayWeContact: app.mayWeContactPreviousEmployerTwo,
        employer: app.previousEmployerTwo,
        address: app.previousEmployerAddressTwo,
        dates: app.previousEmploymentDatesTwo,
        jobTitle: app.previousJobTitleTwo,
        hoursPerWeek: app.previousHrsPerWeekTwo,
        supervisorName: app.previousSupervisorNameTwo,
        phone: app.previousEmployerPhoneTwo,
        dutiesPerformed: app.previousDutiesPerformedTwo,
        reasonForLeaving: app.previousReasonForLeavingTwo,
      },
    },
  ].filter(({ data }) =>
    hasAny(data.employer, data.jobTitle, data.dates, data.dutiesPerformed, data.reasonForLeaving),
  );

  // Filled slots only: the SLI form requires just the first reference.
  const references = [
    [
      app.referenceOneName,
      app.referenceOneOccupation,
      app.referenceOneTelephone,
      app.referenceOneAddress,
    ],
    [
      app.referenceTwoName,
      app.referenceTwoOccupation,
      app.referenceTwoTelephone,
      app.referenceTwoAddress,
    ],
    [
      app.referenceThreeName,
      app.referenceThreeOccupation,
      app.referenceThreeTelephone,
      app.referenceThreeAddress,
    ],
  ].filter((row) => hasAny(...row));

  const certification =
    mill.certificationText ??
    `I hereby certify that all statements made in this application are true and I agree and ` +
      `understand that any misstatement or omission of material fact(s) will cause forfeiture on my ` +
      `part of all rights of employment with ${mill.certCompanyName}. I authorize investigation of ` +
      `all matters contained in this application.`;

  return (
    <Document
      title={`${mill.companyCode} Application - ${fullName || app.id}`}
      author={mill.headerTitle}
    >
      <Page size="LETTER" style={[styles.page, { color: theme.ink }]}>
        <Text
          fixed
          style={[styles.runningHeader, { color: theme.muted }]}
          render={({ pageNumber }) =>
            pageNumber === 1
              ? ""
              : `${fullName || "Employment application"}  ·  ${mill.headerTitle}`
          }
        />

        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image renders into the PDF, not the DOM; alt has no meaning here */}
          <Image src={mill.logoPath} style={{ width: logoWidth, height: LOGO_HEIGHT }} />
          <View>
            {(mill.contactLines ?? []).map((line) => (
              <Text key={line} style={[styles.contact, { color: theme.muted }]}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.rules}>
          <View style={[styles.ruleMain, { backgroundColor: theme.accent }]} />
          <View style={[styles.ruleTip, { backgroundColor: theme.highlight }]} />
        </View>

        <Text style={styles.title}>{fullName || "Employment Application"}</Text>
        <Text style={[styles.eeoNote, { color: theme.muted }]}>
          {mill.headerTitle} · Employment Application · An Equal Opportunity Employer
        </Text>
        {(mill.policyLines ?? []).map((line) => (
          <Text key={line} style={[styles.policyLine, { color: theme.ink }]}>
            {line}
          </Text>
        ))}

        <View style={[styles.meta, { backgroundColor: theme.panel }]}>
          <View style={styles.metaItem}>
            <Text style={[styles.label, { color: theme.muted }]}>Position applied for</Text>
            <Text style={[styles.value, { fontFamily: "Helvetica-Bold" }]}>
              {text(app.applicationPosition)}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[styles.label, { color: theme.muted }]}>Submitted</Text>
            <Text style={styles.value}>{formatDate(app.date)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[styles.label, { color: theme.muted }]}>Review status</Text>
            <Text style={[styles.value, { textTransform: "capitalize" }]}>{status}</Text>
          </View>
        </View>

        <Section title="Applicant" theme={theme}>
          <View style={styles.grid}>
            <Field label="Last name" value={app.lastName} theme={theme} />
            <Field label="First name" value={app.firstName} theme={theme} />
            <Field label="Middle name" value={app.middleName} theme={theme} />
            <Field label="Primary phone" value={app.primaryPhone} theme={theme} />
            <Field label="Secondary phone" value={app.secondaryPhone} theme={theme} />
            <Field label="Email" value={app.email} theme={theme} />
            <Field label="Mailing address" value={app.mailingAddress} width="50%" theme={theme} />
            <Field label="City" value={app.city} width="20%" theme={theme} />
            <Field label="State" value={app.state} width="15%" theme={theme} />
            <Field label="ZIP" value={app.zipCode} width="15%" theme={theme} />
          </View>
        </Section>

        <Section title="Availability & eligibility" theme={theme}>
          <YesNoRow
            question="Available for any shift?"
            answer={app.availableForAnyShift}
            theme={theme}
          />
          <YesNoRow
            question="Available to work weekends?"
            answer={app.availableWeekends}
            theme={theme}
          />
          <YesNoRow question="Is the applicant over 18?" answer={app.ageVerified} theme={theme} />
          <YesNoRow
            question={`Worked for ${mill.shortCode} before?`}
            answer={app.previouslyEmployedByCompany}
            detail={app.datesPreviouslyEmployed}
            detailLabel="Dates"
            theme={theme}
          />
          <YesNoRow
            question={`Related to a ${mill.shortCode} employee?`}
            answer={app.relatedToCompanyEmployee}
            detail={app.relatedTo}
            detailLabel="Name and relation"
            theme={theme}
          />
        </Section>

        <Section title="Education" theme={theme}>
          <View style={styles.grid}>
            <Field label="High school" value={app.highschoolName} theme={theme} />
            <Field label="Location" value={app.highschoolLocation} theme={theme} />
            <Field label="Graduation status" value={app.hsGradStatus} theme={theme} />
          </View>
          {schooling.length > 0 ? (
            <Table
              columns={[
                { header: "College, university or trade school", flex: 2 },
                { header: "Course of study", flex: 1.6 },
                { header: "Degree or certificate", flex: 1.4 },
              ]}
              rows={schooling}
              theme={theme}
            />
          ) : (
            <Empty theme={theme}>No college or trade school listed.</Empty>
          )}
        </Section>

        <Section title="Skills, licenses & certificates" theme={theme} keepTogether>
          {licenses.length > 0 ? (
            <Table
              columns={[
                { header: "Skill, license or certificate", flex: 2 },
                { header: "Issued by", flex: 1.6 },
                { header: "Expires", flex: 1.4 },
              ]}
              rows={licenses}
              theme={theme}
            />
          ) : (
            <Empty theme={theme}>None listed.</Empty>
          )}
        </Section>

        {/*
          The heading rides along with the first employer card, which is too
          tall to guarantee with `minPresenceAhead` alone — otherwise a card
          that does not fit leaves "Work history" alone at the foot of a page.
        */}
        <View style={styles.section}>
          {employment.length > 0 ? (
            employment.map(({ title, data }, index) => (
              <View key={index} wrap={false}>
                {index === 0 ? <SectionHeading title="Work history" theme={theme} /> : null}
                <EmploymentCard title={title} data={data} theme={theme} />
              </View>
            ))
          ) : (
            <View wrap={false}>
              <SectionHeading title="Work history" theme={theme} />
              <Empty theme={theme}>No employment history provided.</Empty>
            </View>
          )}
        </View>

        <Section title="References" theme={theme} keepTogether>
          {references.length > 0 ? (
            <Table
              columns={[
                { header: "Name", flex: 1.4 },
                { header: "Occupation", flex: 1.3 },
                { header: "Telephone", flex: 1.1 },
                { header: "Address", flex: 2 },
              ]}
              rows={references}
              theme={theme}
            />
          ) : (
            <Empty theme={theme}>No references provided.</Empty>
          )}
        </Section>

        {/* The paragraph, the acceptance note and the signature lines read as one block. */}
        <Section title="Certification" theme={theme} keepTogether>
          <View>
            <Text style={[styles.certification, { color: theme.ink }]}>{certification}</Text>
            <Text style={[styles.certification, { color: theme.muted, marginTop: 6 }]}>
              {app.agreeToTerms
                ? "The applicant accepted this certification electronically when submitting the online application."
                : "The applicant did not record acceptance of this certification."}
            </Text>

            <View style={styles.signatureRow}>
              <View style={{ flex: 1, marginRight: 28 }}>
                <View style={[styles.signatureLine, { borderBottomColor: theme.muted }]} />
                <Text style={[styles.signatureLabel, { color: theme.muted }]}>
                  APPLICANT&apos;S SIGNATURE
                </Text>
              </View>
              <View style={{ width: 140 }}>
                <View style={[styles.signatureLine, { borderBottomColor: theme.muted }]} />
                <Text style={[styles.signatureLabel, { color: theme.muted }]}>DATE</Text>
              </View>
            </View>
          </View>
        </Section>

        <Footer mill={mill} theme={theme} applicationId={app.id} />
      </Page>
    </Document>
  );
}

function Footer({
  mill,
  theme,
  applicationId,
}: {
  mill: MillConfig;
  theme: MillTheme;
  applicationId: string;
}) {
  return (
    <View style={[styles.footer, { borderTopColor: theme.rule }]} fixed>
      <Text style={{ color: theme.muted }}>{mill.footerText}</Text>
      <Text
        style={{ color: theme.muted }}
        render={({ pageNumber, totalPages }) =>
          `${applicationId}  ·  Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}
