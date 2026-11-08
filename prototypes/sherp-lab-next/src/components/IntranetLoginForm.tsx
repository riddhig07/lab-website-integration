"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function IntranetLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/intranet";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/intranet/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Incorrect password.");
      return;
    }
    router.push(from);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4">
      <div>
        <label htmlFor="password" className="text-sm text-zinc-400">
          Lab intranet password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none ring-teal-500/30 focus:ring-2"
          placeholder="Set INTRANET_PASSWORD on deploy"
          autoComplete="current-password"
        />
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-teal-500 px-4 py-3 text-sm font-semibold text-[#042f2e] transition hover:bg-teal-400 disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Enter intranet"}
      </button>
      <p className="text-center text-xs text-zinc-500">
        Local dev: leave env unset for open access.
      </p>
    </form>
  );
}
