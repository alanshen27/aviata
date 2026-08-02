"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls, Text } from "@react-three/drei";
import type { AircraftClass } from "@/lib/types";
import { FLEET, fleetForPersonnel, SelectableJet, type FleetOption } from "./PlaneMesh";

export function PlaneChooser({
  selected,
  onSelect,
  personnel,
  options,
}: {
  selected: AircraftClass | null;
  onSelect: (id: AircraftClass) => void;
  /** Party size — only jets with seats ≥ this are shown */
  personnel: number;
  options?: FleetOption[];
}) {
  const visible = useMemo(
    () => options ?? fleetForPersonnel(personnel),
    [options, personnel],
  );
  const spacing = visible.length > 4 ? 1.85 : 2.15;
  const start = -((Math.max(visible.length, 1) - 1) * spacing) / 2;

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

      {visible.map((opt, i) => (
        <group key={opt.id} position={[start + i * spacing, 0, 0]}>
          <SelectableJet
            option={opt}
            position={[0, 0, 0]}
            selected={selected === opt.id}
            onSelect={onSelect}
          />
          <Text
            position={[0, -1.05, 0]}
            fontSize={0.22}
            color={selected === opt.id ? "#f0c14b" : "#c9d6df"}
            anchorX="center"
            anchorY="middle"
          >
            {`${opt.seats} pax`}
          </Text>
          <Text
            position={[0, -1.32, 0]}
            fontSize={0.16}
            color="#8a9aa6"
            anchorX="center"
            anchorY="middle"
          >
            {opt.label}
          </Text>
        </group>
      ))}

      {visible.length === 0 && (
        <Text
          position={[0, 0.2, 0]}
          fontSize={0.28}
          color="#c9d6df"
          anchorX="center"
        >
          No jets fit this party size
        </Text>
      )}

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
