"use client";

import { useEffect, useState } from "react";

type Reservation = { id: string; asset: string; when: string; who: string };
type InventoryItem = { id: string; name: string; qty: number; note: string };
type MaintenanceLog = { id: string; asset: string; note: string; date: string };

const KEY = "sherp-lab-ops";

type OpsState = {
  reservations: Reservation[];
  inventory: InventoryItem[];
  maintenance: MaintenanceLog[];
};

const DEFAULT: OpsState = {
  reservations: [
    { id: "1", asset: "URV Waveshare bench", when: "2026-10-18 14:00", who: "Platform team" },
  ],
  inventory: [
    { id: "1", name: "Orin Nano kits", qty: 2, note: "Both checked out this week" },
    { id: "2", name: "Depth cameras", qty: 4, note: "Log in Drive inventory sheet" },
    { id: "3", name: "Benchmark object set v1", qty: 1, note: "Staged in bay B" },
  ],
  maintenance: [
    { id: "1", asset: "JetRacer #2", note: "Left front tire wear — rotate before demo", date: "2026-10-12" },
  ],
};

export function LabOpsPanel() {
  const [state, setState] = useState<OpsState>(DEFAULT);
  const [resForm, setResForm] = useState({ asset: "", when: "", who: "" });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState(JSON.parse(raw) as OpsState);
    } catch {
      /* defaults */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  function addReservation(e: React.FormEvent) {
    e.preventDefault();
    if (!resForm.asset || !resForm.when) return;
    setState((s) => ({
      ...s,
      reservations: [
        ...s.reservations,
        { id: String(Date.now()), ...resForm, who: resForm.who || "Member" },
      ],
    }));
    setResForm({ asset: "", when: "", who: "" });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
        <h2 className="font-display font-semibold text-zinc-100">Equipment reservations</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Embed Google Calendar on deploy — this board mirrors upcoming checkouts.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {state.reservations.map((r) => (
            <li key={r.id} className="rounded-lg border border-white/6 px-3 py-2 text-zinc-400">
              <span className="text-zinc-200">{r.asset}</span> · {r.when} · {r.who}
            </li>
          ))}
        </ul>
        <form onSubmit={addReservation} className="mt-4 grid gap-2 sm:grid-cols-3">
          <input
            placeholder="Asset"
            value={resForm.asset}
            onChange={(e) => setResForm((f) => ({ ...f, asset: e.target.value }))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
          />
          <input
            placeholder="When"
            value={resForm.when}
            onChange={(e) => setResForm((f) => ({ ...f, when: e.target.value }))}
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-lg bg-teal-500/90 text-sm font-semibold text-[#042f2e]">
            Reserve
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
        <h2 className="font-display font-semibold text-zinc-100">Inventory</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {state.inventory.map((item) => (
            <li key={item.id} className="flex justify-between gap-2 rounded-lg border border-white/6 px-3 py-2">
              <span className="text-zinc-200">{item.name}</span>
              <span className="text-teal-300">×{item.qty}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-600">{state.inventory[0]?.note}</p>
      </section>

      <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 lg:col-span-2">
        <h2 className="font-display font-semibold text-zinc-100">Maintenance log</h2>
        <ul className="mt-4 space-y-2 text-sm text-zinc-400">
          {state.maintenance.map((m) => (
            <li key={m.id}>
              <time className="text-zinc-500">{m.date}</time> — {m.asset}: {m.note}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
