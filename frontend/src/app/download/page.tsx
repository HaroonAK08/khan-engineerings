import type { Metadata } from "next";
import Link from "next/link";
import { Download, Monitor } from "lucide-react";
import { CornerFrame } from "@/components/layout/corner-frame";
import {
  DESKTOP_LINUX_URL,
  DESKTOP_RELEASES_URL,
  DESKTOP_WINDOWS_URL,
} from "@/lib/desktop-download";

export const metadata: Metadata = {
  title: "Download | Khan Engineerings",
};

export default function DownloadPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <CornerFrame className="w-full max-w-lg">
        <div className="border border-border bg-card p-8 shadow-sm">
          <p className="font-data text-[10px] tracking-[0.2em] text-muted-foreground">
            KHAN ENGINEERINGS
          </p>
          <h1 className="text-nameplate mt-3 text-3xl leading-none">
            Download
            <br />
            desktop app
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Install on one office PC. After the first setup it works without internet.
            Your existing factory data is copied onto that computer. The website is
            not deleted.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <a
              href={DESKTOP_WINDOWS_URL}
              className="inline-flex items-center justify-center gap-2 bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            >
              <Download className="size-4" />
              Download for Windows
            </a>
            <a
              href={DESKTOP_LINUX_URL}
              className="inline-flex items-center justify-center gap-2 border border-border px-4 py-3 text-sm"
            >
              <Monitor className="size-4" />
              Download for Linux
            </a>
            <a
              href={DESKTOP_RELEASES_URL}
              className="text-center text-xs text-muted-foreground underline"
            >
              All versions on GitHub
            </a>
          </div>

          <ol className="mt-8 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Download and run the installer.</li>
            <li>Open <strong>Khan Engineerings</strong> from the desktop shortcut.</li>
            <li>Sign in with the same code you use on the website.</li>
          </ol>

          <p className="mt-6 text-xs text-muted-foreground">
            The first Windows installer is published from GitHub Releases after a
            desktop build. If a download 404s, open{" "}
            <a className="underline" href={DESKTOP_RELEASES_URL}>
              latest releases
            </a>
            .
          </p>

          <Link href="/" className="mt-6 inline-block text-xs underline">
            Back to login
          </Link>
        </div>
      </CornerFrame>
    </div>
  );
}
