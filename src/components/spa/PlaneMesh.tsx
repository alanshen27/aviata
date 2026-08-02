"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AircraftClass } from "@/lib/types";

export interface FleetOption {
  id: AircraftClass;
  label: string;
  blurb: string;
  scale: number;
  color: string;
}

export const FLEET: FleetOption[] = [
  {
    id: "very_light",
    label: "Very light",
    blurb: "CJ2 / Phenom hops",
    scale: 0.72,
    color: "#8fd6c4",
  },
  {
    id: "light",
    label: "Light",
    blurb: "Citation / PC-24",
    scale: 0.88,
    color: "#c9d6df",
  },
  {
    id: "midsize",
    label: "Midsize",
    blurb: "Latitude / Lear",
    scale: 1,
    color: "#eef4f7",
  },
  {
    id: "super_midsize",
    label: "Super-mid",
    blurb: "Challenger 350",
    scale: 1.15,
    color: "#f0c14b",
  },
  {
    id: "heavy",
    label: "Heavy",
    blurb: "G450 / Challenger 605",
    scale: 1.35,
    color: "#d7a12e",
  },
  {
    id: "ultra_long_range",
    label: "Ultra long",
    blurb: "G650 / Global",
    scale: 1.55,
    color: "#ffd978",
  },
];

/** Low-poly business jet — fuselage, wings, tail, engines. */
export function JetModel({
  color,
  scale = 1,
  selected,
  hovered,
}: {
  color: string;
  scale?: number;
  selected?: boolean;
  hovered?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        metalness: 0.55,
        roughness: 0.28,
        emissive: selected || hovered ? color : "#000000",
        emissiveIntensity: selected ? 0.22 : hovered ? 0.12 : 0,
      }),
    [color, selected, hovered],
  );

  useFrame((_, dt) => {
    if (!group.current) return;
    const target = selected ? 0.35 : hovered ? 0.15 : 0;
    group.current.rotation.y += dt * (selected ? 0.9 : 0.25);
    group.current.position.y = THREE.MathUtils.lerp(
      group.current.position.y,
      target,
      0.08,
    );
  });

  const s = scale;
  return (
    <group ref={group} scale={s} rotation={[0.1, 0.4, 0]}>
      {/* fuselage */}
      <mesh material={mat} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.18, 1.35, 6, 16]} />
      </mesh>
      {/* nose taper cue */}
      <mesh material={mat} position={[0.85, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.16, 0.35, 12]} />
      </mesh>
      {/* wings */}
      <mesh material={mat} position={[0, -0.05, 0]} rotation={[0, 0, 0.05]}>
        <boxGeometry args={[0.55, 0.04, 2.1]} />
      </mesh>
      {/* winglet L/R */}
      <mesh material={mat} position={[0.05, 0.12, 1.0]}>
        <boxGeometry args={[0.08, 0.28, 0.04]} />
      </mesh>
      <mesh material={mat} position={[0.05, 0.12, -1.0]}>
        <boxGeometry args={[0.08, 0.28, 0.04]} />
      </mesh>
      {/* vertical stabilizer */}
      <mesh material={mat} position={[-0.7, 0.28, 0]}>
        <boxGeometry args={[0.35, 0.45, 0.05]} />
      </mesh>
      {/* engines */}
      <mesh material={mat} position={[-0.35, -0.05, 0.35]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, 0.45, 12]} />
      </mesh>
      <mesh material={mat} position={[-0.35, -0.05, -0.35]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, 0.45, 12]} />
      </mesh>
      {/* windows strip */}
      <mesh position={[0.1, 0.08, 0]}>
        <boxGeometry args={[0.7, 0.04, 0.22]} />
        <meshStandardMaterial
          color="#071018"
          emissive="#3ecfac"
          emissiveIntensity={selected ? 0.6 : 0.25}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}

export function SelectableJet({
  option,
  position,
  selected,
  onSelect,
}: {
  option: FleetOption;
  position: [number, number, number];
  selected: boolean;
  onSelect: (id: AircraftClass) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(option.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      <JetModel
        color={option.color}
        scale={option.scale * (selected ? 1.08 : 1)}
        selected={selected}
        hovered={hovered}
      />
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]}>
          <ringGeometry args={[0.55, 0.62, 48]} />
          <meshBasicMaterial color="#d7a12e" transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}
