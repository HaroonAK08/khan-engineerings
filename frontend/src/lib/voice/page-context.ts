export type VoicePageContext =
  | "produce"
  | "builty"
  | "expense"
  | "salary"
  | "supplier"
  | "salesman"
  | null;

export function pageContextFromPath(pathname: string | null): VoicePageContext {
  if (!pathname) return null;
  if (
    pathname === "/dashboard/production" ||
    pathname.startsWith("/dashboard/production/")
  ) {
    return "produce";
  }
  if (
    pathname === "/dashboard/builty" ||
    pathname.startsWith("/dashboard/builty/")
  ) {
    return "builty";
  }
  if (
    pathname === "/dashboard/expenses/salaries" ||
    pathname.startsWith("/dashboard/expenses/salaries")
  ) {
    return "salary";
  }
  if (
    pathname === "/dashboard/expenses" ||
    pathname.startsWith("/dashboard/expenses/")
  ) {
    return "expense";
  }
  if (
    pathname === "/dashboard/suppliers" ||
    pathname.startsWith("/dashboard/suppliers/")
  ) {
    return "supplier";
  }
  if (
    pathname === "/dashboard/salesmen" ||
    pathname.startsWith("/dashboard/salesmen/")
  ) {
    return "salesman";
  }
  return null;
}

/** Default expense category when speaking on a specific expense sub-page. */
export function expenseCategoryFromPath(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  if (pathname.includes("/electricity")) return "electricity";
  if (pathname.includes("/taxes")) return "taxes";
  if (pathname.includes("/other")) return "other";
  return undefined;
}

export function voiceTipForContext(ctx: VoicePageContext): string {
  switch (ctx) {
    case "produce":
      return "Speak naturally — products, qty, hub/drum. Tap mic off to apply.";
    case "builty":
      return "Speak naturally — add products, rate 200, fixed rate 9800, set date, builty number.";
    case "expense":
      return "Tap mic, say an amount, tap mic again to add the expense.";
    case "salary":
      return "Say “pay Ali 5000” or “add 10000 to Abbas painter” — opens Pay now with amount.";
    case "supplier":
      return "Tap mic, say the supplier name, tap mic again to add.";
    case "salesman":
      return "Tap mic, say the salesman name, tap mic again to add.";
    default:
      return "Tap mic to speak, tap again to stop and apply. Enter does nothing.";
  }
}

export function isSessionPath(pathname: string | null) {
  if (!pathname) return false;
  return Boolean(pageContextFromPath(pathname));
}
