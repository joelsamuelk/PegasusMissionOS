import { redirect } from "next/navigation";

/** Control settings currently live with feature flags and system safety controls. */
export default function ControlSettingsPage(): never {
  redirect("/control/operations");
}
