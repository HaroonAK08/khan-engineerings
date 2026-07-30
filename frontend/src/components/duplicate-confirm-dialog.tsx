"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  answerDuplicateConfirm,
  getDuplicateConfirmState,
  subscribeDuplicateConfirm,
} from "@/lib/duplicate-confirm";

export function DuplicateConfirmDialog() {
  const [state, setState] = useState(getDuplicateConfirmState);

  useEffect(() => subscribeDuplicateConfirm(setState), []);

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) answerDuplicateConfirm(false);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg gap-5 p-6 sm:p-8"
      >
        <DialogHeader className="items-center text-center sm:items-center">
          <div className="mb-1 flex size-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-7" />
          </div>
          <DialogTitle className="text-nameplate text-xl sm:text-2xl">
            Duplicate entry
          </DialogTitle>
          <DialogDescription className="max-w-md text-base leading-relaxed text-foreground/80">
            {state.message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="-mx-6 -mb-6 gap-3 rounded-b-xl border-t bg-muted/40 p-4 sm:-mx-8 sm:-mb-8 sm:justify-center sm:p-5">
          <Button
            type="button"
            variant="outline"
            className="h-11 min-w-32 text-base"
            onClick={() => answerDuplicateConfirm(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 min-w-32 text-base"
            onClick={() => answerDuplicateConfirm(true)}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
