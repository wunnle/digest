import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { META, ITEMS } from "./data";
import { Footer } from "./footer";
import "./globals.css";

/**
 * Inter, not a display face. The page is mostly other people's prose at 15px —
 * including code, URLs and prompt text — and a geometric display face is
 * tiring at that size and length.
 */
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" });

/**
 * The description is composed from payload values, so a refresh updates any
 * shared link along with the page. The title stays plain — the digest spans
 * a rolling 30 days, so no date range names it.
 */
export function generateMetadata(): Metadata {
  const description = `${ITEMS.length} posts from ${META.sourcesWithPosts} of ${META.sourcesScanned} sources. ${META.filter}`;
  return {
    title: { default: "Digest", template: "%s · Digest" },
    description,
    openGraph: { title: "Digest", description },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${mono.variable} h-full antialiased`}>
      {/* A column, so short pages still put the footer at the bottom. */}
      <body className="flex min-h-screen flex-col bg-neutral-950 font-sans">
        {children}
        <Footer />
      </body>
    </html>
  );
}
