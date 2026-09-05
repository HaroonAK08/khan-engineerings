import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  Boxes,
  CalendarDays,
  CalendarRange,
  Shield,
  Factory,
  FileText,
  Handshake,
  LayoutDashboard,
  Mic,
  Package,
  Receipt,
  RotateCcw,
  ScrollText,
  Settings,
  Truck,
  UserRound,
  Users,
  Wallet,
  Zap,
  MoreHorizontal,
  FolderKanban,
  History,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n/messages";

export type SearchPageGroup = "pages" | "reports";

export type SearchPage = {
  href: string;
  labelKey: MessageKey;
  keywords: string[];
  icon: LucideIcon;
  group: SearchPageGroup;
  featured?: boolean;
};

export const SEARCH_PAGES: SearchPage[] = [
  {
    href: "/dashboard",
    labelKey: "nav.dashboard",
    keywords: ["dashboard", "home", "finance", "overview", "ڈیش بورڈ"],
    icon: LayoutDashboard,
    group: "pages",
    featured: true,
  },
  {
    href: "/dashboard/today",
    labelKey: "nav.voice",
    keywords: ["voice", "mic", "microphone", "voice entry", "وائس"],
    icon: Mic,
    group: "pages",
  },
  {
    href: "/dashboard/inventory",
    labelKey: "nav.inventory",
    keywords: ["inventory", "stock", "purchase", "purchases", "scrap", "daig", "انوینٹری", "خریداری"],
    icon: Boxes,
    group: "pages",
    featured: true,
  },
  {
    href: "/dashboard/inventory/finished",
    labelKey: "inventory.finished",
    keywords: ["finished", "finished goods", "finished stock"],
    icon: Package,
    group: "pages",
  },
  {
    href: "/dashboard/inventory/reports",
    labelKey: "inventory.reports",
    keywords: ["inventory report", "stock report"],
    icon: BarChart3,
    group: "pages",
  },
  {
    href: "/dashboard/products",
    labelKey: "nav.products",
    keywords: ["products", "product", "sku", "hub", "drum", "پروڈکٹ"],
    icon: Package,
    group: "pages",
    featured: true,
  },
  {
    href: "/dashboard/production",
    labelKey: "nav.production",
    keywords: ["production", "produce", "factory", "پیداوار"],
    icon: Factory,
    group: "pages",
    featured: true,
  },
  {
    href: "/dashboard/production/new",
    labelKey: "prod.produceBtn",
    keywords: ["new production", "add production", "create production", "produce"],
    icon: Factory,
    group: "pages",
  },
  {
    href: "/dashboard/production/history",
    labelKey: "prod.historyTitle",
    keywords: ["production history", "batches", "batch"],
    icon: Factory,
    group: "pages",
  },
  {
    href: "/dashboard/expenses",
    labelKey: "nav.expenses",
    keywords: ["expenses", "expense", "kharcha", "خرچہ", "اخراجات"],
    icon: Wallet,
    group: "pages",
    featured: true,
  },
  {
    href: "/dashboard/expenses/salaries",
    labelKey: "nav.expenses.salaries",
    keywords: ["salaries", "salary", "wages", "workers", "labour", "تنخواہ"],
    icon: Banknote,
    group: "pages",
  },
  {
    href: "/dashboard/expenses/electricity",
    labelKey: "nav.expenses.electricity",
    keywords: ["electricity", "bijli", "power", "بجلی"],
    icon: Zap,
    group: "pages",
  },
  {
    href: "/dashboard/expenses/taxes",
    labelKey: "nav.expenses.taxes",
    keywords: ["taxes", "tax", "ٹیکس"],
    icon: Receipt,
    group: "pages",
  },
  {
    href: "/dashboard/expenses/other",
    labelKey: "nav.expenses.other",
    keywords: ["other expenses", "misc"],
    icon: MoreHorizontal,
    group: "pages",
  },
  {
    href: "/dashboard/party",
    labelKey: "nav.party",
    keywords: ["party", "parties", "customers", "customer", "گاہک", "پارٹی"],
    icon: Users,
    group: "pages",
    featured: true,
  },
  {
    href: "/dashboard/party/groups",
    labelKey: "nav.party.groups",
    keywords: ["party groups", "groups", "گروپ"],
    icon: FolderKanban,
    group: "pages",
  },
  {
    href: "/dashboard/builty",
    labelKey: "nav.builty",
    keywords: ["builty", "bilt", "bilti", "bility", "sales", "sale", "بلٹی"],
    icon: ScrollText,
    group: "pages",
    featured: true,
  },
  {
    href: "/dashboard/builty/new",
    labelKey: "builty.new",
    keywords: ["new builty", "create builty", "new sale", "add sale"],
    icon: ScrollText,
    group: "pages",
  },
  {
    href: "/dashboard/builty/history",
    labelKey: "builty.history",
    keywords: ["builty history", "sales history"],
    icon: ScrollText,
    group: "pages",
  },
  {
    href: "/dashboard/claims",
    labelKey: "nav.claims",
    keywords: ["claims", "claim", "returns", "کلیم"],
    icon: RotateCcw,
    group: "pages",
  },
  {
    href: "/dashboard/suppliers",
    labelKey: "nav.suppliers",
    keywords: ["suppliers", "supplier", "vendor", "سپلائر"],
    icon: Truck,
    group: "pages",
  },
  {
    href: "/dashboard/salesmen",
    labelKey: "nav.salesmen",
    keywords: ["salesmen", "salesman", "sales man", "سیلز مین"],
    icon: Handshake,
    group: "pages",
  },
  {
    href: "/dashboard/finance/party-margin",
    labelKey: "financeSubnav.partyMargin",
    keywords: ["party margin", "party sale", "party cost"],
    icon: Handshake,
    group: "pages",
  },
  {
    href: "/dashboard/finance/monthly",
    labelKey: "financeSubnav.monthly",
    keywords: ["monthly", "monthly finance", "month"],
    icon: CalendarDays,
    group: "pages",
  },
  {
    href: "/dashboard/finance/year-progress",
    labelKey: "financeSubnav.yearProgress",
    keywords: [
      "year progress",
      "yearly",
      "year",
      "monthly progress",
      "سالانہ",
      "پیش رفت",
    ],
    icon: CalendarRange,
    group: "pages",
  },
  {
    href: "/dashboard/finance/vault",
    labelKey: "financeSubnav.vault",
    keywords: [
      "vault",
      "private assets",
      "bank",
      "assets",
      "pin",
      "نجی",
      "اثاثے",
      "بینک",
    ],
    icon: Shield,
    group: "pages",
  },
  {
    href: "/dashboard/profile",
    labelKey: "nav.profile",
    keywords: ["profile", "account", "پروفائل"],
    icon: UserRound,
    group: "pages",
  },
  {
    href: "/dashboard/settings",
    labelKey: "nav.settings",
    keywords: ["settings", "ترتیبات", "tax", "tax split", "50/50", "per kg", "ٹیکس"],
    icon: Settings,
    group: "pages",
  },
  {
    href: "/dashboard/history",
    labelKey: "nav.history",
    keywords: ["history", "log", "recent", "last", "ہسٹری"],
    icon: History,
    group: "pages",
    featured: true,
  },
  {
    href: "/dashboard/reports",
    labelKey: "nav.reports",
    keywords: ["reports", "report", "full report", "رپورٹ", "رپورٹس"],
    icon: BarChart3,
    group: "reports",
    featured: true,
  },
  {
    href: "/dashboard/reports/received",
    labelKey: "rep.nav.received",
    keywords: ["received", "money received", "cash received", "وصول"],
    icon: Banknote,
    group: "reports",
  },
  {
    href: "/dashboard/reports/paid",
    labelKey: "rep.nav.paid",
    keywords: ["paid", "supplier payments", "paid suppliers"],
    icon: Truck,
    group: "reports",
  },
  {
    href: "/dashboard/reports/receivables",
    labelKey: "rep.nav.receivables",
    keywords: ["receivables", "pending", "baqaya", "outstanding", "بقایا"],
    icon: Banknote,
    group: "reports",
  },
  {
    href: "/dashboard/reports/payables",
    labelKey: "rep.nav.payables",
    keywords: ["payables", "to pay", "supplier due"],
    icon: Receipt,
    group: "reports",
  },
  {
    href: "/dashboard/reports/sales",
    labelKey: "rep.nav.sales",
    keywords: ["sales report", "sales", "revenue"],
    icon: ScrollText,
    group: "reports",
  },
  {
    href: "/dashboard/reports/purchases",
    labelKey: "rep.nav.purchases",
    keywords: ["purchase report", "purchases report"],
    icon: Boxes,
    group: "reports",
  },
  {
    href: "/dashboard/reports/production",
    labelKey: "rep.nav.production",
    keywords: ["production report"],
    icon: Factory,
    group: "reports",
  },
  {
    href: "/dashboard/reports/costs",
    labelKey: "rep.nav.expenses",
    keywords: ["expense report", "costs", "cost report"],
    icon: Wallet,
    group: "reports",
  },
  {
    href: "/dashboard/reports/salaries",
    labelKey: "rep.nav.salaries",
    keywords: ["salary report", "salary reports"],
    icon: Banknote,
    group: "reports",
  },
  {
    href: "/dashboard/reports/inventory",
    labelKey: "rep.nav.inventory",
    keywords: ["inventory report", "stock report"],
    icon: Boxes,
    group: "reports",
  },
  {
    href: "/dashboard/reports/yearly",
    labelKey: "rep.nav.yearly",
    keywords: ["yearly", "year", "bill", "leftover", "progress"],
    icon: CalendarDays,
    group: "reports",
  },
  {
    href: "/dashboard/reports/statements",
    labelKey: "rep.nav.statements",
    keywords: ["statements", "statement", "ledger", "بیان"],
    icon: FileText,
    group: "reports",
  },
];

export function scoreSearchText(query: string, texts: string[]): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const tokens = q.split(/\s+/).filter(Boolean);
  let best = 0;
  for (const raw of texts) {
    const hay = raw.toLowerCase();
    if (!hay) continue;
    if (hay === q) best = Math.max(best, 100);
    else if (hay.startsWith(q)) best = Math.max(best, 88);
    else if (hay.includes(q)) best = Math.max(best, 72);
    else {
      const hit = tokens.filter((token) => hay.includes(token)).length;
      if (hit === tokens.length) best = Math.max(best, 58);
      else if (hit > 0) best = Math.max(best, 16 + hit * 14);
    }
  }
  return best;
}
