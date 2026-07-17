import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Boxes,
  Factory,
  ClipboardList,
  Truck,
  Contact,
  CalendarCheck,
  BarChart3,
  Settings,
  UserRound,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** When false, link is shown as coming soon (Phase 1 modules not built yet) */
  ready?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, ready: true },
  { label: "Employees", href: "/dashboard/employees", icon: Users, ready: false },
  { label: "Departments", href: "/dashboard/departments", icon: Building2, ready: false },
  { label: "Inventory", href: "/dashboard/inventory", icon: Boxes, ready: true },
  { label: "Production", href: "/dashboard/production", icon: Factory, ready: true },
  { label: "Orders", href: "/dashboard/orders", icon: ClipboardList, ready: true },
  { label: "Suppliers", href: "/dashboard/suppliers", icon: Truck, ready: true },
  { label: "Customers", href: "/dashboard/customers", icon: Contact, ready: true },
  { label: "Attendance", href: "/dashboard/attendance", icon: CalendarCheck, ready: false },
  { label: "Reports", href: "/dashboard/reports", icon: BarChart3, ready: true },
  { label: "Profile", href: "/dashboard/profile", icon: UserRound, ready: true },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, ready: true },
];
