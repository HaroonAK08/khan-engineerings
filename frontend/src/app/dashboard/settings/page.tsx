"use client";

import { Monitor, Moon, Sun, Shield, Database } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light", icon: Sun },
  { value: "dark" as const, label: "Dark", icon: Moon },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-primary" />
            <CardTitle className="text-nameplate text-sm">Appearance</CardTitle>
          </div>
          <CardDescription>Choose light or dark appearance for this workstation.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = theme === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setTheme(option.value)}
                >
                  <Icon className="size-4" />
                  {option.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <CardTitle className="text-nameplate text-sm">Access & roles</CardTitle>
          </div>
          <CardDescription>
            Role-based access is wired on the API. More roles and permissions land in later phases.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Signed in as</p>
              <p className="font-data text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Badge variant="secondary" className="font-data uppercase">
              {user?.role ?? "—"}
            </Badge>
          </div>
          <Separator />
          <ul className="font-data flex flex-col gap-2 text-xs text-muted-foreground">
            <li>
              <span className="text-foreground">admin</span> — full system access
            </li>
            <li>
              <span className="text-foreground">manager</span> — department operations (future)
            </li>
            <li>
              <span className="text-foreground">staff</span> — limited access (future)
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <CardTitle className="text-nameplate text-sm">System</CardTitle>
          </div>
          <CardDescription>Environment and build metadata for this panel.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="font-data grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            <div className="border border-border/60 p-3">
              <dt className="text-muted-foreground">Build</dt>
              <dd className="mt-1 text-foreground">v0.1.0 · Phase 1</dd>
            </div>
            <div className="border border-border/60 p-3">
              <dt className="text-muted-foreground">API</dt>
              <dd className="mt-1 break-all text-foreground">
                {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api"}
              </dd>
            </div>
            <div className="border border-border/60 p-3">
              <dt className="text-muted-foreground">Auth</dt>
              <dd className="mt-1 text-foreground">JWT cookie · 7d TTL</dd>
            </div>
            <div className="border border-border/60 p-3">
              <dt className="text-muted-foreground">Company settings</dt>
              <dd className="mt-1 text-muted-foreground">Coming in a later phase</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
