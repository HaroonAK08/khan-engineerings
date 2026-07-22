import { redirect } from "next/navigation";

export default function InventoryPurchasesRedirect() {
  redirect("/dashboard/inventory");
}
