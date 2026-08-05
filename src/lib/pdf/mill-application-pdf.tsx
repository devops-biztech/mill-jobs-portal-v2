import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Application } from "@/generated/prisma/client";
import type { MillConfig } from "@/lib/pdf/mill-config";

const styles = StyleSheet.create({
  page: { padding: 26, paddingBottom: 24, fontSize: 9, fontFamily: "Helvetica", color: "#111" },
  companyName: {
    fontSize: 20,
    fontFamily: "Times-Roman",
    textAlign: "center",
    marginBottom: 6,
  },
  tagline: { fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 2 },
  policyLine: {
    fontSize: 8.5,
    fontFamily: "Helvetica-BoldOblique",
    textAlign: "center",
    marginBottom: 1,
  },
  outerBox: { borderWidth: 1, borderColor: "#000", marginTop: 10 },
  bar: {
    backgroundColor: "#e5e5e5",
    borderBottomWidth: 1,
    borderColor: "#000",
    paddingVertical: 3,
    paddingHorizontal: 5,
  },
  barText: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#000" },
  rowNoBorder: { flexDirection: "row" },
  cell: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: "#000",
    paddingVertical: 3,
    paddingHorizontal: 5,
  },
  cellLast: { flex: 1, paddingVertical: 3, paddingHorizontal: 5 },
  label: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  value: { fontSize: 9, marginTop: 2 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  yesNoWrap: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  yesNoOption: { fontSize: 8.5, marginLeft: 6 },
  yesNoMark: { fontFamily: "Helvetica-Bold" },
});

const HEADER_LOGO_HEIGHT = 48;
const WATERMARK_WIDTH = 320;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

function Cell({
  label,
  value,
  last = false,
  flex,
}: {
  label: string;
  value?: string | null;
  last?: boolean;
  flex?: number;
}) {
  return (
    <View style={[last ? styles.cellLast : styles.cell, flex ? { flex } : {}]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value?.trim() ? value : " "}</Text>
    </View>
  );
}

function YesNo({ label, value }: { label: string; value: boolean | null }) {
  return (
    <View style={styles.yesNoWrap}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.yesNoOption}>
        Yes: <Text style={styles.yesNoMark}>{value === true ? "X" : " "}</Text>
      </Text>
      <Text style={styles.yesNoOption}>
        No: <Text style={styles.yesNoMark}>{value === false ? "X" : " "}</Text>
      </Text>
    </View>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bar}>
      <Text style={styles.barText}>{children}</Text>
    </View>
  );
}

