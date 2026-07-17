"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
import { apiError } from "@/lib/materials-api";
import {
  createCategory,
  createSize,
  createWarehouse,
  listCategories,
  listSizes,
  listWarehouses,
  updateCategory,
  updateSize,
  updateWarehouse,
  type CatalogItem,
} from "@/lib/inventory-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Kind = "categories" | "sizes" | "warehouses";

export default function InventorySettingsPage() {
  const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [sizes, setSizes] = useState<CatalogItem[]>([]);
  const [warehouses, setWarehouses] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const [kind, setKind] = useState<Kind>("categories");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, w] = await Promise.all([listCategories(), listSizes(), listWarehouses()]);
      setCategories(c);
      setSizes(s);
      setWarehouses(w);
    } catch (err) {
      toast.error(apiError(err, "Failed to load settings"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onAdd() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (kind === "categories") {
        await createCategory({ name: name.trim(), description: extra.trim() });
      } else if (kind === "sizes") {
        await createSize({ name: name.trim(), code: extra.trim() });
      } else {
        await createWarehouse({
          name: name.trim(),
          location: extra.trim(),
          isDefault: warehouses.length === 0,
        });
      }
      toast.success("Created");
      setName("");
      setExtra("");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to create"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(k: Kind, item: CatalogItem) {
    try {
      if (k === "categories") await updateCategory(item._id, { isActive: !item.isActive });
      else if (k === "sizes") await updateSize(item._id, { isActive: !item.isActive });
      else await updateWarehouse(item._id, { isActive: !item.isActive });
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to update"));
    }
  }

  async function makeDefault(item: CatalogItem) {
    try {
      await updateWarehouse(item._id, { isDefault: true });
      toast.success("Default warehouse updated");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to update warehouse"));
    }
  }

  function renderTable(k: Kind, rows: CatalogItem[]) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>{k === "sizes" ? "Code" : k === "warehouses" ? "Location" : "Description"}</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row._id}>
              <TableCell className="font-medium">
                {row.name}
                {row.isDefault && (
                  <Badge variant="secondary" className="ml-2 font-data text-[9px]">
                    DEFAULT
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {k === "sizes" ? row.code || "—" : k === "warehouses" ? row.location || "—" : row.description || "—"}
              </TableCell>
              <TableCell>
                <Badge variant={row.isActive ? "secondary" : "outline"} className="font-data text-[10px]">
                  {row.isActive ? "ACTIVE" : "INACTIVE"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {k === "warehouses" && !row.isDefault && (
                    <Button size="sm" variant="ghost" onClick={() => makeDefault(row)}>
                      Set default
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(k, row)}>
                    {row.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <InventorySubnav />
      <div>
        <h1 className="text-nameplate text-xl">Inventory settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Product categories, sizes, and warehouses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">Add entry</CardTitle>
          <CardDescription>Create a category, size, or warehouse.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="categories">Category</option>
            <option value="sizes">Size</option>
            <option value="warehouses">Warehouse</option>
          </select>
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="sm:max-w-xs"
          />
          <Input
            placeholder={
              kind === "sizes" ? "Code (optional)" : kind === "warehouses" ? "Location" : "Description"
            }
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            className="sm:max-w-xs"
          />
          <Button onClick={onAdd} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No categories</p>
              ) : (
                renderTable("categories", categories)
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Sizes</CardTitle>
            </CardHeader>
            <CardContent>
              {sizes.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No sizes</p>
              ) : (
                renderTable("sizes", sizes)
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Warehouses</CardTitle>
            </CardHeader>
            <CardContent>
              {warehouses.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No warehouses yet — first sync/purchase creates Main Warehouse.
                </p>
              ) : (
                renderTable("warehouses", warehouses)
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
