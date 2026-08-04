"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth";
import { verifyAdminCredentials } from "@/lib/credentials";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginState = {
  error?: string;
};

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a username and password." };
  }

  const user = await verifyAdminCredentials(parsed.data.username, parsed.data.password);
  if (!user) {
    return { error: "That username and password didn't match. Check them and try again." };
  }

  await createSession({ userId: user.id, username: user.username, fullName: user.fullName });
  redirect("/admin");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
