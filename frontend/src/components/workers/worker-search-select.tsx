"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { Worker } from "@/lib/workers-api";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

type WorkerSearchSelectProps = {
  workers: Worker[];
  value: string;
  onChange: (workerId: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

function displayWorkerName(
  w: { name: string; nameUr?: string },
  isUrdu: boolean
) {
  if (isUrdu && w.nameUr?.trim()) return w.nameUr.trim();
  return w.name;
}

function displayJob(
  job: string,
  t: (key: "sal.jobMolder" | "sal.jobHelper") => string
) {
  const key = job.trim().toLowerCase();
  if (key === "molder") return t("sal.jobMolder");
  if (key === "helper") return t("sal.jobHelper");
  return job;
}

export function WorkerSearchSelect({
  workers,
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
}: WorkerSearchSelectProps) {
  const { t, isUrdu } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => workers.find((w) => w._id === value) || null,
    [workers, value]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.nameUr && w.nameUr.toLowerCase().includes(q)) ||
        (w.job && w.job.toLowerCase().includes(q))
    );
  }, [workers, search]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="overflow-hidden rounded-lg border border-input">
        <button
          type="button"
          disabled={disabled}
          className="flex min-h-11 w-full items-center px-3 py-2.5 text-left text-base hover:bg-muted/50 disabled:opacity-50"
          onClick={() => {
            setOpen((v) => !v);
            setSearch("");
          }}
        >
          <span
            className={cn(
              "truncate",
              selected ? "text-foreground" : "text-muted-foreground"
            )}
            dir={
              selected && isUrdu && selected.nameUr?.trim() ? "rtl" : undefined
            }
          >
            {selected
              ? displayWorkerName(selected, isUrdu)
              : placeholder || t("sal.pickWorker")}
          </span>
        </button>
        {open && (
          <div className="border-t border-border bg-card">
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 pl-9"
                placeholder={t("sal.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {t("sal.noMatch", { query: search.trim() || "—" })}
                </p>
              ) : (
                filtered.map((w) => {
                  const active = value === w._id;
                  return (
                    <button
                      key={w._id}
                      type="button"
                      className={cn(
                        "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-base hover:bg-muted",
                        active ? "bg-muted" : ""
                      )}
                      onClick={() => {
                        onChange(w._id);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <span
                        className="font-medium"
                        dir={isUrdu && w.nameUr?.trim() ? "rtl" : undefined}
                      >
                        {displayWorkerName(w, isUrdu)}
                      </span>
                      {w.job ? (
                        <span className="text-sm text-muted-foreground">
                          {displayJob(w.job, t)}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
