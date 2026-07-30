type DuplicateConfirmState = {
  open: boolean;
  message: string;
};

type Listener = (state: DuplicateConfirmState) => void;

const listeners = new Set<Listener>();
let resolver: ((value: boolean) => void) | null = null;
let current: DuplicateConfirmState = { open: false, message: "" };

function emit(state: DuplicateConfirmState) {
  current = state;
  listeners.forEach((listener) => listener(state));
}

export function getDuplicateConfirmState() {
  return current;
}

export function subscribeDuplicateConfirm(listener: Listener) {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

export function openDuplicateConfirm(message: string): Promise<boolean> {
  if (resolver) {
    resolver(false);
    resolver = null;
  }

  return new Promise((resolve) => {
    resolver = resolve;
    emit({
      open: true,
      message:
        message || "Trying to create a duplicate entry on the same day.",
    });
  });
}

export function answerDuplicateConfirm(value: boolean) {
  const finish = resolver;
  resolver = null;
  emit({ open: false, message: "" });
  finish?.(value);
}
