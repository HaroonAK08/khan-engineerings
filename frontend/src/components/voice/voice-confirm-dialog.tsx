"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntityMatch, ResolvedVoiceDraft, VoiceIntent } from "@/lib/voice/types";
import { isAlwaysCommonExpenseCategory } from "@/hooks/use-persisted-expense-scope";
import { listCustomers } from "@/lib/sales-api";
import { listSuppliers } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";

const EXPENSE_CATEGORIES = [
  "electricity",
  "taxes",
  "petrol",
  "lpg_gas",
  "paint",
  "silica_sand",
  "silicate",
  "sheera",
  "chemicals",
  "tools",
  "machine",
  "repairs",
  "tour_expenses",
  "other",
] as const;

const INTENT_LABEL: Record<VoiceIntent, string> = {
  expense: "Expense",
  purchase: "Purchase",
  builty: "Builty",
  customer_payment: "Customer payment",
  supplier_payment: "Supplier payment",
  produce: "Production",
  navigate: "Open page",
};

type Props = {
  open: boolean;
  draft: ResolvedVoiceDraft | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (draft: ResolvedVoiceDraft) => void;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function mergeOptions(preferred: EntityMatch[], all: EntityMatch[]) {
  const map = new Map<string, EntityMatch>();
  for (const row of preferred) map.set(row.id, row);
  for (const row of all) {
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return Array.from(map.values());
}

export function VoiceConfirmDialog({
  open,
  draft,
  saving,
  onOpenChange,
  onConfirm,
}: Props) {
  const [local, setLocal] = useState<ResolvedVoiceDraft | null>(null);
  const [supplierOptions, setSupplierOptions] = useState<EntityMatch[]>([]);
  const [customerOptions, setCustomerOptions] = useState<EntityMatch[]>([]);
  const [productOptions, setProductOptions] = useState<EntityMatch[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    if (draft) setLocal({ ...draft });
  }, [draft]);

  useEffect(() => {
    if (!open || !draft) return;
    let cancelled = false;
    setLoadingOptions(true);

    (async () => {
      try {
        const needsSuppliers =
          draft.intent === "purchase" || draft.intent === "supplier_payment";
        const needsCustomers =
          draft.intent === "builty" || draft.intent === "customer_payment";
        const needsProducts = draft.intent === "builty" || draft.intent === "produce";

        if (draft.intent === "navigate") {
          if (!cancelled) setLoadingOptions(false);
          return;
        }

        const [suppliers, customers, products] = await Promise.all([
          needsSuppliers ? listSuppliers({ active: "true" }) : Promise.resolve([]),
          needsCustomers ? listCustomers({ active: "true" }) : Promise.resolve([]),
          needsProducts ? listProducts({ active: "true" }) : Promise.resolve([]),
        ]);
        if (cancelled) return;

        setSupplierOptions(
          mergeOptions(
            draft.supplierMatches,
            suppliers.map((s) => ({
              id: s._id,
              label: s.nameUr ? `${s.name} (${s.nameUr})` : s.name,
              score: 0,
            }))
          )
        );
        setCustomerOptions(
          mergeOptions(
            draft.customerMatches,
            customers.map((c) => ({ id: c._id, label: c.name, score: 0 }))
          )
        );
        setProductOptions(
          mergeOptions(
            draft.productMatches,
            products.map((p) => ({
              id: p._id,
              label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
              score: 0,
            }))
          )
        );
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, draft]);

  const canSave = useMemo(() => {
    if (!local) return false;
    switch (local.intent) {
      case "expense":
        return Boolean(local.category && local.amount && local.amount > 0);
      case "purchase":
        return Boolean(
          local.selectedSupplierId &&
            local.quantity &&
            local.quantity > 0 &&
            ((local.rate && local.rate > 0) || (local.amount && local.amount > 0))
        );
      case "builty":
        return Boolean(
          local.builtyNo?.trim() &&
            local.selectedCustomerId &&
            local.selectedProductId &&
            local.quantity &&
            local.quantity > 0 &&
            ((local.pricingMode === "rate_kg" && local.rate && local.rate > 0) ||
              (local.pricingMode === "fixed" && local.amount && local.amount > 0))
        );
      case "customer_payment":
        return Boolean(
          local.selectedCustomerId && local.amount && local.amount > 0
        );
      case "supplier_payment":
        return Boolean(
          local.selectedSupplierId && local.amount && local.amount > 0
        );
      case "produce":
        return Boolean(
          local.selectedProductId && local.quantity && local.quantity > 0
        );
      case "navigate":
        return Boolean(local.navigateHref);
      default:
        return false;
    }
  }, [local]);

  useEffect(() => {
    if (!open) return;
    const onAccept = () => {
      if (!local || saving || !canSave) return;
      onConfirm(local);
    };
    window.addEventListener("voice-confirm-accept", onAccept);
    return () => window.removeEventListener("voice-confirm-accept", onAccept);
  }, [open, local, saving, canSave, onConfirm]);

  if (!local) return null;

  const patch = (partial: Partial<ResolvedVoiceDraft>) =>
    setLocal((prev) => (prev ? { ...prev, ...partial } : prev));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg gap-5 p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Review {INTENT_LABEL[local.intent]}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {local.intent === "navigate"
              ? "Choose where to go, then tap Open."
              : "Check every field below. Edit anything that is wrong, then tap Add to save it."}
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          “{local.transcript}”
        </p>

        {loadingOptions ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading options…
          </div>
        ) : null}

        <div className="grid gap-3">
          {local.intent === "navigate" && (
            <Field label="Open">
              <select
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={local.navigateHref || ""}
                onChange={(e) => {
                  const href = e.target.value;
                  const option = (local.navigateOptions || []).find(
                    (row) => row.href === href
                  );
                  patch({
                    navigateHref: href,
                    navigateLabel: option?.label || local.navigateLabel,
                  });
                }}
              >
                {(local.navigateOptions || []).map((m) => (
                  <option key={`${m.href}-${m.id}`} value={m.href || ""}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {local.intent === "expense" && (
            <>
              <Field label="Category">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={local.category || "other"}
                  onChange={(e) => {
                    const category = e.target.value;
                    patch({
                      category,
                      scope: isAlwaysCommonExpenseCategory(category)
                        ? "common"
                        : local.scope || "common",
                    });
                  }}
                >
                  {EXPENSE_CATEGORIES.map((id) => (
                    <option key={id} value={id}>
                      {id.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </Field>
              {local.category === "other" && (
                <Field label="Title">
                  <Input
                    value={local.title || ""}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="Short title"
                  />
                </Field>
              )}
              <Field label="Amount">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={local.amount ?? ""}
                  onChange={(e) =>
                    patch({ amount: e.target.value ? Number(e.target.value) : undefined })
                  }
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={local.expenseDate || ""}
                  onChange={(e) => patch({ expenseDate: e.target.value })}
                />
              </Field>
            </>
          )}

          {local.intent === "purchase" && (
            <>
              <Field label="Supplier">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={local.selectedSupplierId || ""}
                  onChange={(e) => patch({ selectedSupplierId: e.target.value })}
                >
                  <option value="">Select supplier</option>
                  {supplierOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Material">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={local.materialType || "scrap"}
                  onChange={(e) =>
                    patch({ materialType: e.target.value as "scrap" | "daig" })
                  }
                >
                  <option value="scrap">Scrap</option>
                  <option value="daig">Daig</option>
                </select>
              </Field>
              <Field label="Quantity (kg)">
                <Input
                  type="number"
                  min={1}
                  step="1"
                  value={local.quantity ?? ""}
                  onChange={(e) =>
                    patch({
                      quantity: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </Field>
              <Field label="Rate per kg">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={local.rate ?? ""}
                  onChange={(e) =>
                    patch({ rate: e.target.value ? Number(e.target.value) : undefined })
                  }
                />
              </Field>
              <Field label="Total amount (optional if rate set)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={local.amount ?? ""}
                  onChange={(e) =>
                    patch({ amount: e.target.value ? Number(e.target.value) : undefined })
                  }
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={local.purchaseDate || ""}
                  onChange={(e) => patch({ purchaseDate: e.target.value })}
                />
              </Field>
            </>
          )}

          {local.intent === "builty" && (
            <>
              <Field label="Builty no">
                <Input
                  value={local.builtyNo || ""}
                  onChange={(e) => patch({ builtyNo: e.target.value })}
                />
              </Field>
              <Field label="Bill no (optional)">
                <Input
                  value={local.billNo || ""}
                  onChange={(e) => patch({ billNo: e.target.value })}
                />
              </Field>
              <Field label="Customer">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={local.selectedCustomerId || ""}
                  onChange={(e) => patch({ selectedCustomerId: e.target.value })}
                >
                  <option value="">Select customer</option>
                  {customerOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Product">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={local.selectedProductId || ""}
                  onChange={(e) => patch({ selectedProductId: e.target.value })}
                >
                  <option value="">Select product</option>
                  {productOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quantity">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={local.quantity ?? ""}
                  onChange={(e) =>
                    patch({
                      quantity: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </Field>
              <Field label="Pricing">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={local.pricingMode || "rate_kg"}
                  onChange={(e) =>
                    patch({
                      pricingMode: e.target.value as "rate_kg" | "fixed",
                    })
                  }
                >
                  <option value="rate_kg">Rate per kg</option>
                  <option value="fixed">Fixed per unit</option>
                </select>
              </Field>
              {local.pricingMode === "fixed" ? (
                <Field label="Fixed amount (per unit)">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={local.amount ?? ""}
                    onChange={(e) =>
                      patch({
                        amount: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </Field>
              ) : (
                <Field label="Rate per kg">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={local.rate ?? ""}
                    onChange={(e) =>
                      patch({
                        rate: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </Field>
              )}
              <Field label="Amount paid now (optional)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={local.amountPaid ?? ""}
                  onChange={(e) =>
                    patch({
                      amountPaid: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={local.builtyDate || ""}
                  onChange={(e) => patch({ builtyDate: e.target.value })}
                />
              </Field>
            </>
          )}

          {local.intent === "customer_payment" && (
            <>
              <Field label="Customer">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={local.selectedCustomerId || ""}
                  onChange={(e) => patch({ selectedCustomerId: e.target.value })}
                >
                  <option value="">Select customer</option>
                  {customerOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Amount">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={local.amount ?? ""}
                  onChange={(e) =>
                    patch({ amount: e.target.value ? Number(e.target.value) : undefined })
                  }
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={local.paymentDate || ""}
                  onChange={(e) => patch({ paymentDate: e.target.value })}
                />
              </Field>
            </>
          )}

          {local.intent === "supplier_payment" && (
            <>
              <Field label="Supplier">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={local.selectedSupplierId || ""}
                  onChange={(e) => patch({ selectedSupplierId: e.target.value })}
                >
                  <option value="">Select supplier</option>
                  {supplierOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Amount">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={local.amount ?? ""}
                  onChange={(e) =>
                    patch({ amount: e.target.value ? Number(e.target.value) : undefined })
                  }
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={local.paymentDate || ""}
                  onChange={(e) => patch({ paymentDate: e.target.value })}
                />
              </Field>
            </>
          )}

          {local.intent === "produce" && (
            <>
              <Field label="Product">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={local.selectedProductId || ""}
                  onChange={(e) => patch({ selectedProductId: e.target.value })}
                >
                  <option value="">Select product</option>
                  {productOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quantity (pcs)">
                <Input
                  type="number"
                  min={1}
                  step="1"
                  value={local.quantity ?? ""}
                  onChange={(e) =>
                    patch({
                      quantity: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </Field>
              <Field label="Material">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  value={local.materialType || "scrap"}
                  onChange={(e) =>
                    patch({ materialType: e.target.value as "scrap" | "daig" })
                  }
                >
                  <option value="scrap">Scrap</option>
                  <option value="daig">Daig</option>
                </select>
              </Field>
              <Field label="Waste %">
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={local.wastePercent ?? 6}
                  onChange={(e) =>
                    patch({
                      wastePercent: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </Field>
              <Field label="Batch no (optional)">
                <Input
                  value={local.batchNo || ""}
                  onChange={(e) => patch({ batchNo: e.target.value })}
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={local.productionDate || ""}
                  onChange={(e) => patch({ productionDate: e.target.value })}
                />
              </Field>
            </>
          )}

          {local.intent !== "navigate" ? (
            <Field label="Notes (optional)">
              <Input
                value={local.notes || ""}
                onChange={(e) => patch({ notes: e.target.value })}
                placeholder="Optional notes"
              />
            </Field>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSave || saving || loadingOptions}
            onClick={() => onConfirm(local)}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : local.intent === "navigate" ? (
              "Open"
            ) : (
              "Add"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
