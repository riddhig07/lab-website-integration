"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number };

function cubicPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

function drawRobot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  scale: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#0f172a";
  ctx.strokeStyle = "#2dd4bf";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-28, -18, 56, 36, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#14b8a6";
  ctx.beginPath();
  ctx.arc(18, 0, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#334155";
  for (const wx of [-16, 16]) {
    ctx.beginPath();
    ctx.arc(wx, 14, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function RobotHeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const path: [Point, Point, Point, Point] = [
      { x: -90, y: 130 },
      { x: 40, y: 55 },
      { x: 180, y: 95 },
      { x: 310, y: 68 },
    ];

    const target: Point = { x: 300, y: 55 };

    const loop = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      ctx.strokeStyle = "rgba(45, 212, 191, 0.25)";
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const p = cubicPoint(i / 40, ...path);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(251, 191, 36, 0.9)";
      ctx.beginPath();
      ctx.arc(target.x, target.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(251, 191, 36, 0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();

      const duration = 420;
      const t = Math.min(1, frame / duration);
      const pos = cubicPoint(t, ...path);
      const next = cubicPoint(Math.min(1, t + 0.02), ...path);
      const angle = Math.atan2(next.y - pos.y, next.x - pos.x);

      drawRobot(ctx, pos.x, pos.y, angle, 1);

      if (t >= 1) {
        ctx.fillStyle = "rgba(45, 212, 191, 0.15)";
        ctx.font = "600 13px system-ui, sans-serif";
        ctx.fillText("Object acquired", target.x - 46, target.y - 22);
      }

      frame += 1;
      if (frame > duration + 120) frame = 0;
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="h-48 w-full rounded-2xl border border-teal-500/20 bg-[#0a101a]/80 sm:h-56"
      aria-label="Animated UGV following a spline path toward a target object"
    />
  );
}
