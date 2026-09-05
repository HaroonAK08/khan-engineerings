"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Op = "+" | "-" | "*" | "/";

function formatDisplay(value: string) {
  if (!value || value === "-") return value || "0";
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [intPart, decPart] = raw.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = decPart != null ? `${grouped}.${decPart}` : grouped;
  return negative ? `-${body}` : body;
}

function trimTrailingZeros(n: number) {
  const rounded = Math.round(n * 1e10) / 1e10;
  if (!Number.isFinite(rounded)) return "0";
  return String(rounded);
}

function compute(a: number, b: number, operator: Op) {
  switch (operator) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? NaN : a / b;
  }
}

export function SimpleCalculator() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true);
  const stateRef = useRef({ display: "0", stored: null as number | null, op: null as Op | null, fresh: true });

  stateRef.current = { display, stored, op, fresh };

  function reset() {
    setDisplay("0");
    setStored(null);
    setOp(null);
    setFresh(true);
  }

  function inputDigit(digit: string) {
    setDisplay((prev) => {
      const { fresh: isFresh } = stateRef.current;
      if (isFresh || prev === "0" || prev === "Error") return digit;
      if (prev === "-0") return `-${digit}`;
      if (prev.replace("-", "").replace(".", "").length >= 14) return prev;
      return `${prev}${digit}`;
    });
    setFresh(false);
  }

  function inputDot() {
    setDisplay((prev) => {
      const { fresh: isFresh } = stateRef.current;
      if (isFresh || prev === "Error") return "0.";
      if (prev.includes(".")) return prev;
      return `${prev}.`;
    });
    setFresh(false);
  }

  function toggleSign() {
    setDisplay((prev) => {
      if (prev === "Error" || prev === "0" || prev === "0.") return prev;
      return prev.startsWith("-") ? prev.slice(1) : `-${prev}`;
    });
    setFresh(false);
  }

  function applyOp(next: Op) {
    const { display: currentDisplay, stored: currentStored, op: currentOp, fresh: isFresh } =
      stateRef.current;
    const current = Number(currentDisplay);
    if (!Number.isFinite(current)) {
      reset();
      return;
    }
    if (currentStored != null && currentOp && !isFresh) {
      const result = compute(currentStored, current, currentOp);
      if (!Number.isFinite(result)) {
        setDisplay("Error");
        setStored(null);
        setOp(null);
        setFresh(true);
        return;
      }
      setStored(result);
      setDisplay(trimTrailingZeros(result));
    } else {
      setStored(current);
    }
    setOp(next);
    setFresh(true);
  }

  function equals() {
    const { display: currentDisplay, stored: currentStored, op: currentOp } = stateRef.current;
    if (currentStored == null || !currentOp) return;
    const current = Number(currentDisplay);
    const result = compute(currentStored, current, currentOp);
    if (!Number.isFinite(result)) {
      setDisplay("Error");
      setStored(null);
      setOp(null);
      setFresh(true);
      return;
    }
    setDisplay(trimTrailingZeros(result));
    setStored(null);
    setOp(null);
    setFresh(true);
  }

  function backspace() {
    const { fresh: isFresh, display: currentDisplay } = stateRef.current;
    if (isFresh || currentDisplay === "Error") {
      reset();
      return;
    }
    setDisplay((prev) => {
      if (prev.length <= 1 || (prev.length === 2 && prev.startsWith("-"))) return "0";
      return prev.slice(0, -1);
    });
  }

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        inputDigit(key);
        return;
      }
      if (key === "." || key === ",") {
        e.preventDefault();
        inputDot();
        return;
      }
      if (key === "+" || key === "-" || key === "*" || key === "/") {
        e.preventDefault();
        applyOp(key);
        return;
      }
      if (key === "Enter" || key === "=") {
        e.preventDefault();
        equals();
        return;
      }
      if (key === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }
      if (key === "Escape") {
        return;
      }
      if (key === "Delete" || key.toLowerCase() === "c") {
        e.preventDefault();
        reset();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const keys: Array<{
    label: string;
    onClick: () => void;
    className?: string;
    span?: boolean;
  }> = [
    { label: "C", onClick: reset, className: "bg-muted text-foreground" },
    { label: "±", onClick: toggleSign, className: "bg-muted text-foreground" },
    { label: "⌫", onClick: backspace, className: "bg-muted text-foreground" },
    { label: "÷", onClick: () => applyOp("/"), className: "bg-primary text-primary-foreground" },
    { label: "7", onClick: () => inputDigit("7") },
    { label: "8", onClick: () => inputDigit("8") },
    { label: "9", onClick: () => inputDigit("9") },
    { label: "×", onClick: () => applyOp("*"), className: "bg-primary text-primary-foreground" },
    { label: "4", onClick: () => inputDigit("4") },
    { label: "5", onClick: () => inputDigit("5") },
    { label: "6", onClick: () => inputDigit("6") },
    { label: "−", onClick: () => applyOp("-"), className: "bg-primary text-primary-foreground" },
    { label: "1", onClick: () => inputDigit("1") },
    { label: "2", onClick: () => inputDigit("2") },
    { label: "3", onClick: () => inputDigit("3") },
    { label: "+", onClick: () => applyOp("+"), className: "bg-primary text-primary-foreground" },
    { label: "0", onClick: () => inputDigit("0"), span: true },
    { label: ".", onClick: inputDot },
    { label: "=", onClick: equals, className: "bg-primary text-primary-foreground" },
  ];

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-sidebar-foreground"
        aria-label={t("topbar.calculator")}
        onClick={() => setOpen(true)}
      >
        <Calculator className="size-5" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("topbar.calculator")}</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-4 text-right">
            <p className="font-data text-3xl tracking-tight break-all">
              {display === "Error" ? t("topbar.calculatorError") : formatDisplay(display)}
            </p>
            {op && stored != null ? (
              <p className="mt-1 font-data text-xs text-muted-foreground">
                {formatDisplay(trimTrailingZeros(stored))}{" "}
                {op === "*" ? "×" : op === "/" ? "÷" : op}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {keys.map((key) => (
              <Button
                key={key.label}
                type="button"
                variant="outline"
                className={cn(
                  "h-12 font-data text-lg",
                  key.span && "col-span-2",
                  key.className
                )}
                onClick={key.onClick}
              >
                {key.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
