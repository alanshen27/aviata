"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import type { EmptyLegCandidate } from "@/lib/types";
import { arcPoints, latLonToVec3, legsToArcs } from "./geo";

function GridSphere({ radius = 1.6 }: { radius?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(radius, 48, 32);
    return g;
  }, [radius]);

  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial
          color="#0c1c28"
          roughness={0.92}
          metalness={0.15}
        />
      </mesh>
      <mesh geometry={geo} scale={1.002}>
        <meshBasicMaterial
          color="#3ecfac"
          wireframe
          transparent
          opacity={0.07}
        />
      </mesh>
      {/* atmosphere */}
      <mesh scale={1.08}>
        <sphereGeometry args={[radius, 48, 32]} />
        <meshBasicMaterial
          color="#d7a12e"
          transparent
          opacity={0.045}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}

function LatLonGrid({ radius = 1.605 }: { radius?: number }) {
  const lines = useMemo(() => {
    const group: THREE.Vector3[][] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const ring: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 6) {
        const p = latLonToVec3(lat, lon, radius);
        ring.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      group.push(ring);
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const meridian: THREE.Vector3[] = [];
      for (let lat = -80; lat <= 80; lat += 4) {
        const p = latLonToVec3(lat, lon, radius);
        meridian.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      group.push(meridian);
    }
    return group;
  }, [radius]);

  return (
    <group>
      {lines.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="#c9d6df"
          transparent
          opacity={0.12}
          lineWidth={1}
        />
      ))}
    </group>
  );
}

function RouteArc({
  lat1,
  lon1,
  lat2,
  lon2,
  confidence,
  active,
}: {
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
  confidence: number;
  active: boolean;
}) {
  const curve = useMemo(() => {
    const pts = arcPoints(lat1, lon1, lat2, lon2, 56, 1.6, 0.12 + confidence * 0.08);
    return new THREE.CatmullRomCurve3(
      pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    );
  }, [lat1, lon1, lat2, lon2, confidence]);

  const geo = useMemo(
    () => new THREE.TubeGeometry(curve, 64, active ? 0.012 : 0.006, 6, false),
    [curve, active],
  );

  return (
    <mesh geometry={geo}>
      <meshBasicMaterial
        color={active ? "#f0c14b" : "#3ecfac"}
        transparent
        opacity={active ? 0.95 : 0.35 + confidence * 0.4}
      />
    </mesh>
  );
}

function AirportDot({
  lat,
  lon,
  active,
}: {
  lat: number;
  lon: number;
  active?: boolean;
}) {
  const p = latLonToVec3(lat, lon, 1.62);
  return (
    <mesh position={[p.x, p.y, p.z]}>
      <sphereGeometry args={[active ? 0.028 : 0.016, 12, 12]} />
      <meshBasicMaterial color={active ? "#f0c14b" : "#eef4f7"} />
    </mesh>
  );
}

function SpinningEarth({
  legs,
  selectedClass,
}: {
  legs: EmptyLegCandidate[];
  selectedClass?: string | null;
}) {
  const group = useRef<THREE.Group>(null);
  const arcs = useMemo(() => legsToArcs(legs, 14), [legs]);

  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.08;
  });

  return (
    <group ref={group} rotation={[0.25, -0.6, 0]}>
      <GridSphere />
      <LatLonGrid />
      {arcs.map((arc) => {
        const active =
          !selectedClass || arc.aircraftClass === selectedClass;
        return (
          <group key={arc.id}>
            <RouteArc
              lat1={arc.origin.lat}
              lon1={arc.origin.lon}
              lat2={arc.destination.lat}
              lon2={arc.destination.lon}
              confidence={arc.confidence}
              active={!!selectedClass && active}
            />
            <AirportDot
              lat={arc.origin.lat}
              lon={arc.origin.lon}
              active={!!selectedClass && active}
            />
            <AirportDot
              lat={arc.destination.lat}
              lon={arc.destination.lon}
              active={!!selectedClass && active}
            />
          </group>
        );
      })}
    </group>
  );
}

export function EarthScene({
  legs,
  selectedClass,
}: {
  legs: EmptyLegCandidate[];
  selectedClass?: string | null;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0.4, 4.2], fov: 42 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#050b11"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 2, 3]} intensity={1.2} color="#fff1d0" />
      <directionalLight position={[-3, -1, -2]} intensity={0.35} color="#3ecfac" />
      <Stars radius={80} depth={40} count={2500} factor={3} saturation={0} fade speed={0.4} />
      <SpinningEarth legs={legs} selectedClass={selectedClass} />
      <OrbitControls
        enablePan={false}
        minDistance={2.8}
        maxDistance={7}
        autoRotate={false}
        rotateSpeed={0.55}
      />
    </Canvas>
  );
}
