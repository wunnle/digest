import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { META, ITEMS } from "./data";
import "./globals.css";

/**
 * Inter, not a display face. The page is mostly other people's prose at 15px —
 * including code, URLs and prompt text — and a geometric display face is
 * tiring at that size and length.
 */
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" });

/**
 * Composed from payload values, so a refresh that changes the window updates
 * the tab and any shared link along with the page.
 */
export function generateMetadata(): Metadata {
  const title = `${META.window.start.slice(0, 10)} – ${META.window.end.slice(0, 10)}`;
  const description = `${ITEMS.length} posts from ${META.sourcesWithPosts} of ${META.sourcesScanned} sources. ${META.filter}`;
  return { title, description, openGraph: { title, description } };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full bg-neutral-950 font-sans">{children}</body>
    </html>
  );
}
