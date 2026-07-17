"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import axios from "axios";
import { Loader2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";
import { GuestGuard } from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CornerFrame } from "@/components/layout/corner-frame";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    setSubmitting(true);
    try {
      const { data } = await api.post<{ user: AuthUser }>("/auth/login", values);
      setUser(data.user);
      toast.success("Access granted");
      router.push("/dashboard");
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message
        : undefined;
      toast.error(message ?? "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-blueprint-grid flex min-h-svh items-center justify-center bg-background p-6">
      <CornerFrame className="w-full max-w-sm">
        <div className="relative overflow-hidden border border-border bg-card p-8 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 w-1/2 animate-scan-sweep bg-gradient-to-r from-transparent via-primary to-transparent" />

          <div className="mb-8 flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-2 rounded-full bg-primary animate-status-pulse" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <span className="font-data text-[10px] tracking-[0.2em] text-muted-foreground">
              AUTHORIZED PERSONNEL ONLY
            </span>
          </div>

          <h1 className="text-nameplate text-3xl leading-none">
            Khan
            <br />
            Engineerings
          </h1>
          <p className="font-data mt-2 text-xs tracking-widest text-muted-foreground">
            FACTORY OPERATIONS TERMINAL
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@khanengineerings.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" disabled={submitting} className="mt-2 gap-2">
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Sign in
            </Button>
          </form>
        </div>
      </CornerFrame>
    </div>
  );
}

export default function LoginPage() {
  return (
    <GuestGuard>
      <LoginForm />
    </GuestGuard>
  );
}
