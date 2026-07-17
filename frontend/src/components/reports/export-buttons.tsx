"use client";

import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  exporting: "xlsx" | "pdf" | null;
  onExport: (format: "xlsx" | "pdf") => void;
  className?: string;
};

export function ExportButtons({ exporting, onExport, className }: Props) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={!!exporting}
        onClick={() => onExport("xlsx")}
      >
        {exporting === "xlsx" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <FileSpreadsheet className="size-3.5" />
        )}
        Excel
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={!!exporting}
        onClick={() => onExport("pdf")}
      >
        {exporting === "pdf" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <FileDown className="size-3.5" />
        )}
        PDF
      </Button>
    </div>
  );
}
