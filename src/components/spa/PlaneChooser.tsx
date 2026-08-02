"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import type { AircraftClass } from "@/lib/types";
import { FLEET, SelectableJet } from "./PlaneMesh";

export function PlaneChooser({
  selected,
  onSelect,
}: {
  selected: AircraftClass | null;
  onSelect: (id: AircraftClass) => void;
}) {
  const spacing = 2.15;
  const start = -((FLEET.length - 1) * spacing) / 2;

  return (
    <Canvas
      camera={{ position: [0, 1.6, 7.5], fov: 40 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#071018"]} />
      <ambientLight intensity={0.5} />
      <spotLight
        position={[4, 8, 4]}
        intensity={2.2}
        angle={0.45}
        penumbra={0.6}
        color="#fff4d8"
      />
      <directionalLight position={[-4, 2, -2]} intensity={0.55} color="#3ecfac" />
      <pointLight position={[0, 2, 3]} intensity={0.6} color="#f0c14b" />

      {FLEET.map((opt, i) => (
        <SelectableJet
          key={opt.id}
          option={opt}
          position={[start + i * spacing, 0, 0]}
          selected={selected === opt.id}
          onSelect={onSelect}
        />
      ))}

      <ContactShadows
        position={[0, -0.7, 0]}
        opacity={0.45}
        scale={28}
        blur={2.4}
        far={4}
      />
      <OrbitControls
        enablePan={false}
        minPolarAngle={Math.PI / 3.2}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={5}
        maxDistance={12}
        target={[0, 0.1, 0]}
      />
    </Canvas>
  );
}

export { FLEET };
