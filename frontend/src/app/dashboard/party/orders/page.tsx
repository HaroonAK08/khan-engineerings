import { redirect } from "next/navigation";

export default function PartyOrdersRedirect() {
  redirect("/dashboard/party?tab=orders");
}
