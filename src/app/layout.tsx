import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FindSeek",
  description: "Find the right jobs, send a CV tailored to each one, and spend your time preparing for interviews.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
