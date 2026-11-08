"use client";

import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useEffect, useRef } from "react";

/** Bench run: lateral error (cm) vs time (s) — replace with live telemetry later. */
function sampleSeries() {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let t = 0; t <= 120; t += 1) {
    xs.push(t);
    ys.push(8 + 6 * Math.sin(t / 9) + (Math.random() - 0.5) * 2);
  }
  return [xs, ys] as uPlot.AlignedData;
}

export function TelemetryChart({ title = "Trajectory lateral error" }: { title?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const opts: uPlot.Options = {
      width: hostRef.current.clientWidth,
      height: 220,
      series: [
        {},
        {
          label: "error (cm)",
          stroke: "#2dd4bf",
          width: 2,
        },
      ],
      axes: [
        { label: "time (s)" },
        { label: "cm" },
      ],
      scales: {
        x: { time: false },
      },
    };

    plotRef.current = new uPlot(opts, sampleSeries(), hostRef.current);

    const onResize = () => {
      if (plotRef.current && hostRef.current) {
        plotRef.current.setSize({
          width: hostRef.current.clientWidth,
          height: 220,
        });
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-white/8 bg-[#05080f] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <div ref={hostRef} className="mt-3 w-full uplot-teal" />
    </div>
  );
}
