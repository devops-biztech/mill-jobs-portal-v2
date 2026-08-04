import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getApplicationById, getApplicationStatus } from "@/lib/applications";
import { getAccessScope } from "@/lib/access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DetailField } from "@/components/admin/detail-field";
import { StatusBadge } from "@/components/admin/status-badge";
import { StatusActions } from "@/components/admin/status-actions";

function formatDateTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
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
    </div>
  );
}
