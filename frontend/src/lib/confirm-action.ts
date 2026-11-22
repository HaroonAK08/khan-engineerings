/**
 * Promise-based confirmation for destructive actions.
 *
 * Mirrors lib/duplicate-confirm.ts so both confirmations behave the same way
 * and share the app's dialog styling, replacing the ~20 native window.confirm()
 * calls flagged in docs/audit/06 (UX-009).
 *
 * The important difference from window.confirm is the payload: a destructive
 * confirmation states WHAT is affected and WHETHER it can be undone, because
 * deleting a builty here also returns stock and removes ledger entries.
 */
export type ConfirmActionRequest = {
  title: string;
  /** Plain-language description of what happens. */
  description?: string;
  /** Knock-on effects, one per line, e.g. "Returns 12 pcs to finished stock". */
  consequences?: string[];
  /** Label for the destructive button. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** false renders the "this cannot be undone" warning. Defaults to false. */
  reversible?: boolean;
  tone?: "danger" | "warning";
};

type ConfirmActionState = ConfirmActionRequest & { open: boolean };

type Listener = (state: ConfirmActionState) => void;

const listeners = new Set<Listener>();
let resolver: ((value: boolean) => void) | null = null;
let current: ConfirmActionState = { open: false, title: "" };

function emit(state: ConfirmActionState) {
  current = state;
  listeners.forEach((listener) => listener(state));
}

export function getConfirmActionState() {
  return current;
}

export function subscribeConfirmAction(listener: Listener) {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

/** Resolves true when the user confirms, false on cancel or dismiss. */
export function confirmAction(request: ConfirmActionRequest): Promise<boolean> {
  if (resolver) {
    resolver(false);
    resolver = null;
  }
  return new Promise((resolve) => {
    resolver = resolve;
    emit({ ...request, open: true });
  });
}

export function answerConfirmAction(value: boolean) {
  const resolve = resolver;
  resolver = null;
  emit({ ...current, open: false });
  resolve?.(value);
}
