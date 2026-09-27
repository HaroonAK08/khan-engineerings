import { type NextRequest, NextResponse } from "next/server";

const backend = (process.env.BACKEND_URL || "http://127.0.0.1:5050").replace(/\/$/, "");

async function proxy(req: NextRequest, pathSegments: string[]) {
  const incoming = new URL(req.url);
  const target = `${backend}/api/${pathSegments.join("/")}${incoming.search}`;
  const headers = new Headers();
  const auth = req.headers.get("authorization");
  const contentType = req.headers.get("content-type");
  const cookie = req.headers.get("cookie");
  if (auth) headers.set("authorization", auth);
  if (contentType) headers.set("content-type", contentType);
  if (cookie) headers.set("cookie", cookie);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json(
      {
        message:
          "Backend API is not reachable. Start it with: cd backend && npm run dev",
      },
      { status: 502 }
    );
  }

  const outHeaders = new Headers();
  const pass = ["content-type", "set-cookie"];
  for (const key of pass) {
    const value = upstream.headers.get(key);
    if (value) outHeaders.set(key, value);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
