import { Redwood } from "@/components/login/redwood";
import { LoginForm } from "@/components/login/login-form";
import { TreeRingsMark } from "@/components/login/tree-rings";

/**
 * Server component on purpose: the redwood artwork is ~65KB of path geometry,
 * and keeping it outside a "use client" boundary means it renders as HTML
 * rather than shipping to the browser as JavaScript. Only the form itself is
 * interactive, so that is the one piece that runs on the client.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-sidebar-border bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="relative z-10 flex items-center gap-3">
          <TreeRingsMark className="size-11 shrink-0" />
          <span className="font-heading text-lg font-semibold tracking-tight">
            Jobs Portal Admin
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-4 top-24 flex justify-center">
          <Redwood className="h-full w-auto" />
        </div>

        <p className="relative z-10 text-sm text-sidebar-foreground/60">
          Built by{" "}
          <a
            href="https://trustbiztech.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sidebar-foreground/80 underline-offset-4 hover:text-sidebar-foreground hover:underline"
          >
            Biztech
          </a>
        </p>
      </aside>

      <main className="flex w-full items-center justify-center bg-background px-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">Admin sign in</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your admin account to view job applications.
          </p>
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
