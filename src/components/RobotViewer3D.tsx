"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";

function UrvWaveshareModel() {
  return (
    <group rotation={[0, 0.4, 0]}>
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.56, 0.1, 0.34]} />
        <meshStandardMaterial color="#0f172a" metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0.22, 0.22, 0]} castShadow>
        <boxGeometry args={[0.12, 0.08, 0.1]} />
        <meshStandardMaterial color="#14b8a6" emissive="#0d9488" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[-0.05, 0.32, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.18, 12]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[-0.05, 0.42, 0]}>
        <boxGeometry args={[0.08, 0.05, 0.04]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {[
        [-0.2, 0.06, 0.14],
        [0.2, 0.06, 0.14],
        [-0.2, 0.06, -0.14],
        [0.2, 0.06, -0.14],
      ].map((pos) => (
        <mesh key={pos.join(",")} position={pos as [number, number, number]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.04, 16]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      ))}
    </group>
  );
}

export function RobotViewer3D() {
  return (
    <div className="h-72 w-full overflow-hidden rounded-2xl border border-teal-500/20 bg-[#05080f] sm:h-80">
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0.85, 0.55, 0.95]} fov={42} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 4, 2]} intensity={1.1} castShadow />
        <pointLight position={[-2, 1, -1]} intensity={0.35} color="#2dd4bf" />
        <UrvWaveshareModel />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[3, 3]} />
          <meshStandardMaterial color="#030712" />
        </mesh>
        <OrbitControls enablePan={false} minDistance={0.6} maxDistance={2.2} />
      </Canvas>
      <p className="pointer-events-none -mt-8 relative z-10 pb-2 text-center text-[10px] text-zinc-500">
        Drag to inspect · URV Waveshare-style CAD placeholder mesh
      </p>
    </div>
  );
}
