import { redirect } from "next/navigation";

/** Customer organisations are managed through the privacy-safe Customer 360 view. */
export default function OrganisationsPage(): never {
  redirect("/control/customers");
}
