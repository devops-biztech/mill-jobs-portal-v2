import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getApplicationById, getApplicationStatus } from "@/lib/applications";
import { getAccessScope } from "@/lib/access";
import { getApplicationReviewer } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DetailField } from "@/components/admin/detail-field";
import { StatusBadge } from "@/components/admin/status-badge";
import { StatusActions } from "@/components/admin/status-actions";
import { DeleteApplicationDialog } from "@/components/admin/delete-application-dialog";

function formatDateTime(value: string | Date | null) {
  if (!value) return null;
  const parsed = new Date(value);
  /*
   * Older Application rows store the submitted date as a locale string that
   * `new Date` can't always parse, and showing it raw beats "Invalid Date".
   * An audit timestamp arrives as a real Date and never lands here.
   */
  if (Number.isNaN(parsed.getTime())) return typeof value === "string" ? value : null;
  return parsed.toLocaleString("en-US");
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scope = await getAccessScope();
  const app = await getApplicationById(id, scope);
  if (!app) notFound();

  const status = getApplicationStatus(app);
  const fullName = [app.firstName, app.middleName, app.lastName].filter(Boolean).join(" ");

  /*
   * Only asked for when it can apply. Most reviewed applications still return
   * null — they arrived from the AWS sync already flagged, with no actor to
   * name — so the line below is absent far more often than it is present.
   */
  const reviewer = status === "reviewed" ? await getApplicationReviewer(app.id) : null;

  /*
   * Only the SLI form collects references, and only its first slot is
   * required — so filter to the slots that were actually filled rather than
   * rendering three sets of blanks on every other mill's applications.
   */
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/applications"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to applications
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{fullName || "Applicant"}</h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={status} />
            <span className="text-sm text-muted-foreground">
              Submitted {formatDateTime(app.date) ?? "—"}
            </span>
          </div>
          {reviewer && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Reviewed by <span className="text-foreground">{reviewer.name}</span> on{" "}
              {formatDateTime(reviewer.at)}
            </p>
          )}
          {/*
            * The id is what the applicant was shown as their confirmation
            * number when they submitted, so it belongs on screen where it can
            * be checked against the one they're reading out. `select-all`
            * makes one click grab the whole thing.
            */}
          <p className="mt-1.5 text-sm text-muted-foreground">
            Confirmation no.{" "}
            <span className="font-mono text-xs text-foreground select-all">{app.id}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusActions id={app.id} status={status} />
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a href={`/api/admin/applications/${app.id}/pdf`} target="_blank" rel="noreferrer" />
            }
          >
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Position</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DetailField label="Position applied for" value={app.applicationPosition} />
          <DetailField label="Company" value={app.companyName} />
          <DetailField label="Available any shift" value={app.availableForAnyShift ? "Yes" : "No"} />
          <DetailField label="Available weekends" value={app.availableWeekends ? "Yes" : "No"} />
          <DetailField label="Age verified" value={app.ageVerified ? "Yes" : "No"} />
          <DetailField
            label="Previously employed here"
            value={app.previouslyEmployedByCompany ? app.datesPreviouslyEmployed || "Yes" : "No"}
          />
          <DetailField
            label="Related to an employee"
            value={app.relatedToCompanyEmployee ? app.relatedTo || "Yes" : "No"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DetailField label="Primary phone" value={app.primaryPhone} />
          <DetailField label="Secondary phone" value={app.secondaryPhone} />
          <DetailField label="Email" value={app.email} />
          <DetailField label="Mailing address" value={app.mailingAddress} />
          <DetailField label="City" value={app.city} />
          <DetailField label="State" value={app.state} />
          <DetailField label="Zip code" value={app.zipCode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Education</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DetailField label="High school" value={app.highschoolName} />
          <DetailField label="High school location" value={app.highschoolLocation} />
          <DetailField label="Graduation status" value={app.hsGradStatus} />
          <DetailField label="College 1" value={app.collegeOneName} />
          <DetailField label="College 1 course of study" value={app.collegeOneCourseOfStudy} />
          <DetailField label="College 1 degree" value={app.collegeOneDegree} />
          <DetailField label="College 2" value={app.collegeTwoName} />
          <DetailField label="College 2 course of study" value={app.collegeTwoCourseOfStudy} />
          <DetailField label="College 2 degree" value={app.collegeTwoDegree} />
          <DetailField label="Trade school 1" value={app.tradeSchoolOneName} />
          <DetailField label="Trade school 1 study" value={app.tradeSchoolOneCourseOfStudy} />
          <DetailField label="Trade school 1 certificate" value={app.tradeSchoolOneCertificate} />
          <DetailField label="License 1" value={app.licenseOneName} />
          <DetailField label="License 1 issued by" value={app.licenseOneIssuedBy} />
          <DetailField label="License 1 expiration" value={app.licenseOneExpirationDate} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current employment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DetailField
            label="May we contact"
            value={app.mayWeContactCurrentEmployer ? "Yes" : "No"}
          />
          <DetailField label="Employer" value={app.currentEmployer} />
          <DetailField label="Employer address" value={app.currentEmployerAddress} />
          <DetailField label="Employer phone" value={app.currentEmployerPhone} />
          <DetailField label="Job title" value={app.currentJobTitle} />
          <DetailField label="Employment dates" value={app.currentEmploymentDates} />
          <DetailField label="Hours per week" value={app.currentHrsPerWeek} />
          <DetailField label="Supervisor" value={app.currentSupervisorName} />
          <DetailField label="Duties performed" value={app.currentDutiesPerformed} />
          <DetailField label="Reason for leaving" value={app.currentReasonForLeaving} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Previous employment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DetailField label="Employer (1)" value={app.previousEmployerOne} />
          <DetailField label="Job title (1)" value={app.previousJobTitleOne} />
          <DetailField label="Employment dates (1)" value={app.previousEmploymentDatesOne} />
          <DetailField label="Reason for leaving (1)" value={app.previousReasonForLeavingOne} />
          <DetailField label="Employer (2)" value={app.previousEmployerTwo} />
          <DetailField label="Job title (2)" value={app.previousJobTitleTwo} />
          <DetailField label="Employment dates (2)" value={app.previousEmploymentDatesTwo} />
          <DetailField label="Reason for leaving (2)" value={app.previousReasonForLeavingTwo} />
        </CardContent>
      </Card>

      {references.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>References</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {references.map((reference, index) => (
              <Fragment key={index}>
                <DetailField label={`Name (${index + 1})`} value={reference.name} />
                <DetailField
                  label={`Occupation (${index + 1})`}
                  value={reference.occupation}
                />
                <DetailField
                  label={`Telephone (${index + 1})`}
                  value={reference.telephone}
                />
                <DetailField label={`Address (${index + 1})`} value={reference.address} />
              </Fragment>
            ))}
          </CardContent>
        </Card>
      )}

      {scope.isAdmin && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
          </CardHeader>
          <CardContent className="flex items-start justify-between gap-6">
            <p className="text-sm text-muted-foreground">
              Permanently delete this application and its EEO survey answers. Intended for
              clearing the duplicate submissions that arrive from upstream — check the
              confirmation number above against the copy you mean to keep, and keep whichever
              one carries the review status you want, since deleting the wrong one reverts it.
            </p>
            <DeleteApplicationDialog
              id={app.id}
              applicantName={fullName}
              companyName={app.companyName}
              submittedDate={formatDateTime(app.date)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