type EmploymentData = {
  mayWeContact: boolean | null;
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

type ReferenceData = {
  name: string | null;
  address: string | null;
  telephone: string | null;
  occupation: string | null;
};

/**
 * References block. Only the SLI online application collects these; on older
 * TRL/SRM records every field is null and the caller omits the section
 * entirely rather than printing empty boxes.
 */
function ReferencesBlock({ references }: { references: ReferenceData[] }) {
  return (
    <View style={styles.outerBox} wrap={false}>
      <View style={styles.row}>
        <View style={styles.cellLast}>
          <Text style={styles.barText}>References</Text>
        </View>
      </View>
      {references.map((reference, index) => (
        <View key={index}>
          <View style={styles.row}>
            <Cell label="Name" value={reference.name} flex={1.4} />
            <Cell label="Occupation" value={reference.occupation} last flex={1.6} />
          </View>
          <View
            style={index === references.length - 1 ? styles.rowNoBorder : styles.row}
          >
            <Cell label="Phone #" value={reference.telephone} />
            <Cell label="Address" value={reference.address} last flex={1.6} />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmploymentBlock({ title, data }: { title: string; data: EmploymentData }) {
  return (
    <View style={styles.outerBox} wrap={false}>
      <View style={styles.row}>
        <View style={[styles.cellLast, { flexDirection: "row", justifyContent: "space-between" }]}>
          <Text style={styles.barText}>{title}</Text>
          <Text style={styles.yesNoOption}>
            May we contact this employer?{" "}
            <Text style={styles.yesNoMark}>
              {data.mayWeContact === null ? "—" : data.mayWeContact ? "Yes" : "No"}
            </Text>
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <Cell label="Name" value={data.employer} flex={1.4} />
        <Cell label="Address" value={data.address} last flex={1.6} />
      </View>
      <View style={styles.row}>
        <Cell label="Employment Dates" value={data.dates} />
        <Cell label="Job Title" value={data.jobTitle} last />
      </View>
      <View style={styles.row}>
        <Cell label="Hours per week" value={data.hoursPerWeek} />
        <Cell label="Supervisor Name" value={data.supervisorName} />
        <Cell label="Phone #" value={data.phone} last />
      </View>
      <View style={styles.row}>
        <Cell label="Duties Performed" value={data.dutiesPerformed} last />
      </View>
      <View style={styles.rowNoBorder}>
        <Cell label="Reason for Leaving" value={data.reasonForLeaving} last />
      </View>
    </View>
  );
}

function Footer({ text }: { text: string }) {
  return <Text style={styles.footer}>{text}</Text>;
}

export function MillApplicationPdf({ app, mill }: { app: Application; mill: MillConfig }) {
  const fullName = [app.firstName, app.middleName, app.lastName].filter(Boolean).join(" ");

  // Filled slots only: the SLI form requires just the first reference, and
  // other mills' forms collect none at all.
  const references = [
    {
      name: app.referenceOneName,
      address: app.referenceOneAddress,
      telephone: app.referenceOneTelephone,
      occupation: app.referenceOneOccupation,
    },
    {
      name: app.referenceTwoName,
      address: app.referenceTwoAddress,
      telephone: app.referenceTwoTelephone,
      occupation: app.referenceTwoOccupation,
    },
    {
      name: app.referenceThreeName,
      address: app.referenceThreeAddress,
      telephone: app.referenceThreeTelephone,
      occupation: app.referenceThreeOccupation,
    },
  ].filter((r) => r.name || r.address || r.telephone || r.occupation);
  const headerLogoWidth = HEADER_LOGO_HEIGHT * mill.logoAspect;
  const watermarkHeight = WATERMARK_WIDTH / mill.logoAspect;
  const watermarkStyle = {
    position: "absolute" as const,
    top: (PAGE_HEIGHT - watermarkHeight) / 2,
    left: (PAGE_WIDTH - WATERMARK_WIDTH) / 2,
    width: WATERMARK_WIDTH,
    height: watermarkHeight,
    opacity: 0.07,
  };

  return (
    <Document title={`${mill.companyCode} Application - ${fullName || app.id}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.companyName}>{mill.headerTitle}</Text>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image renders into the PDF, not the DOM; alt has no meaning here */}
        <Image
          src={mill.logoPath}
          style={{ width: headerLogoWidth, height: HEADER_LOGO_HEIGHT, alignSelf: "center", marginBottom: 6 }}
        />
        <Text style={styles.tagline}>Employment Application. An Equal Opportunity Employer.</Text>
        {mill.policyLines.map((line) => (
          <Text key={line} style={styles.policyLine}>
            {line}
          </Text>
        ))}

        <View style={styles.outerBox}>
          <View style={styles.row}>
            <Cell label="Position applying for" value={app.applicationPosition} last />
          </View>
          <Bar>Personal Information</Bar>
          <View style={styles.row}>
            <Cell label="Last Name" value={app.lastName} />
            <Cell label="First Name" value={app.firstName} />
            <Cell label="Middle Name" value={app.middleName} last />
          </View>
          <View style={styles.row}>
            <Cell label="Primary Phone" value={app.primaryPhone} />
            <Cell label="Secondary Phone" value={app.secondaryPhone} />
            <Cell label="Email" value={app.email} last />
          </View>
          <View style={styles.row}>
            <Cell label="Mailing Address" value={app.mailingAddress} flex={1.6} />
            <Cell label="City" value={app.city} />
            <Cell label="State" value={app.state} flex={0.6} />
            <Cell label="Zip" value={app.zipCode} last flex={0.8} />
          </View>

          <View style={styles.row}>
            <View style={styles.cellLast}>
              <YesNo label="Available for any shift?" value={app.availableForAnyShift} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>
              <YesNo label="Available to work weekends?" value={app.availableWeekends} />
            </View>
            <View style={styles.cellLast}>
              <YesNo label="Are you over 18 years of age?" value={app.ageVerified} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>
              <YesNo
                label={`Worked for ${mill.shortCode} before?`}
                value={app.previouslyEmployedByCompany}
              />
            </View>
            <Cell label="Dates" value={app.datesPreviouslyEmployed} last />
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>
              <YesNo
                label={`Related to a ${mill.shortCode} employee?`}
                value={app.relatedToCompanyEmployee}
              />
            </View>
            <Cell label="Name and Relation" value={app.relatedTo} last />
          </View>

          <Bar>Education</Bar>
          <View style={styles.row}>
            <Cell label="High School" value={app.highschoolName} />
            <Cell label="Location of High School" value={app.highschoolLocation} last />
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>
              <YesNo label="Graduated?" value={app.hsGradStatus === "Graduated" ? true : null} />
            </View>
            <View style={styles.cellLast}>
              <YesNo label="GED?" value={app.hsGradStatus === "GED" ? true : null} />
            </View>
          </View>
          <View style={styles.row}>
            <Cell label="College or University" value={app.collegeOneName} />
            <Cell label="Course of Study" value={app.collegeOneCourseOfStudy} />
            <Cell label="Degree or Certificate" value={app.collegeOneDegree} last />
          </View>
          {app.collegeTwoName ? (
            <View style={styles.row}>
              <Cell label="College or University" value={app.collegeTwoName} />
              <Cell label="Course of Study" value={app.collegeTwoCourseOfStudy} />
              <Cell label="Degree or Certificate" value={app.collegeTwoDegree} last />
            </View>
          ) : null}
          <View style={styles.row}>
            <Cell label="Business or Trade School" value={app.tradeSchoolOneName} />
            <Cell label="Course of Study" value={app.tradeSchoolOneCourseOfStudy} />
            <Cell label="Certificate or License" value={app.tradeSchoolOneCertificate} last />
          </View>
          {app.tradeSchoolTwoName ? (
            <View style={styles.row}>
              <Cell label="Business or Trade School" value={app.tradeSchoolTwoName} />
              <Cell label="Course of Study" value={app.tradeSchoolTwoCourseOfStudy} />
              <Cell label="Certificate or License" value={app.tradeSchoolTwoCertificate} last />
            </View>
          ) : null}
          <View style={styles.rowNoBorder}>
            <Cell label="Special Skills / Licenses / Certificates" value={app.licenseOneName} />
            <Cell label="Issued By" value={app.licenseOneIssuedBy} />
            <Cell label="Expiration Date" value={app.licenseOneExpirationDate} last />
          </View>
        </View>

        <Footer text={mill.footerText} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image renders into the PDF, not the DOM; alt has no meaning here */}
        <Image src={mill.logoPath} style={watermarkStyle} />
        <View style={[styles.outerBox, { marginTop: 0 }]}>
          <Bar>Work/Employment History</Bar>
          <View style={{ paddingVertical: 4, paddingHorizontal: 5, borderBottomWidth: 1, borderColor: "#000" }}>
            <Text style={{ fontSize: 8.5 }}>
              List below all full-time and part-time employment, listing each job separately.
              Start with your most current employer. Account for all periods of employment.
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 8, gap: 5 }}>
          <EmploymentBlock
            title="Current or Most Recent Employer"
            data={{
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
            }}
          />
          <EmploymentBlock
            title="Previous Employment"
            data={{
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
            }}
          />
          <EmploymentBlock
            title="Previous Employment"
            data={{
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
            }}
          />
        </View>

        {references.length > 0 && <ReferencesBlock references={references} />}

        <Text style={{ fontSize: 8, marginTop: 8, lineHeight: 1.35 }}>
          I hereby certify that all statements made in this application are true and I agree and
          understand that any misstatement or omission of material fact(s) will cause forfeiture
          on my part of all rights of employment with {mill.certCompanyName}. I authorize
          investigation of all matters contained in this application. If offered a position, I
          further agree to submit to a complete medical examination and drug screen by a
          physician designated by the company as a condition of employment. I must conform to the
          company&apos;s rules and regulations and understand that if offered employment, it is
          &quot;at will&quot; thus the company retains the right to end employment at any time.
        </Text>

        <View style={{ flexDirection: "row", marginTop: 10 }}>
          <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>Signature: </Text>
          <View style={{ flex: 1, borderBottomWidth: 1, borderColor: "#000", marginRight: 30 }} />
          <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>Date: </Text>
          <View style={{ width: 100, borderBottomWidth: 1, borderColor: "#000" }} />
        </View>

        <Footer text={mill.footerText} />
      </Page>
    </Document>
  );
}
