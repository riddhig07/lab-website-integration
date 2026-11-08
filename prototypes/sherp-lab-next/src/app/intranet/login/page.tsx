import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IntranetLoginForm } from "@/components/IntranetLoginForm";
import {
  hasIntranetSession,
  intranetPasswordConfigured,
} from "@/lib/intranet-auth";

export default async function IntranetLoginPage() {
  if (!intranetPasswordConfigured()) {
    redirect("/intranet");
  }

  if (await hasIntranetSession()) {
    redirect("/intranet");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="font-display text-2xl font-bold text-white">Lab intranet</h1>
        <p className="mt-2 text-sm text-zinc-500">
          SOPs, literature reviews, meeting notes, and project tracking.
        </p>
        <div className="mt-8">
          <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
            <IntranetLoginForm />
          </Suspense>
        </div>
        <Link href="/" className="mt-8 block text-center text-sm text-zinc-500 hover:text-teal-300">
          Back to public site
        </Link>
      </div>
    </div>
  );
}
