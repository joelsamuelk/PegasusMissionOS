import { canControl, type InternalRole } from "@/lib/control-plane/permissions";
import { resolveControlRequestContext } from "@/server/control-plane/context";
import { getControlRepository } from "@/server/control-plane";
import { updateInternalRole, updateInternalStatus } from "@/server/actions/control-team";

const roles: InternalRole[] = [
  "super_admin", "operations", "sales", "customer_success", "support", "product", "finance", "read_only",
];

export default async function ControlTeamPage() {
  const ctx = await resolveControlRequestContext();
  const users = await (await getControlRepository(ctx)).users.list(ctx);
  const mayManage = canControl(ctx.role, "internal_user:manage");
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Configure</p>
        <h1 className="mt-2 text-3xl font-semibold">Internal team</h1>
        <p className="mt-2 text-sm text-ink-muted">Control Plane access is independent from customer workspace membership.</p>
      </div>
      <div className="surface-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line bg-surface-sunken text-xs text-ink-muted">
            <tr><th className="p-4">Person</th><th className="p-4">Role</th><th className="p-4">Status</th><th className="p-4">Controlled change</th></tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-line last:border-0">
                <td className="p-4"><div className="font-semibold">{user.name}</div><div className="text-xs text-ink-muted">{user.email}</div></td>
                <td className="p-4">{user.role.replaceAll("_", " ")}</td>
                <td className="p-4">{user.status}</td>
                <td className="p-4">
                  {mayManage ? (
                    <div className="space-y-2">
                      <form action={updateInternalRole} className="flex gap-2">
                        <input type="hidden" name="userId" value={user.id} />
                        <select name="role" defaultValue={user.role} className="rounded-md border border-line bg-surface px-2 py-1.5">
                          {roles.map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}
                        </select>
                        <input required name="reason" aria-label={`Reason for changing ${user.name}'s role`} placeholder="Reason required" className="min-w-0 rounded-md border border-line px-2 py-1.5" />
                        <button className="rounded-md bg-navy px-3 py-1.5 font-semibold text-white">Save</button>
                      </form>
                      {user.id !== ctx.internalUserId && (
                        <form action={updateInternalStatus} className="flex gap-2">
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="status" value={user.status === "suspended" ? "active" : "suspended"} />
                          <input required name="reason" aria-label={`Reason for changing ${user.name}'s status`} placeholder="Reason required" className="min-w-0 rounded-md border border-line px-2 py-1.5" />
                          <button className="rounded-md border border-line px-3 py-1.5 font-semibold">{user.status === "suspended" ? "Reactivate" : "Suspend"}</button>
                        </form>
                      )}
                    </div>
                  ) : <span className="text-xs text-ink-subtle">View only</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
