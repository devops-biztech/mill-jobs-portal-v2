import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAccessScope } from "@/lib/access";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const scope = await getAccessScope();

  return (
    <SidebarProvider>
      <AppSidebar fullName={session.fullName} scope={scope} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">Jobs Portal Admin</span>
          {process.env.DEMO_MODE === "true" && (
            <Badge variant="secondary" className="ml-1">
              Demo Mode — sample data
            </Badge>
          )}
        </header>
        <main className="flex-1 bg-muted/30 px-6 py-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
