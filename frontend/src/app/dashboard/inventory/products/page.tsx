import { redirect } from "next/navigation";

export default function InventoryProductsRedirect() {
  redirect("/dashboard/products");
}
