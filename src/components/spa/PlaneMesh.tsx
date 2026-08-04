"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AircraftClass } from "@/lib/types";

export interface FleetOption {
  id: AircraftClass;
  label: string;
  blurb: string;
  /** Typical passenger / personnel capacity */
  seats: number;
  scale: number;
  color: string;
}

/** Stepped party sizes for the fleet filter. */
export const PERSONNEL_OPTIONS = [2, 4, 6, 8, 10, 12, 14, 16] as const;

export const FLEET: FleetOption[] = [
  {
    id: "very_light",
    label: "Very light",
    blurb: "CJ2 hops",
    seats: 6,
    scale: 0.72,
    color: "#e8e9eb",
  },
  {
    id: "light",
    label: "Light",
    blurb: "Citation / PC-24",
    seats: 8,
    scale: 0.88,
    color: "#eceded",
  },
  {
    id: "midsize",
    label: "Midsize",
    blurb: "Latitude / Lear",
    seats: 9,
    scale: 1,
    color: "#f1f1f2",
  },
  {
    id: "super_midsize",
    label: "Super-mid",
    blurb: "Challenger 350",
    seats: 10,
    scale: 1.15,
    color: "#f4f3f0",
  },
  {
    id: "heavy",
    label: "Heavy",
    blurb: "G450 / CL605",
    seats: 14,
    scale: 1.35,
    color: "#f6f5f1",
  },
  {
    id: "ultra_long_range",
    label: "Ultra long",
    blurb: "G650 / Global",
    seats: 16,
    scale: 1.55,
    color: "#f8f7f3",
  },
];

export function fleetForPersonnel(personnel: number): FleetOption[] {
  return FLEET.filter((f) => f.seats >= personnel);
}

/** Fuselage profile: (station along length 0..1, radius multiplier). */
const FUSELAGE_PROFILE: [number, number][] = [
  [0.0, 0.001],
  [0.015, 0.28],
  [0.05, 0.58],
  [0.1, 0.82],
  [0.17, 0.96],
  [0.26, 1.0],
  [0.62, 1.0],
  [0.74, 0.92],
  [0.84, 0.72],
  [0.92, 0.45],
  [0.985, 0.16],
  [1.0, 0.05],
];

function fuselageGeometry(length: number, radius: number) {
  const pts = FUSELAGE_PROFILE.map(
    ([t, r]) => new THREE.Vector2(Math.max(r * radius, 0.001), t * length),
  );
  const geo = new THREE.LatheGeometry(pts, 40);
  // Lathe builds along +Y; lay it down along +X (nose at +X).
  geo.rotateZ(-Math.PI / 2);
  geo.translate(-length / 2, 0, 0);
  geo.rotateY(Math.PI);
  return geo;
}

/** Swept, tapered wing planform (drawn in the XY plane, extruded in Z). */
function wingGeometry({
  span,
  rootChord,
  tipChord,
  sweep,
  thickness,
}: {
  span: number;
  rootChord: number;
  tipChord: number;
  sweep: number;
  thickness: number;
}) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-sweep, span);
  shape.lineTo(-sweep - tipChord, span);
  shape.lineTo(-rootChord, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.35,
    bevelSize: thickness * 0.35,
    bevelSegments: 2,
  });
  // Lay the planform flat: chord along X, span along +Z, thickness along Y.
  geo.rotateX(Math.PI / 2);
  return geo;
}

function EngineNacelle({
  material,
  position,
  mirror,
}: {
  material: THREE.Material;
  position: [number, number, number];
  mirror?: boolean;
}) {
  return (
    <group position={position} scale={[1, 1, mirror ? -1 : 1]}>
      {/* pylon */}
      <mesh material={material} position={[0.02, 0.02, -0.09]}>
        <boxGeometry args={[0.22, 0.1, 0.14]} />
      </mesh>
      {/* nacelle body */}
      <mesh material={material} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.085, 0.1, 0.42, 20]} />
      </mesh>
      {/* intake lip */}
      <mesh position={[0.21, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.09, 0.018, 10, 24]} />
        <meshStandardMaterial color="#6b7280" metalness={0.9} roughness={0.25} />
      </mesh>
      {/* fan face */}
      <mesh position={[0.2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <circleGeometry args={[0.08, 20]} />
        <meshStandardMaterial color="#14181d" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* exhaust cone */}
      <mesh position={[-0.25, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.055, 0.14, 16]} />
        <meshStandardMaterial color="#3a4048" metalness={0.85} roughness={0.35} />
      </mesh>
    </group>
  );
}

