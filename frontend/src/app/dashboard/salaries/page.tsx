import { redirect } from "next/navigation";

export default function SalariesRedirectPage() {
  redirect("/dashboard/expenses/salaries");
}
