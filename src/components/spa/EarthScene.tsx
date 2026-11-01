"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, Line, Stars, useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { LiveLeg } from "@/lib/listings";
import { angularDistance, arcPoints, latLonToVec3, midpoint, vec3ToLatLon } from "./geo";
import styles from "./spa.module.css";

export const R = 1.6;

export interface Focus {
  lat: number;
  lon: number;
  label: string;
  kind: "you" | "search" | "pin";
}

const SUN = new THREE.Vector3(1.2, 0.35, 0.9).normalize();

const earthVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const earthFrag = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D cloudsMap;
  uniform vec3 sunDir;
  uniform float time;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    vec3 brc = texture2D(cloudsMap, vUv + vec2(time * 0.0012, 0.0)).rgb;
    float clouds = brc.b;
    float ocean = 1.0 - brc.g;
    float ndl = dot(n, sunDir);
    float lit = max(ndl, 0.0);
    float dayMix = smoothstep(-0.12, 0.22, ndl);

    vec3 viewDir = normalize(cameraPosition - vPosW);
    vec3 h = normalize(viewDir + sunDir);
    float spec = pow(max(dot(n, h), 0.0), 48.0) * ocean * 0.35 * dayMix;

    vec3 surf = mix(night * vec3(1.25, 1.1, 0.9), day * (0.22 + 1.0 * lit), dayMix);
    surf = mix(surf, vec3(0.35 + 0.85 * lit), clouds * (0.9 * dayMix + 0.06));
    surf += vec3(0.9, 0.95, 1.0) * spec;

    float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
    surf += vec3(0.32, 0.55, 1.0) * fres * (0.25 + 0.45 * dayMix);
    gl_FragColor = vec4(surf, 1.0);
  }
`;

const glowVert = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vPosV;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPosV = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const glowFrag = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vPosV;
  void main() {
    vec3 v = normalize(-vPosV);
    float rim = pow(1.0 - abs(dot(v, normalize(vNormalV))), 2.6);
    gl_FragColor = vec4(vec3(0.38, 0.62, 1.0), rim * 0.55);
  }
`;

function Earth({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  const [day, night, brc] = useTexture([
    "/textures/earth_day_4096.jpg",
    "/textures/earth_night_4096.jpg",
    "/textures/earth_bump_roughness_clouds_4096.jpg",
  ]);
  day.colorSpace = THREE.SRGBColorSpace;
  night.colorSpace = THREE.SRGBColorSpace;
  for (const t of [day, night, brc]) {
    t.anisotropy = 8;
    t.wrapS = THREE.RepeatWrapping;
  }
  const uniforms = useMemo(
    () => ({
      dayMap: { value: day },
      nightMap: { value: night },
      cloudsMap: { value: brc },
      sunDir: { value: SUN },
      time: { value: 0 },
    }),
    [day, night, brc],
  );
  useFrame(({ clock }) => {
    uniforms.time.value = clock.elapsedTime;
  });

  const down = useRef<{ x: number; y: number } | null>(null);

  return (
    <group>
      <mesh
        onPointerDown={(e) => {
          down.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          const d = down.current;
          down.current = null;
          if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
          const local = e.object.worldToLocal(e.point.clone());
          const { lat, lon } = vec3ToLatLon(local.x, local.y, local.z);
          onPick(lat, lon);
        }}
      >
        <sphereGeometry args={[R, 96, 64]} />
        <shaderMaterial vertexShader={earthVert} fragmentShader={earthFrag} uniforms={uniforms} />
      </mesh>
      <mesh scale={1.035}>
        <sphereGeometry args={[R, 64, 48]} />
        <shaderMaterial
          vertexShader={glowVert}
          fragmentShader={glowFrag}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function RouteLine({ leg, dim }: { leg: LiveLeg; dim: boolean }) {
  const pts = useMemo(
    () =>
      arcPoints(
        leg.origin.lat,
        leg.origin.lon,
        leg.destination.lat,
        leg.destination.lon,
        40,
        R,
        0.03 + Math.min(leg.distanceKm / 20000, 0.12),
      ).map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    [leg],
  );
  return (
    <Line
      points={pts}
      color="#ffffff"
      transparent
      opacity={dim ? 0.12 : 0.42}
      lineWidth={1}
      depthWrite={false}
    />
  );
}

function SelectedRoute({ leg }: { leg: LiveLeg }) {
  const curve = useMemo(() => {
    const pts = arcPoints(
      leg.origin.lat,
      leg.origin.lon,
      leg.destination.lat,
      leg.destination.lon,
      80,
      R,
      0.03 + Math.min(leg.distanceKm / 20000, 0.12),
    );
    return new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
  }, [leg]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 96, 0.0075, 8, false), [curve]);
  const a = latLonToVec3(leg.origin.lat, leg.origin.lon, R * 1.004);
  const b = latLonToVec3(leg.destination.lat, leg.destination.lon, R * 1.004);
  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <Jet curve={curve} />
      {[
        [a, leg.origin.code],
        [b, leg.destination.code],
      ].map(([p, code]) => {
        const v = p as { x: number; y: number; z: number };
        return (
          <group key={code as string} position={[v.x, v.y, v.z]}>
            <mesh>
              <sphereGeometry args={[0.018, 16, 16]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <Html center zIndexRange={[10, 0]} occlude={false}>
              <div className={styles.codeTag}>{code as string}</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function Jet({ curve }: { curve: THREE.Curve<THREE.Vector3> }) {
  const { scene } = useGLTF("/models/jet.glb");
  const model = useMemo(() => scene.clone(true), [scene]);
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const up = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    t.current = (t.current + dt * 0.08) % 1;
    const p = curve.getPointAt(t.current);
    const tan = curve.getTangentAt(t.current);
    ref.current.position.copy(p);
    up.copy(p).normalize();
    const m = new THREE.Matrix4().lookAt(p, p.clone().add(tan), up);
    ref.current.quaternion.setFromRotationMatrix(m);
  });
  return (
    <group ref={ref}>
      <primitive object={model} scale={0.006} rotation={[0, Math.PI, 0]} />
    </group>
  );
}

function AirportDot({ lat, lon }: { lat: number; lon: number }) {
  const p = latLonToVec3(lat, lon, R * 1.002);
  return (
    <mesh position={[p.x, p.y, p.z]}>
      <sphereGeometry args={[0.008, 8, 8]} />
      <meshBasicMaterial color="#dfe9ff" transparent opacity={0.8} />
    </mesh>
  );
}

function Pin({ focus }: { focus: Focus }) {
  const p = latLonToVec3(focus.lat, focus.lon, R);
  const n = new THREE.Vector3(p.x, p.y, p.z).normalize();
  const q = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focus.lat, focus.lon],
  );
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const s = 1 + ((clock.elapsedTime * 0.8) % 1) * 1.6;
    ring.current.scale.setScalar(s);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - (s - 1) / 1.6);
  });
  const color = focus.kind === "you" ? "#38bdf8" : "#ff7a45";
  return (
    <group position={[p.x, p.y, p.z]} quaternion={q}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[0.028, 0.034, 40]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.0025, 0.0025, 0.06, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.068, 0]}>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Html position={[0, 0.1, 0]} center zIndexRange={[10, 0]}>
        <div className={styles.pinTag}>{focus.label}</div>
      </Html>
    </group>
  );
}

