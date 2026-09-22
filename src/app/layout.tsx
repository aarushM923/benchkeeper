import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "BenchKeeper — Van Cortlandt Park",
  description: "Browse and adopt benches in Van Cortlandt Park.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-baseline gap-3 px-4 py-4">
            <Link href="/benches" className="text-lg font-semibold text-green-800">
              BenchKeeper
            </Link>
            <span className="hidden text-sm text-stone-500 sm:inline">
              Van Cortlandt Park bench adoption
            </span>
            <nav className="ml-auto flex gap-4 text-sm">
              <Link href="/benches" className="text-stone-700 hover:underline">
                Benches
              </Link>
              <Link href="/map" className="text-stone-700 hover:underline">
                Map
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
