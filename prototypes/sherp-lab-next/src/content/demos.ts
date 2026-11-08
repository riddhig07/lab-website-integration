export type DemoVideo = {
  id: string;
  title: string;
  description: string;
  /** Place MP4/WebM in public/videos/ or set NEXT_PUBLIC_* URL */
  src: string;
  poster?: string;
};

export const demoVideos: DemoVideo[] = [
  {
    id: "sim-stack",
    title: "Simulator stack walkthrough",
    description: "Scene randomization, policy hooks, and sim-to-real export pipeline.",
    src: "/videos/sim-stack.mp4",
    poster: "/videos/posters/sim-stack.svg",
  },
  {
    id: "sensor-fusion",
    title: "Live sensor readings",
    description: "Depth + IMU overlay during bench traversal (recorded run).",
    src: "/videos/sensor-readings.mp4",
    poster: "/videos/posters/sensor-readings.svg",
  },
  {
    id: "analysis",
    title: "Data analysis notebook export",
    description: "Trajectory error and success rate plots from a benchmark session.",
    src: "/videos/data-analysis.mp4",
    poster: "/videos/posters/data-analysis.svg",
  },
];
