import { redirect } from "next/navigation";

export default function OldInventoryRedirect() {
  redirect("/dashboard/old-inventory");
}
