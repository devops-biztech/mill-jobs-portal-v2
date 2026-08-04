import { redirect } from "next/navigation";
import { getAccessScope } from "@/lib/access";
import { getAllUsers } from "@/lib/users";
import { UsersTable } from "@/components/admin/users-table";

export default async function UsersPage() {
  const scope = await getAccessScope();
  if (!scope.isAdmin) redirect("/admin");

  const users = await getAllUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Manage which mills each HR user can see and update.
        </p>
      </div>
      <UsersTable users={users} />
    </div>
  );
}
