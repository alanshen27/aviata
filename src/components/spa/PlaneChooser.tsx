"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment } from "@react-three/drei";
import { FLEET, JetModel } from "./PlaneMesh";
import styles from "./spa.module.css";

export function PlaneChooser({ selectedId }: { selectedId: string | null }) {
  const idx = Math.max(0, FLEET.findIndex((f) => f.id === selectedId));
  const scale = 0.17 + idx * 0.02;
  return (
    <div className={styles.canvasWrap}>
      <Canvas
        shadows
        camera={{ position: [0, 1.3, 5.2], fov: 35 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#05070d"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 5, 3]} intensity={2} castShadow shadow-mapSize={1024} />
        <directionalLight position={[-4, 2, -3]} intensity={0.6} color="#9fc4ff" />
        <Suspense fallback={null}>
          <Environment preset="city" />
          <JetModel scale={scale} />
          <ContactShadows position={[0, -0.75, 0]} opacity={0.5} scale={12} blur={2.6} far={3} />
        </Suspense>
      </Canvas>
    </div>
  );
}
