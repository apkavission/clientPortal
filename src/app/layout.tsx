import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-sans-loaded", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono-loaded", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Apka Vission — Portal",
    template: "%s · Apka Vission",
  },
  description: "Project progress, requirements and requests for Apka Saathi clients.",

  /*
    Nothing here is ever indexed.

    Every page behind this layout is somebody's private project data. This is a
    belt-and-braces measure — the proxy already refuses a signed-out request —
    but a robots directive costs nothing and covers the case where a page is
    somehow served to a crawler anyway.
  */
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#080b11" },
  ],
};

/**
 * Applied before the first paint, or not at all.
 *
 * A theme chosen in JavaScript after hydration produces a visible flash of the
 * other one, and the flash is worst for the person who chose dark — they get a
 * white screen for a frame, at night, which is when they chose it.
 *
 * So it runs as a blocking inline script: read the stored choice, set the
 * attribute, done. Wrapped in try/catch because `localStorage` throws outright
 * in a private window in some browsers, and a theme preference is not worth a
 * blank page.
 *
 * `suppressHydrationWarning` on <html> is required and is not a shortcut — the
 * server cannot know the choice, so the attribute legitimately differs between
 * the server's HTML and the browser's DOM.
 */
const THEME_SCRIPT = `
try {
  var choice = localStorage.getItem("portal-theme");
  if (choice === "dark" || choice === "light") {
    document.documentElement.setAttribute("data-theme", choice);
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-text">{children}</body>
    </html>
  );
}
