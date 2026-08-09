export type VoiceRoute = {
  href: string;
  label: string;
  words: string[];
};

export const VOICE_ROUTES: VoiceRoute[] = [
  { href: "/dashboard", label: "Dashboard", words: ["dashboard", "home", "finance", "overview"] },
  {
    href: "/dashboard/today",
    label: "Voice Entry",
    words: ["voice", "voice entry", "mic", "microphone"],
  },
  {
    href: "/dashboard/inventory",
    label: "Inventory",
    words: ["inventory", "stock", "stocks"],
  },
  { href: "/dashboard/products", label: "Products", words: ["products", "product list"] },
  {
    href: "/dashboard/production",
    label: "Production",
    words: ["production", "productions", "factory production"],
  },
  {
    href: "/dashboard/production/new",
    label: "New production",
    words: [
      "new production",
      "add production",
      "create production",
      "produce",
      "reduce",
    ],
  },
  {
    href: "/dashboard/production/history",
    label: "Production history",
    words: ["production history", "production record", "production records"],
  },
  {
    href: "/dashboard/expenses",
    label: "Expenses",
    words: ["expenses", "expense", "kharcha"],
  },
  {
    href: "/dashboard/expenses/electricity",
    label: "Electricity expenses",
    words: ["electricity", "bijli", "power bill"],
  },
  {
    href: "/dashboard/expenses/taxes",
    label: "Taxes",
    words: ["taxes", "tax"],
  },
  {
    href: "/dashboard/expenses/salaries",
    label: "Salaries",
    words: ["salaries", "salary", "wages", "labour", "labor"],
  },
  {
    href: "/dashboard/expenses/other",
    label: "Other expenses",
    words: ["other expenses", "misc expenses"],
  },
  {
    href: "/dashboard/party",
    label: "Party",
    words: ["party", "parties", "customers", "customer list", "sales parties"],
  },
  {
    href: "/dashboard/party/groups",
    label: "Party groups",
    words: ["party groups", "groups"],
  },
  {
    href: "/dashboard/builty",
    label: "Builty",
    words: [
      "builty",
      "bilt",
      "bilti",
      "building",
      "builty page",
      "builty list",
      "sales list",
      "go to builty",
      "open builty",
      "show builty",
    ],
  },
  {
    href: "/dashboard/builty/new",
    label: "New builty",
    words: [
      "new builty",
      "create builty",
      "add builty",
      "make builty",
      "create building",
      "new building",
      "new sale",
      "create sale",
      "add sale",
    ],
  },
  {
    href: "/dashboard/builty/history",
    label: "Builty history",
    words: ["builty history", "sales history", "sale history"],
  },
  { href: "/dashboard/claims", label: "Claims", words: ["claims", "claim", "returns"] },
  {
    href: "/dashboard/suppliers",
    label: "Suppliers",
    words: ["suppliers", "supplier", "supplier list", "vendors", "vendor"],
  },
  {
    href: "/dashboard/salesmen",
    label: "Salesmen",
    words: ["salesmen", "salesman", "sales man"],
  },
  { href: "/dashboard/reports", label: "Reports", words: ["reports", "report"] },
  {
    href: "/dashboard/finance/party-margin",
    label: "Party margin",
    words: ["party margin"],
  },
  {
    href: "/dashboard/finance/monthly",
    label: "Monthly finance",
    words: ["monthly", "monthly finance"],
  },
];

export function matchVoiceRoute(text: string): VoiceRoute | null {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const ranked = VOICE_ROUTES.map((route) => {
    let best = 0;
    for (const word of route.words) {
      if (normalized === word) best = Math.max(best, 100);
      else if (normalized.endsWith(` ${word}`) || normalized.includes(` ${word} `)) {
        best = Math.max(best, 55 + word.length);
      } else if (normalized.includes(word)) best = Math.max(best, 40 + word.length);
    }
    return { route, best };
  })
    .filter((row) => row.best > 0)
    .sort((a, b) => b.best - a.best || b.route.words[0].length - a.route.words[0].length);

  return ranked[0]?.route || null;
}
