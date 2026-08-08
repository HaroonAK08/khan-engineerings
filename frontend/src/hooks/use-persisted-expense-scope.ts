"use client";

import { useEffect } from "react";
import {
  useExpenseScopeStore,
  type ExpenseScopeFilter,
} from "@/stores/expense-scope-store";
import type { ExpenseScope } from "@/lib/workers-api";

/** Factory consumables / shared shop costs — never hub or drum specific. */
export const ALWAYS_COMMON_EXPENSE_CATEGORIES = new Set([
  "electricity",
  "taxes",
  "paint",
  "lpg_gas",
  "petrol",
  "tools",
  "machine",
  "repairs",
]);

export function isAlwaysCommonExpenseCategory(category: string | null | undefined) {
  return Boolean(category && ALWAYS_COMMON_EXPENSE_CATEGORIES.has(category));
}

export function normalizeExpenseScope(
  scope: string | null | undefined
): ExpenseScope {
  return scope === "hub" || scope === "drum" ? scope : "common";
}

export function effectiveExpenseScope(
  category: string | null | undefined,
  scope: string | null | undefined
): ExpenseScope {
  if (isAlwaysCommonExpenseCategory(category)) return "common";
  return normalizeExpenseScope(scope);
}

export function matchesExpenseScope(
  itemScope: string | null | undefined,
  filter: ExpenseScopeFilter,
  category?: string | null
) {
  if (filter === "all") return true;
  return effectiveExpenseScope(category, itemScope) === filter;
}

export function usePersistedExpenseScope() {
  const scope = useExpenseScopeStore((s) => s.scope);
  const hydrated = useExpenseScopeStore((s) => s.hydrated);
  const hydrate = useExpenseScopeStore((s) => s.hydrate);
  const setScope = useExpenseScopeStore((s) => s.setScope);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const formDefault: ExpenseScope = scope === "all" ? "common" : scope;

  return { scope, hydrated, setScope, formDefault };
}
