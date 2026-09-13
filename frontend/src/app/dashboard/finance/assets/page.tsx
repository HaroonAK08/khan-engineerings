"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import {
  createAssetCategory,
  createAssetItem,
  deleteAssetCategory,
  deleteAssetItem,
  listAssetCategories,
  listAssetItems,
  updateAssetCategory,
  updateAssetItem,
  type AssetCategory,
  type AssetItem,
} from "@/lib/assets-api";
import { calendarDay, todayInput } from "@/lib/date-range";
import { apiError, formatDate } from "@/lib/materials-api";
import { cn } from "@/lib/utils";

type CategoryTreeRow = AssetCategory & { depth: number };

function buildCategoryTree(categories: AssetCategory[]): CategoryTreeRow[] {
  const children = new Map<string, AssetCategory[]>();
  const roots: AssetCategory[] = [];
  for (const c of categories) {
    if (c.parent) {
      const key = String(c.parent);
      if (!children.has(key)) children.set(key, []);
      children.get(key)!.push(c);
    } else {
      roots.push(c);
    }
  }
  const out: CategoryTreeRow[] = [];
  function walk(list: AssetCategory[], depth: number) {
    for (const c of list) {
      out.push({ ...c, depth });
      walk(children.get(String(c._id)) || [], depth + 1);
    }
  }
  walk(roots, 0);
  return out;
}