/**
 * Business jet with a lathed fuselage, swept wings and winglets,
 * rear-mounted engines and a T-tail — proportions modeled on a
 * super-midsize corporate jet.
 */
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

  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        metalness: 0.4,
        roughness: 0.22,
        emissive: selected || hovered ? "#c8a860" : "#000000",
        emissiveIntensity: selected ? 0.08 : hovered ? 0.04 : 0,
      }),
    [color, selected, hovered],
  );

  const accentMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#b9bec5",
        metalness: 0.75,
        roughness: 0.25,
      }),
    [],
  );

  const fuselage = useMemo(() => fuselageGeometry(2.4, 0.21), []);
  const wing = useMemo(
    () =>
      wingGeometry({
        span: 1.05,
        rootChord: 0.62,
        tipChord: 0.17,
        sweep: 0.42,
        thickness: 0.028,
      }),
    [],
  );
  const hStab = useMemo(
    () =>
      wingGeometry({
        span: 0.42,
        rootChord: 0.3,
        tipChord: 0.12,
        sweep: 0.2,
        thickness: 0.02,
      }),
    [],
  );
  const winglet = useMemo(
    () =>
      wingGeometry({
        span: 0.22,
        rootChord: 0.17,
        tipChord: 0.07,
        sweep: 0.1,
        thickness: 0.016,
      }).rotateX(-Math.PI / 2),
    [],
  );
  const fin = useMemo(
    () =>
      wingGeometry({
        span: 0.52,
        rootChord: 0.52,
        tipChord: 0.24,
        sweep: 0.34,
        thickness: 0.03,
      }).rotateX(-Math.PI / 2),
    [],
  );

  useFrame((_, dt) => {
    if (!group.current) return;
    const target = selected ? 0.35 : hovered ? 0.15 : 0;
    group.current.rotation.y += dt * (selected ? 0.55 : 0.18);
    group.current.position.y = THREE.MathUtils.lerp(
      group.current.position.y,
      target,
      0.08,
    );
  });

  return (
    <group ref={group} scale={scale} rotation={[0.08, 0.5, 0]}>
      {/* fuselage — nose toward +X */}
      <mesh geometry={fuselage} material={bodyMat} />

      {/* cockpit windshield */}
      <mesh position={[0.83, 0.08, 0]} scale={[0.8, 0.45, 1.02]}>
        <sphereGeometry args={[0.15, 20, 14]} />
        <meshStandardMaterial color="#0d1218" metalness={0.9} roughness={0.08} />
      </mesh>

      {/* cabin window strips */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[0.22, 0.06, side * 0.195]}>
          <boxGeometry args={[0.95, 0.045, 0.012]} />
          <meshStandardMaterial
            color="#0b1016"
            emissive="#d9c187"
            emissiveIntensity={selected ? 0.5 : 0.18}
            metalness={0.7}
            roughness={0.25}
          />
        </mesh>
      ))}

      {/* wings — low-mounted, slight dihedral, swept back */}
      {[1, -1].map((side) => (
        <group
          key={side}
          position={[0.42, -0.14, 0]}
          rotation={[side * -0.09, 0, 0]}
          scale={[1, 1, side]}
        >
          <mesh geometry={wing} material={bodyMat} />
          {/* winglet — upturned tip */}
          <mesh
            geometry={winglet}
            material={bodyMat}
            position={[-0.44, 0, 1.03]}
            rotation={[-0.35, 0, 0]}
          />
        </group>
      ))}

      {/* wing-to-body fairing */}
      <mesh material={bodyMat} position={[0.12, -0.12, 0]} scale={[2.2, 0.5, 1]}>
        <sphereGeometry args={[0.16, 20, 14]} />
      </mesh>

      {/* rear-mounted engines */}
      <EngineNacelle material={accentMat} position={[-0.62, 0.08, 0.31]} />
      <EngineNacelle material={accentMat} position={[-0.62, 0.08, -0.31]} mirror />

      {/* vertical fin */}
      <mesh geometry={fin} material={bodyMat} position={[-0.86, 0.1, -0.015]} />

      {/* T-tail horizontal stabilizer */}
      {[1, -1].map((side) => (
        <mesh
          key={side}
          geometry={hStab}
          material={bodyMat}
          position={[-1.16, 0.6, 0]}
          scale={[1, 1, side]}
        />
      ))}
      {/* tail bullet fairing */}
      <mesh material={accentMat} position={[-1.28, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.035, 0.3, 4, 10]} />
      </mesh>

      {/* gold cheatline */}
      <mesh position={[0.32, -0.045, 0]}>
        <cylinderGeometry args={[0.212, 0.212, 0.016, 32, 1, true]} />
        <meshStandardMaterial
          color="#c8a860"
          metalness={0.85}
          roughness={0.3}
          side={THREE.DoubleSide}
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
          <ringGeometry args={[0.55, 0.58, 64]} />
          <meshBasicMaterial color="#c8a860" transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}
