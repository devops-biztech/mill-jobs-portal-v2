import { Monitor } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Below `lg`, the real app is `display:none` (not just visually covered),
 * so it's automatically out of the tab order and accessibility tree — no
 * separate inert/focus-trap handling needed. Pure CSS media query, so
 * server and client agree on first render; no hydration mismatch risk.
 */
export function DesktopOnlyGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="hidden lg:block">{children}</div>
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 lg:hidden">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Monitor className="size-5" aria-hidden="true" />
            </div>
            <CardTitle>Desktop required</CardTitle>
            <CardDescription>
              This application has been developed for desktop devices only. Please use a desktop
              device to access this application.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}
