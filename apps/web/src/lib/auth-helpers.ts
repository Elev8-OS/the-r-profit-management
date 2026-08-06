import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";

export interface RequiredSession {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

/**
 * Server-component helper: require an authenticated session, redirect to
 * NextAuth's sign-in page otherwise. Every page under /listings and
 * /settings should call this first — there is no anonymous read access to
 * tenant cost/revenue data by design.
 */
export async function requireSession(): Promise<RequiredSession> {
  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { id?: string; tenantId?: string; email?: string; role?: string }
    | undefined;

  if (!session || !user?.id || !user?.tenantId) {
    redirect("/api/auth/signin");
  }

  return {
    userId: user!.id!,
    tenantId: user!.tenantId!,
    email: user!.email ?? "",
    role: user!.role ?? "ADMIN",
  };
}
