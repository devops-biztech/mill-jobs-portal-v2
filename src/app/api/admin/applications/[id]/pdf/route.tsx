import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getSession } from "@/lib/auth";
import { getApplicationById, getApplicationStatus } from "@/lib/applications";
import { getApplicationReviewer } from "@/lib/audit";
import { getAccessScope } from "@/lib/access";
import { ApplicationPdf } from "@/lib/pdf/application-pdf";
import { MillApplicationPdf } from "@/lib/pdf/mill-application-pdf";
import { ModernApplicationPdf } from "@/lib/pdf/modern-application-pdf";
import { getMillConfig } from "@/lib/pdf/mill-config";
import type { PdfReview } from "@/lib/pdf/review-line";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const scope = await getAccessScope();
  const app = await getApplicationById(id, scope);
  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const status = getApplicationStatus(app);
  const review: PdfReview = {
    status,
    // Only ever attributable for a reviewed one, and only when the portal is
    // what reviewed it — the sync records no actor.
    reviewer: status === "reviewed" ? await getApplicationReviewer(app.id) : null,
  };

  const mill = getMillConfig(app.companyName);
  const document = !mill ? (
    <ApplicationPdf app={app} review={review} />
  ) : mill.template === "modern" ? (
    <ModernApplicationPdf app={app} mill={mill} review={review} />
  ) : (
    <MillApplicationPdf app={app} mill={mill} review={review} />
  );
  const buffer = await renderToBuffer(document);

  const fileName = [app.firstName, app.lastName].filter(Boolean).join("-") || app.id;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="application-${fileName}.pdf"`,
    },
  });
}
