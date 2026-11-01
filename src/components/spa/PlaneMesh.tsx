"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export interface FleetClass {
  id: string;
  /** Feed category label (Limitless Sky RSS) */
  category: string;
  label: string;
  examples: string;
  seats: string;
  rangeNm: string;
  cruiseKt: number;
}

export const FLEET: FleetClass[] = [
  { id: "turboprop", category: "Turboprop", label: "Turboprop", examples: "PC-12, King Air 350", seats: "6–9", rangeNm: "1,500", cruiseKt: 280 },
  { id: "very_light", category: "Very Light", label: "Very light jet", examples: "Phenom 100, Citation M2", seats: "4–6", rangeNm: "1,200", cruiseKt: 380 },
  { id: "light", category: "Light", label: "Light jet", examples: "Phenom 300, CJ3, Learjet 40", seats: "6–8", rangeNm: "1,800", cruiseKt: 420 },
  { id: "midsize", category: "Midsize", label: "Midsize", examples: "Citation XLS, Learjet 60, Hawker 800", seats: "7–9", rangeNm: "2,200", cruiseKt: 440 },
  { id: "super_midsize", category: "Super Midsize", label: "Super-midsize", examples: "Challenger 300/350, Praetor 600", seats: "8–10", rangeNm: "3,200", cruiseKt: 460 },
  { id: "heavy", category: "Heavy", label: "Heavy", examples: "Falcon 2000, G450, Challenger 605", seats: "10–14", rangeNm: "4,000", cruiseKt: 470 },
  { id: "ultra_long_range", category: "Ultra Long Range", label: "Ultra long range", examples: "G650, Global 6000, Falcon 8X", seats: "13–16", rangeNm: "6,000+", cruiseKt: 480 },
];

export function classForCategory(category: string): FleetClass | null {
  const c = category.toLowerCase();
  return FLEET.find((f) => f.category.toLowerCase() === c) ?? null;
}

/**
 * "Jet" — Poly by Google, CC-BY 3.0, via poly.pizza/m/bgUY8zN2Bq9.
 * Shown on a turntable; scale hints at cabin class.
 */
export function JetModel({ scale = 1, spin = true }: { scale?: number; spin?: boolean }) {
  const { scene } = useGLTF("/models/jet.glb");
  const model = useMemo(() => {
    const m = scene.clone(true);
    m.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return m;
  }, [scene]);
  const ref = useRef<THREE.Group>(null);
  const s = useRef(scale);
  useFrame((_, dt) => {
    if (!ref.current) return;
    if (spin) ref.current.rotation.y += dt * 0.25;
    s.current = THREE.MathUtils.lerp(s.current, scale, 0.08);
    ref.current.scale.setScalar(s.current);
  });
  return (
    <group ref={ref} position={[0, -0.2, 0]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload("/models/jet.glb");
