import { NextRequest, NextResponse } from "next/server";

const GOOGLE_ITC = "ur-t-i0-und";

export async function GET(req: NextRequest) {
  const text = (req.nextUrl.searchParams.get("text") || "").trim();
  if (!text || text.length > 80) {
    return NextResponse.json({ suggestions: [] });
  }

  const url = new URL("https://inputtools.google.com/request");
  url.searchParams.set("text", text);
  url.searchParams.set("itc", GOOGLE_ITC);
  url.searchParams.set("num", "5");
  url.searchParams.set("cp", "0");
  url.searchParams.set("cs", "1");
  url.searchParams.set("ie", "utf-8");
  url.searchParams.set("oe", "utf-8");
  url.searchParams.set("app", "demopage");

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json({ suggestions: [] });
    }

    const data = (await res.json()) as unknown;
    const suggestions = parseSuggestions(data, text);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}

function parseSuggestions(data: unknown, fallback: string): string[] {
  if (!Array.isArray(data) || data[0] !== "SUCCESS") return [];
  const block = data[1];
  if (!Array.isArray(block) || !Array.isArray(block[0])) return [];
  const entry = block[0];
  const list = entry[1];
  if (!Array.isArray(list)) return [];
  const out = list.filter((s): s is string => typeof s === "string" && s.length > 0);
  if (out.length === 0) return [fallback];
  return out;
}
