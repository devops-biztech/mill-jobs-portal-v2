import { Fragment } from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Application } from "@/generated/prisma/client";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#555", marginBottom: 16 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottom: "1px solid #ccc",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "33.33%", marginBottom: 8, paddingRight: 8 },
  label: { fontSize: 8, color: "#666", textTransform: "uppercase", marginBottom: 2 },
  value: { fontSize: 10 },
});

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value?.trim() ? value : "-"}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.row}>{children}</View>
    </View>
  );
}

export function ApplicationPdf({ app }: { app: Application }) {
  const fullName = [app.firstName, app.middleName, app.lastName].filter(Boolean).join(" ");

  // Filled slots only — SLI requires just the first reference.
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

  return (
    <Document title={`Application - ${fullName || app.id}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{fullName || "Job Application"}</Text>
        <Text style={styles.subtitle}>
          {app.applicationPosition || "Position not specified"} · {app.companyName || "Unknown company"}{" "}
          · Date Applied: {app.date || "Unknown date"}
        </Text>

        <Section title="Contact information">
          <Field label="Primary phone" value={app.primaryPhone} />
          <Field label="Secondary phone" value={app.secondaryPhone} />
          <Field label="Email" value={app.email} />
          <Field label="Mailing address" value={app.mailingAddress} />
          <Field label="City" value={app.city} />
          <Field label="State" value={app.state} />
          <Field label="Zip code" value={app.zipCode} />
        </Section>

        <Section title="Position & availability">
          <Field label="Available any shift" value={app.availableForAnyShift ? "Yes" : "No"} />
          <Field label="Available weekends" value={app.availableWeekends ? "Yes" : "No"} />
          <Field label="Age verified" value={app.ageVerified ? "Yes" : "No"} />
          <Field
            label="Previously employed here"
            value={app.previouslyEmployedByCompany ? app.datesPreviouslyEmployed || "Yes" : "No"}
          />
          <Field
            label="Related to an employee"
            value={app.relatedToCompanyEmployee ? app.relatedTo || "Yes" : "No"}
          />
        </Section>

        <Section title="Education">
          <Field label="High school" value={app.highschoolName} />
          <Field label="High school location" value={app.highschoolLocation} />
          <Field label="Graduation status" value={app.hsGradStatus} />
          <Field label="College 1" value={app.collegeOneName} />
          <Field label="College 1 course of study" value={app.collegeOneCourseOfStudy} />
          <Field label="College 1 degree" value={app.collegeOneDegree} />
          <Field label="College 2" value={app.collegeTwoName} />
          <Field label="College 2 course of study" value={app.collegeTwoCourseOfStudy} />
          <Field label="College 2 degree" value={app.collegeTwoDegree} />
          <Field label="Trade school 1" value={app.tradeSchoolOneName} />
          <Field label="Trade school 1 study" value={app.tradeSchoolOneCourseOfStudy} />
          <Field label="Trade school 1 certificate" value={app.tradeSchoolOneCertificate} />
          <Field label="License 1" value={app.licenseOneName} />
          <Field label="License 1 issued by" value={app.licenseOneIssuedBy} />
          <Field label="License 1 expiration" value={app.licenseOneExpirationDate} />
        </Section>

        <Section title="Current employment">
          <Field label="May we contact" value={app.mayWeContactCurrentEmployer ? "Yes" : "No"} />
          <Field label="Employer" value={app.currentEmployer} />
          <Field label="Employer address" value={app.currentEmployerAddress} />
          <Field label="Employer phone" value={app.currentEmployerPhone} />
          <Field label="Job title" value={app.currentJobTitle} />
          <Field label="Employment dates" value={app.currentEmploymentDates} />
          <Field label="Hours per week" value={app.currentHrsPerWeek} />
          <Field label="Supervisor" value={app.currentSupervisorName} />
          <Field label="Duties performed" value={app.currentDutiesPerformed} />
          <Field label="Reason for leaving" value={app.currentReasonForLeaving} />
        </Section>

        <Section title="Previous employment">
          <Field label="Employer (1)" value={app.previousEmployerOne} />
          <Field label="Job title (1)" value={app.previousJobTitleOne} />
          <Field label="Employment dates (1)" value={app.previousEmploymentDatesOne} />
          <Field label="Reason for leaving (1)" value={app.previousReasonForLeavingOne} />
          <Field label="Employer (2)" value={app.previousEmployerTwo} />
          <Field label="Job title (2)" value={app.previousJobTitleTwo} />
          <Field label="Employment dates (2)" value={app.previousEmploymentDatesTwo} />
          <Field label="Reason for leaving (2)" value={app.previousReasonForLeavingTwo} />
        </Section>

        {/*
          References. Only the SLI online application collects these, and this
          generic template is what SLI currently renders with — there is no
          "SLI" entry in MILL_CONFIGS, so getMillConfig returns null and the
          PDF route falls back here. Other mills have all-null values and the
          section is omitted.
        */}
        {references.length > 0 && (
          <Section title="References">
            {references.map((reference, index) => (
              <Fragment key={index}>
                <Field label={`Name (${index + 1})`} value={reference.name} />
                <Field label={`Occupation (${index + 1})`} value={reference.occupation} />
                <Field label={`Telephone (${index + 1})`} value={reference.telephone} />
                <Field label={`Address (${index + 1})`} value={reference.address} />
              </Fragment>
            ))}
          </Section>
        )}

        <Section title="Agreements">
          <Field label="Agreed to terms" value={app.agreeToTerms ? "Yes" : "No"} />
        </Section>
      </Page>
    </Document>
  );
}
