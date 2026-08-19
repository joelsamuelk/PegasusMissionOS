import { notFound, redirect } from "next/navigation";
import { appConfig } from "@/lib/config";
import { resolveRequestContext } from "@/server/context/request-context";
import {
  NoMembershipError,
  NotAuthenticatedError,
} from "@/server/context/supabase-context";
import { getRepository } from "@/server/data";
import { ShellChrome } from "@/components/layout/ShellChrome";

/**
 * Authenticated application shell.
 *
 * The organisation, acting user and role come from the request context and the
 * repository, never from module constants. When Supabase Auth lands the context
 * resolves from the session and this file does not change.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let ctx;
  try {
    ctx = await resolveRequestContext();
  } catch (error) {
    if (error instanceof NotAuthenticatedError) redirect("/login");
    if (error instanceof NoMembershipError) redirect("/login?error=no_membership");
    throw error;
  }
  const repo = getRepository();

  const [organisation, user, member, notifications] = await Promise.all([
    repo.organisations.get(ctx),
    repo.organisations.currentUser(ctx),
    repo.organisations.currentMember(ctx),
    repo.workspace.notifications(ctx),
  ]);

  // A context that resolves to no organisation, user or membership is not a
  // recoverable UI state: it means the caller has no workspace to be in.
  if (!organisation || !user || !member) notFound();

  return (
    <ShellChrome
      organisation={organisation}
      user={user}
      role={member.role}
      notifications={notifications}
      now={ctx.now()}
      authenticationEnabled={!appConfig.isMockData}
    >
      {children}
    </ShellChrome>
  );
}
