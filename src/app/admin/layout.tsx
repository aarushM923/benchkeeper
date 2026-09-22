import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { logout } from "./actions";

export const metadata: Metadata = {
  title: "Admin — BenchKeeper",
  robots: { index: false, follow: false },
};

// NOTE: this layout only decides whether to show the nav. It is NOT the auth
// check — every admin page and action calls requireAdmin() itself.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const signedIn = await isAdmin();
  return (
    <div className="space-y-6">
      {signedIn && (
        <nav className="flex flex-wrap items-center gap-4 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm">
          <span className="font-semibold text-stone-500">Admin</span>
          <Link href="/admin" className="underline">Adoptions</Link>
          <Link href="/admin/benches" className="underline">Benches</Link>
          <form action={logout} className="ml-auto">
            <button className="text-stone-600 underline">Log out</button>
          </form>
        </nav>
      )}
      {children}
    </div>
  );
}
