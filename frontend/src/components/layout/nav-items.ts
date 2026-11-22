import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Boxes,
  Factory,
  Truck,
  Users,
  BarChart3,
  // Settings,
  // UserRound,
  RotateCcw,
  Wallet,
  Banknote,
  Zap,
  MoreHorizontal,
  Receipt,
  Handshake,
  Package,
  ScrollText,
  FolderKanban,
  CalendarDays,
  CalendarRange,
  Landmark,
  Mic,
  History,
  Archive,
  AlertTriangle,
  ArrowLeftRight,
  SlidersHorizontal,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n/messages";

export type NavChild = {
  labelKey: MessageKey;
  href: string;
  icon?: LucideIcon;
  exact?: boolean;
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

export const PARTY_CHILDREN: NavChild[] = [
  { labelKey: "nav.party.parties", href: "/dashboard/party", icon: Users, exact: true },
  { labelKey: "nav.party.groups", href: "/dashboard/party/groups", icon: FolderKanban },
];

export const INVENTORY_CHILDREN: NavChild[] = [
  {
    labelKey: "inventory.purchases",
    href: "/dashboard/inventory",
    icon: Boxes,
    exact: true,
  },
  {
    labelKey: "inventory.finished",
    href: "/dashboard/inventory/finished",
    icon: Package,
  },
  {
    labelKey: "nav.oldInventory",
    href: "/dashboard/old-inventory",
    icon: Archive,
  },
  {
    labelKey: "inventory.reports",
    href: "/dashboard/inventory/reports",
    icon: BarChart3,
  },
  {
    labelKey: "nav.inventory.alerts",
    href: "/dashboard/inventory/alerts",
    icon: AlertTriangle,
  },
  {
    labelKey: "nav.inventory.movements",
    href: "/dashboard/inventory/movements",
    icon: ArrowLeftRight,
  },
  {
    labelKey: "nav.inventory.settings",
    href: "/dashboard/inventory/settings",
    icon: SlidersHorizontal,
  },
];

/** Production has its own sub-pages that were previously URL-only. */
export const PRODUCTION_CHILDREN: NavChild[] = [
  {
    labelKey: "nav.production.runs",
    href: "/dashboard/production",
    icon: Factory,
    exact: true,
  },
  {
    labelKey: "nav.production.history",
    href: "/dashboard/production/history",
    icon: History,
  },
  {
    labelKey: "nav.production.byProduct",
    href: "/dashboard/production/products",
    icon: Package,
  },
  {
    labelKey: "nav.production.costs",
    href: "/dashboard/production/costs",
    icon: Receipt,
  },
  {
    labelKey: "nav.production.reports",
    href: "/dashboard/production/reports",
    icon: BarChart3,
  },
];

export const FINANCE_CHILDREN: NavChild[] = [
  {
    labelKey: "financeSubnav.productionMargin",
    href: "/dashboard",
    icon: Factory,
    exact: true,
  },
  {
    labelKey: "financeSubnav.partyMargin",
    href: "/dashboard/finance/party-margin",
    icon: Handshake,
  },
  {
    labelKey: "financeSubnav.monthly",
    href: "/dashboard/finance/monthly",
    icon: CalendarDays,
  },
  {
    labelKey: "financeSubnav.yearProgress",
    href: "/dashboard/finance/year-progress",
    icon: CalendarRange,
  },
  {
    labelKey: "financeSubnav.assets",
    href: "/dashboard/finance/assets",
    icon: Landmark,
  },
  {
    labelKey: "nav.overview",
    href: "/dashboard/overview",
    icon: LayoutDashboard,
  },
];

export const NAV_ITEMS: NavItem[] = [
  {
    labelKey: "nav.dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    ready: true,
    children: FINANCE_CHILDREN,
  },
  { labelKey: "nav.voice", href: "/dashboard/today", icon: Mic, ready: true },
  {
    labelKey: "nav.inventory",
    href: "/dashboard/inventory",
    icon: Boxes,
    ready: true,
    children: INVENTORY_CHILDREN,
  },
  { labelKey: "nav.products", href: "/dashboard/products", icon: Package, ready: true },
  {
    labelKey: "nav.production",
    href: "/dashboard/production",
    icon: Factory,
    ready: true,
    children: PRODUCTION_CHILDREN,
  },
  {
    labelKey: "nav.expenses",
    href: "/dashboard/expenses",
    icon: Wallet,
    ready: true,
    children: EXPENSES_CHILDREN,
  },
  {
    labelKey: "nav.party",
    href: "/dashboard/party",
    icon: Users,
    ready: true,
    children: PARTY_CHILDREN,
  },
  { labelKey: "nav.builty", href: "/dashboard/builty", icon: ScrollText, ready: true },
  { labelKey: "nav.claims", href: "/dashboard/claims", icon: RotateCcw, ready: true },
  { labelKey: "nav.suppliers", href: "/dashboard/suppliers", icon: Truck, ready: true },
  { labelKey: "nav.salesmen", href: "/dashboard/salesmen", icon: Handshake, ready: true },
  { labelKey: "nav.reports", href: "/dashboard/reports", icon: BarChart3, ready: true },
  { labelKey: "nav.history", href: "/dashboard/history", icon: History, ready: true },
];
