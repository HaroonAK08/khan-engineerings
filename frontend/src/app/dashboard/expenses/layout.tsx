import { ExpensesSubnav } from "@/components/layout/expenses-subnav";

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <ExpensesSubnav />
      {children}
    </div>
  );
}
