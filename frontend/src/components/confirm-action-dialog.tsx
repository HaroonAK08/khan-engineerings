"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";
import {
  answerConfirmAction,
  getConfirmActionState,
  subscribeConfirmAction,
} from "@/lib/confirm-action";

/**
 * Styled confirmation for destructive actions, mounted once in the dashboard
 * layout. Replaces native window.confirm so the app has one visual language
 * for "are you sure" — and so the dialog can list consequences, which a native
 * confirm cannot.
 */
export function ConfirmActionDialog() {
  const { t } = useI18n();
  const [state, setState] = useState(getConfirmActionState);

  useEffect(() => subscribeConfirmAction(setState), []);

  const danger = state.tone !== "warning";

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) answerConfirmAction(false);
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-lg gap-5 p-6 sm:p-8">
        <DialogHeader className="items-center text-center sm:items-center">
          <div
            className={
              danger
                ? "mb-1 flex size-14 items-center justify-center rounded-full bg-destructive/15 text-destructive"
                : "mb-1 flex size-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
            }
          >
            {danger ? <Trash2 className="size-7" /> : <AlertTriangle className="size-7" />}
          </div>
          <DialogTitle className="text-nameplate text-xl sm:text-2xl">
            {state.title}
          </DialogTitle>
          {state.description ? (
            <DialogDescription className="max-w-md text-base leading-relaxed text-foreground/80">
              {state.description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {state.consequences?.length ? (
          <ul className="mx-auto w-full max-w-md space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
            {state.consequences.map((line) => (
              <li key={line} className="flex gap-2 text-foreground/80">
                <span aria-hidden className="text-muted-foreground">
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {state.reversible ? null : (
          <p className="text-center text-xs font-medium text-destructive">
            {t("common.irreversible")}
          </p>
        )}

        <DialogFooter className="-mx-6 -mb-6 gap-3 rounded-b-xl border-t bg-muted/40 p-4 sm:-mx-8 sm:-mb-8 sm:justify-center sm:p-5">
          <Button
            type="button"
            variant="outline"
            className="min-w-28"
            onClick={() => answerConfirmAction(false)}
          >
            {state.cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant={danger ? "destructive" : "default"}
            className="min-w-28"
            onClick={() => answerConfirmAction(true)}
          >
            {state.confirmLabel ?? t("common.deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
