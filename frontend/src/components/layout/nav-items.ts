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
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Employees", href: "/dashboard/employees", icon: Users },
  { label: "Departments", href: "/dashboard/departments", icon: Building2 },
  { label: "Inventory", href: "/dashboard/inventory", icon: Boxes },
  { label: "Production", href: "/dashboard/production", icon: Factory },
  { label: "Orders", href: "/dashboard/orders", icon: ClipboardList },
  { label: "Suppliers", href: "/dashboard/suppliers", icon: Truck },
  { label: "Customers", href: "/dashboard/customers", icon: Contact },
  { label: "Attendance", href: "/dashboard/attendance", icon: CalendarCheck },
  { label: "Reports", href: "/dashboard/reports", icon: BarChart3 },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];
