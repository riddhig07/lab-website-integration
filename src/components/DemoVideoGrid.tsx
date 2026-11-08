"use client";

import { demoVideos } from "@/content/demos";

export function DemoVideoGrid() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {demoVideos.map((video) => (
        <figure
          key={video.id}
          className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]"
        >
          <video
            className="aspect-video w-full bg-black object-cover"
            controls
            preload="none"
            poster={video.poster}
            playsInline
          >
            <source src={video.src} type="video/mp4" />
          </video>
          <figcaption className="p-4">
            <h3 className="font-display text-sm font-semibold text-zinc-100">{video.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">{video.description}</p>
            <p className="mt-2 text-[10px] text-zinc-600">
              Drop file at <code className="text-teal-300/80">{video.src}</code>
            </p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
