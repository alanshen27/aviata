"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import type { AircraftClass } from "@/lib/types";
import { fleetForPersonnel, SelectableJet, type FleetOption } from "./PlaneMesh";

export function PlaneChooser({
  selected,
  onSelect,
  personnel,
  options,
  active = true,
}: {
  selected: AircraftClass | null;
  onSelect: (id: AircraftClass) => void;
  /** Party size — only jets with seats ≥ this are shown */
  personnel: number;
  options?: FleetOption[];
  /** Pauses the render loop when the scene is hidden. */
  active?: boolean;
}) {
  const visible = useMemo(
    () => options ?? fleetForPersonnel(personnel),
    [options, personnel],
  );
  const spacing = visible.length > 4 ? 1.85 : 2.15;
  const start = -((Math.max(visible.length, 1) - 1) * spacing) / 2;

  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 1.6, 7.5], fov: 40 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#0b0e13"]} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={["#f2f1ec", "#12161d", 0.6]} />
      <spotLight
        position={[4, 8, 4]}
        intensity={2.6}
        angle={0.45}
        penumbra={0.6}
        color="#fff4d8"
      />
      <directionalLight position={[-4, 2, -2]} intensity={0.55} color="#9aa8b8" />
      <pointLight position={[0, 2, 3]} intensity={0.5} color="#c8a860" />

      {visible.map((opt, i) => (
        <group key={opt.id} position={[start + i * spacing, 0, 0]}>
          <SelectableJet
            option={opt}
            position={[0, 0, 0]}
            selected={selected === opt.id}
            onSelect={onSelect}
          />
        </group>
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

export { FLEET, fleetForPersonnel, PERSONNEL_OPTIONS } from "./PlaneMesh";
