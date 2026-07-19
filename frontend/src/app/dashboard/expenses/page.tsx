import { redirect } from "next/navigation";

export default function ExpensesIndexPage() {
  redirect("/dashboard/expenses/salaries");
}