function Rig({
  target,
  selected,
  zoomRef,
  children,
}: {
  target: { lat: number; lon: number } | null;
  selected: LiveLeg | null;
  zoomRef: React.MutableRefObject<number>;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const idle = useRef(0);
  const want = useRef({ rx: 0.3, ry: 0, dist: 4.9 });

  useEffect(() => {
    if (selected) {
      const m = midpoint(
        selected.origin.lat,
        selected.origin.lon,
        selected.destination.lat,
        selected.destination.lon,
      );
      const span = angularDistance(
        selected.origin.lat,
        selected.origin.lon,
        selected.destination.lat,
        selected.destination.lon,
      );
      const v = latLonToVec3(m.lat, m.lon, 1);
      want.current = {
        rx: Math.asin(v.y) - 0.05,
        ry: -Math.atan2(v.x, v.z),
        dist: THREE.MathUtils.clamp(2.55 + span * 1.9, 2.6, 5.2),
      };
      zoomRef.current = 1;
    } else if (target) {
      const v = latLonToVec3(target.lat, target.lon, 1);
      want.current = {
        rx: Math.asin(v.y) - 0.1,
        ry: -Math.atan2(v.x, v.z),
        dist: 3.3,
      };
      zoomRef.current = 1;
    }
  }, [target, selected, zoomRef]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const w = want.current;
    const k = 1 - Math.exp(-dt * 3.2);
    if (!target && !selected) {
      idle.current += dt * 0.035;
      w.ry = idle.current;
      w.rx = 0.3;
      w.dist = 4.9;
    }
    let dry = w.ry - g.rotation.y;
    dry = Math.atan2(Math.sin(dry), Math.cos(dry));
    g.rotation.y += dry * k;
    g.rotation.x += (w.rx - g.rotation.x) * k;
    const dist = THREE.MathUtils.clamp(w.dist * zoomRef.current, 2.3, 7);
    camera.position.z += (dist - camera.position.z) * k;
    camera.lookAt(0, 0, 0);
  });

  return <group ref={group}>{children}</group>;
}

export function EarthScene({
  legs,
  selected,
  focus,
  onPick,
}: {
  legs: LiveLeg[];
  selected: LiveLeg | null;
  focus: Focus | null;
  onPick: (lat: number, lon: number) => void;
}) {
  const zoomRef = useRef(1);
  const [ready, setReady] = useState(false);
  const target = selected
    ? null
    : focus
      ? { lat: focus.lat, lon: focus.lon }
      : null;

  const dots = useMemo(() => {
    const seen = new Map<string, { lat: number; lon: number }>();
    for (const l of legs) {
      seen.set(l.origin.code, l.origin);
      seen.set(l.destination.code, l.destination);
    }
    return [...seen.entries()];
  }, [legs]);

  return (
    <div
      className={styles.canvasWrap}
      style={{ opacity: ready ? 1 : 0 }}
      onWheel={(e) => {
        zoomRef.current = THREE.MathUtils.clamp(
          zoomRef.current * (1 + e.deltaY * 0.0012),
          0.55,
          1.6,
        );
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 4.9], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={() => setReady(true)}
      >
        <color attach="background" args={["#05070d"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 2, 4]} intensity={1.6} />
        <Stars radius={60} depth={30} count={1800} factor={2.2} saturation={0} fade speed={0.2} />
        <Suspense fallback={null}>
          <Rig target={target} selected={selected} zoomRef={zoomRef}>
            <Earth onPick={onPick} />
            {dots.map(([code, p]) => (
              <AirportDot key={code} lat={p.lat} lon={p.lon} />
            ))}
            {legs.map((l) =>
              selected && l.id === selected.id ? null : (
                <RouteLine key={l.id} leg={l} dim={!!selected} />
              ),
            )}
            {selected && <SelectedRoute leg={selected} />}
            {focus && !selected && <Pin focus={focus} />}
          </Rig>
        </Suspense>
      </Canvas>
    </div>
  );
}

useGLTF.preload("/models/jet.glb");
