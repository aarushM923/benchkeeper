import { redirect } from "next/navigation";
import { adminEnabled, isAdmin } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-lg border border-stone-200 bg-white p-6">
      <h1 className="text-xl font-semibold">Staff sign-in</h1>
      {adminEnabled() ? (
        <LoginForm />
      ) : (
        <p className="text-stone-600">
          Admin is disabled: set <code>ADMIN_PASSWORD</code> (8+ characters) to enable it.
        </p>
      )}
    </div>
  );
}
