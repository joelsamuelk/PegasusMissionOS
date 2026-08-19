import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { resolveRequestContext } from "@/server/context/request-context";
import { getRepository } from "@/server/data";
import { ROLE_LABELS, capabilitiesFor } from "@/lib/permissions";
import { formatDate } from "@/lib/formatting";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button, Card } from "@/components/shared/ui";
import { StatusBadge } from "@/components/shared/StatusBadge";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await resolveRequestContext();
  const repo = getRepository();
  const [members, users] = await Promise.all([
    repo.organisations.members(ctx),
    repo.organisations.users(ctx),
  ]);
  // Resolved up front: the table renders synchronously, and one pass over the
  // membership is cheaper than a lookup per row.
  const usersById = new Map(users.map((u) => [u.id, u]));

  return (
    <div>
      <PageHeader
        eyebrow="Team"
        title="Team and roles"
        description="Manage who has access and what they can do. Roles map to a permission model enforced across the workspace."
        actions={
          <Button>
            <UserPlus className="h-4 w-4" /> Invite member
          </Button>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                {["Member", "Role", "Key permissions", "Status", "Joined"].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-subtle">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const user = usersById.get(m.userId);
                const caps = capabilitiesFor(m.role).filter((c) => c !== "read");
                return (
                  <tr key={m.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken text-xs font-medium text-ink">
                          {user?.avatarInitials}
                        </span>
                        <div>
                          <div className="font-medium text-ink">{user?.name}</div>
                          <div className="text-xs text-ink-subtle">{user?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink-muted">{ROLE_LABELS[m.role]}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-ink-subtle">
                        {caps.length > 3 ? `${caps.length} capabilities` : caps.map((c) => c.split(":")[1]).join(", ")}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge
                        tone={m.status === "active" ? "success" : "warning"}
                        label={m.status}
                      />
                    </td>
                    <td className="px-5 py-3 text-ink-subtle">{formatDate(m.joinedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 text-title font-semibold text-ink">Roles</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((role) => (
            <Card key={role} className="p-4">
              <div className="text-sm font-semibold text-ink">{ROLE_LABELS[role]}</div>
              <div className="mt-1 text-xs text-ink-subtle">
                {capabilitiesFor(role).length} capabilities
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
