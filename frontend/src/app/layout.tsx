import type { Metadata } from "next";
import { Big_Shoulders, IBM_Plex_Sans, IBM_Plex_Mono, Noto_Nastaliq_Urdu } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const notoNastaliq = Noto_Nastaliq_Urdu({
  variable: "--font-urdu",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Khan Engineerings",
  description: "Factory operations & management system",
};

const THEME_INIT_SCRIPT = `
(function () {
  try {
    if (!localStorage.getItem("ke-theme-light-default")) {
      localStorage.setItem("ke-theme", "light");
      localStorage.setItem("ke-theme-light-default", "1");
    }
    var stored = localStorage.getItem("ke-theme");
    var theme = stored === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");

    var locale = localStorage.getItem("ke-locale") === "ur" ? "ur" : "en";
    document.documentElement.lang = locale === "ur" ? "ur" : "en";
    document.documentElement.dir = locale === "ur" ? "rtl" : "ltr";
    document.documentElement.classList.toggle("locale-ur", locale === "ur");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${bigShoulders.variable} ${plexSans.variable} ${plexMono.variable} ${notoNastaliq.variable} antialiased`}
      >
        <AppProviders>
          <TooltipProvider delay={200}>{children}</TooltipProvider>
          <Toaster />
        </AppProviders>
      </body>
    </html>
  );
}
