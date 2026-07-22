import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Boxes,
  Factory,
  ClipboardList,
  Truck,
  Contact,
  BarChart3,
  Settings,
  UserRound,
  RotateCcw,
  Wallet,
  Banknote,
  Zap,
  MoreHorizontal,
  Receipt,
  Handshake,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n/messages";

export type NavChild = {
  labelKey: MessageKey;
  href: string;
  icon?: LucideIcon;
};

export type NavItem = {
  labelKey: MessageKey;
  href: string;
  icon: LucideIcon;
  ready?: boolean;
  children?: NavChild[];
};

export const EXPENSES_CHILDREN: NavChild[] = [
  { labelKey: "nav.expenses.salaries", href: "/dashboard/expenses/salaries", icon: Banknote },
  { labelKey: "nav.expenses.electricity", href: "/dashboard/expenses/electricity", icon: Zap },
  { labelKey: "nav.expenses.taxes", href: "/dashboard/expenses/taxes", icon: Receipt },
  { labelKey: "nav.expenses.other", href: "/dashboard/expenses/other", icon: MoreHorizontal },
];

export const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, ready: true },
  { labelKey: "nav.inventory", href: "/dashboard/inventory", icon: Boxes, ready: true },
  { labelKey: "nav.production", href: "/dashboard/production", icon: Factory, ready: true },
  { labelKey: "nav.orders", href: "/dashboard/orders", icon: ClipboardList, ready: true },
  {
    labelKey: "nav.expenses",
    href: "/dashboard/expenses",
    icon: Wallet,
    ready: true,
    children: EXPENSES_CHILDREN,
  },
  { labelKey: "nav.claims", href: "/dashboard/claims", icon: RotateCcw, ready: true },
  { labelKey: "nav.suppliers", href: "/dashboard/suppliers", icon: Truck, ready: true },
  { labelKey: "nav.customers", href: "/dashboard/customers", icon: Contact, ready: true },
  { labelKey: "nav.salesmen", href: "/dashboard/salesmen", icon: Handshake, ready: true },
  { labelKey: "nav.reports", href: "/dashboard/reports", icon: BarChart3, ready: true },
  { labelKey: "nav.profile", href: "/dashboard/profile", icon: UserRound, ready: true },
  { labelKey: "nav.settings", href: "/dashboard/settings", icon: Settings, ready: true },
];