export default function AssetsPage() {
  const { t } = useI18n();
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [items, setItems] = useState<AssetItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<AssetCategory | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryNotes, setCategoryNotes] = useState("");
  const [categoryParentId, setCategoryParentId] = useState<string>("");

  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AssetItem | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemDetails, setItemDetails] = useState("");
  const [itemDate, setItemDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cats = await listAssetCategories();
      setCategories(cats);
      setSelectedCategoryId((prev) => {
        if (prev && cats.some((c) => c._id === prev)) return prev;
        return cats[0]?._id || "";
      });
    } catch (err) {
      toast.error(apiError(err, t("assets.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadItems = useCallback(async () => {
    if (!selectedCategoryId) {
      setItems([]);
      return;
    }
    try {
      setItems(await listAssetItems({ category: selectedCategoryId }));
    } catch (err) {
      toast.error(apiError(err, t("assets.loadFailed")));
    }
  }, [selectedCategoryId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c._id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  );

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);

  const topLevelCategories = useMemo(
    () => categories.filter((c) => !c.parent),
    [categories]
  );

  const parentSelectItems = useMemo(() => {
    const items: Record<string, string> = {
      __none__: t("assets.noParent"),
    };
    for (const c of topLevelCategories) {
      if (editingCategory && c._id === editingCategory._id) continue;
      items[c._id] = c.name;
    }
    return items;
  }, [topLevelCategories, editingCategory, t]);

  function openNewCategory(parentId?: string) {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryNotes("");
    setCategoryParentId(parentId || "");
    setCategoryOpen(true);
  }

  function openEditCategory(cat: AssetCategory) {
    setEditingCategory(cat);
    setCategoryName(cat.name);
    setCategoryNotes(cat.notes || "");
    setCategoryParentId(cat.parent || "");
    setCategoryOpen(true);
  }

  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    if (!categoryName.trim()) {
      toast.error(t("assets.categoryNameRequired"));
      return;
    }
    setBusy(true);
    try {
      const parent = categoryParentId || null;
      if (editingCategory) {
        await updateAssetCategory(editingCategory._id, {
          name: categoryName.trim(),
          notes: categoryNotes.trim(),
          parent,
        });
        toast.success(t("assets.categoryUpdated"));
      } else {
        const created = await createAssetCategory({
          name: categoryName.trim(),
          notes: categoryNotes.trim(),
          parent,
        });
        toast.success(
          parent ? t("assets.subcategoryCreated") : t("assets.categoryCreated")
        );
        setSelectedCategoryId(created._id);
      }
      setCategoryOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("assets.saveFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteCategory(cat: AssetCategory) {
    if (!window.confirm(t("assets.confirmDeleteCategory"))) return;
    setBusy(true);
    try {
      await deleteAssetCategory(cat._id);
      toast.success(t("assets.categoryDeleted"));
      if (selectedCategoryId === cat._id) setSelectedCategoryId("");
      await load();
    } catch (err) {
      toast.error(apiError(err, t("assets.deleteFailed")));
    } finally {
      setBusy(false);
    }
  }

  function openNewItem() {
    if (!selectedCategoryId) {
      toast.error(t("assets.selectCategoryFirst"));
      return;
    }
    setEditingItem(null);
    setItemName("");
    setItemQty("1");
    setItemDetails("");
    setItemDate(todayInput());
    setItemOpen(true);
  }

  function openEditItem(item: AssetItem) {
    setEditingItem(item);
    setItemName(item.name);
    setItemQty(String(item.quantity ?? 1));
    setItemDetails(item.details || "");
    setItemDate(calendarDay(item.purchaseDate) || "");
    setItemOpen(true);
  }

  async function saveItem(e: FormEvent) {
    e.preventDefault();
    if (!selectedCategoryId) {
      toast.error(t("assets.selectCategoryFirst"));
      return;
    }
    if (!itemName.trim()) {
      toast.error(t("assets.itemNameRequired"));
      return;
    }
    setBusy(true);
    try {
      const body = {
        category: selectedCategoryId,
        name: itemName.trim(),
        price: 0,
        quantity: Math.max(1, Number(itemQty) || 1),
        details: itemDetails.trim(),
        purchaseDate: itemDate || undefined,
      };
      if (editingItem) {
        await updateAssetItem(editingItem._id, body);
        toast.success(t("assets.itemUpdated"));
      } else {
        await createAssetItem(body);
        toast.success(t("assets.itemCreated"));
      }
      setItemOpen(false);
      await Promise.all([load(), loadItems()]);
    } catch (err) {
      toast.error(apiError(err, t("assets.saveFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteItem(item: AssetItem) {
    if (!window.confirm(t("assets.confirmDeleteItem"))) return;
    setBusy(true);
    try {
      await deleteAssetItem(item._id);
      toast.success(t("assets.itemDeleted"));
      await Promise.all([load(), loadItems()]);
    } catch (err) {
      toast.error(apiError(err, t("assets.deleteFailed")));
    } finally {
      setBusy(false);
    }
  }

  const selectedIsTopLevel = selectedCategory && !selectedCategory.parent;

  return (
    <div className="flex flex-col gap-6">
      <FinanceSubnav />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("common.financeEyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("assets.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("assets.subtitle")}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="text-nameplate text-sm">{t("assets.categories")}</CardTitle>
              <Button type="button" size="sm" className="gap-1" onClick={() => openNewCategory()}>
                <Plus className="size-3.5" />
                {t("assets.addCategory")}
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 px-2 pb-3">
              {categoryTree.map((cat) => (
                <div key={cat._id} className="flex items-stretch gap-0.5" style={{ paddingLeft: cat.depth * 12 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId(cat._id)}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                      selectedCategoryId === cat._id
                        ? "bg-primary/15 text-foreground"
                        : "hover:bg-muted"
                    )}
                  >
                    <span className="truncate font-medium">
                      {cat.depth > 0 ? `${cat.name}` : cat.name}
                    </span>
                    <span className="font-data text-xs text-muted-foreground">
                      {t("assets.itemCount", { count: String(cat.itemCount || 0) })}
                    </span>
                  </button>
                  {cat.depth === 0 ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="mt-1 shrink-0"
                      title={t("assets.addSubcategory")}
                      onClick={() => openNewCategory(cat._id)}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-nameplate text-sm">
                  {selectedCategory
                    ? selectedCategory.parentName
                      ? `${selectedCategory.parentName} · ${selectedCategory.name}`
                      : selectedCategory.name
                    : t("assets.items")}
                </CardTitle>
                <CardDescription>
                  {selectedCategory
                    ? t("assets.itemsInCategory")
                    : t("assets.selectCategoryFirst")}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedCategory ? (
                  <>
                    {selectedIsTopLevel ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => openNewCategory(selectedCategory._id)}
                      >
                        <Plus className="size-3.5" />
                        {t("assets.addSubcategory")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => openEditCategory(selectedCategory)}
                    >
                      <Pencil className="size-3.5" />
                      {t("assets.editCategory")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1 text-destructive"
                      disabled={busy}
                      onClick={() => void onDeleteCategory(selectedCategory)}
                    >
                      <Trash2 className="size-3.5" />
                      {t("assets.deleteCategory")}
                    </Button>
                    <Button type="button" size="sm" className="gap-1" onClick={openNewItem}>
                      <Plus className="size-3.5" />
                      {t("assets.addItem")}
                    </Button>
                  </>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {!selectedCategoryId ? (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                  {t("assets.selectCategoryFirst")}
                </p>
              ) : items.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                  {t("assets.noItems")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("assets.col.name")}</TableHead>
                      <TableHead className="text-right">{t("assets.col.qty")}</TableHead>
                      <TableHead>{t("assets.col.date")}</TableHead>
                      <TableHead>{t("assets.col.details")}</TableHead>
                      <TableHead className="w-[1%]">{t("cus.col.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item._id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="font-data text-xs text-muted-foreground">
                          {item.purchaseDate ? formatDate(item.purchaseDate) : "—"}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {item.details || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => openEditItem(item)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={busy}
                              onClick={() => void onDeleteItem(item)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-nameplate text-base">
              {editingCategory
                ? t("assets.editCategory")
                : categoryParentId
                  ? t("assets.addSubcategory")
                  : t("assets.addCategory")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveCategory} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("assets.parentCategory")}</Label>
              <Select
                value={categoryParentId || "__none__"}
                onValueChange={(v) => setCategoryParentId(!v || v === "__none__" ? "" : v)}
                items={parentSelectItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("assets.noParent")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{parentSelectItems.__none__}</SelectItem>
                  {topLevelCategories
                    .filter((c) => !editingCategory || c._id !== editingCategory._id)
                    .map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {parentSelectItems[c._id]}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>
                {categoryParentId ? t("assets.subcategoryName") : t("assets.categoryName")}
              </Label>
              <Input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder={t("assets.categoryNamePh")}
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("assets.notesOptional")}</Label>
              <Input
                value={categoryNotes}
                onChange={(e) => setCategoryNotes(e.target.value)}
                placeholder={t("assets.categoryNotesPh")}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryOpen(false)}>
                {t("cus.cancel")}
              </Button>
              <Button type="submit" disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("cus.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-nameplate text-base">
              {editingItem ? t("assets.editItem") : t("assets.addItem")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveItem} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("assets.col.name")}</Label>
              <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder={t("assets.itemNamePh")}
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("assets.col.qty")}</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={itemQty}
                onChange={(e) => setItemQty(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("assets.col.date")}</Label>
              <Input
                type="date"
                value={itemDate}
                onChange={(e) => setItemDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("assets.col.details")}</Label>
              <Textarea
                value={itemDetails}
                onChange={(e) => setItemDetails(e.target.value)}
                placeholder={t("assets.itemDetailsPh")}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setItemOpen(false)}>
                {t("cus.cancel")}
              </Button>
              <Button type="submit" disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("cus.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
