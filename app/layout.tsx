import type { Metadata } from "next";
import "./globals.css";

import { SiteNav } from "@/app/components/site-nav";

export const metadata: Metadata = {
  title: "Reprise",
  description:
    "Slack moves messages. Reprise builds understanding — meet the people behind the pull requests.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <SiteNav />
        <main className="main-canvas flex-1 w-full max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
