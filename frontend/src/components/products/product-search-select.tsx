"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { formatKg } from "@/lib/materials-api";
import type { Product } from "@/types/production";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

type ProductSearchSelectProps = {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  /** Only list products that have weightKg > 0 */
  requireWeight?: boolean;
  showWeight?: boolean;
  showFamily?: boolean;
  className?: string;
  disabled?: boolean;
};

export function ProductSearchSelect({
  products,
  value,
  onChange,
  placeholder,
  emptyLabel,
  requireWeight = false,
  showWeight = true,
  showFamily = true,
  className,
  disabled = false,
}: ProductSearchSelectProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => products.find((p) => p._id === value) || null,
    [products, value]
  );

  const filtered = useMemo(() => {
    let list = products;
    if (requireWeight) {
      list = list.filter((p) => Number(p.weightKg) > 0);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.family && p.family.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        String(p.weightKg ?? "").includes(q)
    );
  }, [products, requireWeight, search]);

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

  function labelFor(p: Product) {
    const parts = [p.name];
    if (showWeight && Number(p.weightKg) > 0) {
      parts.push(`${formatKg(Number(p.weightKg))} kg`);
    }
    return parts.join(" · ");
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="overflow-hidden rounded-lg border border-input">
        <button
          type="button"
          disabled={disabled}
          className="flex h-8 w-full items-center px-2.5 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
          onClick={() => {
            setOpen((v) => !v);
            setSearch("");
          }}
        >
          <span className={cn("truncate", selected ? "text-foreground" : "text-muted-foreground")}>
            {selected
              ? labelFor(selected)
              : placeholder || t("prod.selectProduct")}
          </span>
        </button>
        {open && (
          <div className="border-t border-border bg-card">
            <div className="relative border-b border-border p-2">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-8"
                placeholder={t("prod.searchProduct")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {emptyLabel != null && (
                <button
                  type="button"
                  className={cn(
                    "flex w-full px-3 py-2 text-left text-sm hover:bg-muted",
                    !value ? "bg-muted" : ""
                  )}
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  {emptyLabel}
                </button>
              )}
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {t("prod.noMatchProduct")}
                </p>
              ) : (
                filtered.map((p) => {
                  const active = value === p._id;
                  const kg = Number(p.weightKg) || 0;
                  return (
                    <button
                      key={p._id}
                      type="button"
                      className={cn(
                        "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted",
                        active && "bg-muted"
                      )}
                      onClick={() => {
                        onChange(p._id);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <span className="font-medium">{p.name}</span>
                      {(showFamily || showWeight) && (
                        <span className="font-data text-[10px] text-muted-foreground uppercase">
                          {[
                            showFamily ? p.family : null,
                            showWeight && kg > 0 ? `${formatKg(kg)} kg` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
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
