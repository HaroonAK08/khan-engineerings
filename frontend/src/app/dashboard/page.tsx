import { Users, ClipboardList, Boxes, CalendarCheck, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Stat = {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
};

const STATS: Stat[] = [
  {
    label: "Employees",
    value: "0",
    hint: "no records yet",
    icon: Users,
    accent: "bg-chart-1",
  },
  {
    label: "Active Orders",
    value: "0",
    hint: "no orders yet",
    icon: ClipboardList,
    accent: "bg-chart-2",
  },
  {
    label: "Low Stock Items",
    value: "0",
    hint: "inventory not seeded",
    icon: Boxes,
    accent: "bg-chart-3",
  },
  {
    label: "Attendance Today",
    value: "0 / 0",
    hint: "not tracked yet",
    icon: CalendarCheck,
    accent: "bg-chart-4",
  },
];

const LOG: { time: string; message: string }[] = [
  { time: "SYSTEM", message: "Auth module online — register/login/logout ready" },
  { time: "SYSTEM", message: "Employee, Inventory, Production modules not yet built" },
  { time: "SYSTEM", message: "Dashboard is running on an empty database" },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="relative overflow-hidden py-0">
              <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="font-data mt-2 text-3xl font-medium">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                </div>
                <Icon className="size-5 text-muted-foreground" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-nameplate text-sm">System Log</CardTitle>
            <Badge variant="secondary" className="font-data text-[10px]">
              LIVE
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {LOG.map((entry, i) => (
              <li
                key={i}
                className="font-data flex items-baseline gap-3 border-b border-border/60 py-2 text-xs last:border-0"
              >
                <span className="shrink-0 text-muted-foreground">[{entry.time}]</span>
                <span>{entry.message}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
