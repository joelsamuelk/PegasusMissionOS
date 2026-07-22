import { q } from "@/features/store";
import { ShellChrome } from "@/components/layout/ShellChrome";

/**
 * Authenticated application shell. In mock mode the current user, organisation
 * and notifications come from the seeded store. With Supabase configured these
 * would be resolved from the session and RLS-scoped queries.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const organisation = q.organisation();
  const user = q.currentUser();
  const member = q.currentMember();
  const notifications = q.notifications();

  return (
    <ShellChrome
      organisation={organisation}
      user={user}
      role={member.role}
      notifications={notifications}
    >
      {children}
    </ShellChrome>
  );
}
