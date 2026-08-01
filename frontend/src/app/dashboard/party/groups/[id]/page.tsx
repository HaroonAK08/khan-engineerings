"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { apiError } from "@/lib/materials-api";
import { getPartyGroup, type PartyGroup } from "@/lib/sales-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function PartyGroupDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const id = String(params.id || "");
  const [group, setGroup] = useState<PartyGroup | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setGroup(await getPartyGroup(id));
    } catch (err) {
      toast.error(apiError(err, t("pgroup.loadFailed")));
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const parties = group?.parties || [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/party/groups"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("pgroup.backToGroups")}
        </Link>
        <h1 className="text-nameplate text-xl">
          {loading ? t("pgroup.pageTitle") : group?.name || t("pgroup.pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pgroup.detailSubtitle")}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("pgroup.col.parties")}</CardTitle>
          <CardDescription>
            {group ? t("pgroup.partiesInGroup", { count: parties.length }) : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : !group ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("pgroup.notFound")}</p>
          ) : parties.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("pgroup.noParties")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("cus.col.name")}</TableHead>
                  <TableHead>{t("cus.col.phone")}</TableHead>
                  <TableHead>{t("cus.col.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parties.map((party) => (
                  <TableRow
                    key={party._id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/party/customers/${party._id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/dashboard/party/customers/${party._id}`);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{party.name}</TableCell>
                    <TableCell className="font-data text-xs">{party.phone || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {party.isActive === false
                        ? t("cus.status.inactive")
                        : t("cus.status.active")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
