"use client";

import dynamic from "next/dynamic";

const RobotViewer3D = dynamic(
  () => import("@/components/RobotViewer3D").then((m) => m.RobotViewer3D),
  {
    ssr: false,
    loading: () => <div className="h-72 animate-pulse rounded-2xl bg-white/5 sm:h-80" />,
  },
);

export function RobotViewer3DLoader() {
  return <RobotViewer3D />;
}
