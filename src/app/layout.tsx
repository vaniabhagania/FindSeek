import type { Metadata, Viewport } from "next";
import "./globals.css";

const DESCRIPTION = "Verified jobs and internships across India, matched to you, with a CV tailored to each one.";

export const metadata: Metadata = {
  title: { default: "FindSeek", template: "%s · FindSeek" },
  description: DESCRIPTION,
  openGraph: { title: "FindSeek", description: DESCRIPTION, siteName: "FindSeek", locale: "en_IN", type: "website" },
  twitter: { card: "summary", title: "FindSeek", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d14" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a href="#main" className="btn sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
