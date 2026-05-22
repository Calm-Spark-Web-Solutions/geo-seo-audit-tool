import { redirect } from "next/navigation";

/**
 * Root route — the app lives at /dashboard (authenticated).
 * Unauthenticated visitors land here and are sent straight to login.
 * The public marketing site lives at ranklume.com (separate project).
 */
export default function RootPage() {
  redirect("/login");
}
