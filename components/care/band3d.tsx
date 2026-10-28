"use client";

import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentRef, ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { asset } from "@/lib/asset";

/* TAWD Band: a navy woven wristband with a slim graphite sensor module, matched to the owner's product image.
   Everything is procedural (geometry, weave, brushed metal) and lit by local lightformers, so nothing is fetched
   at runtime except the logo in /public. Units are centimetres. The loop's axis is X; the module sits at +Z.
   The pulse trace in the module window moves at the live heart rate passed in `bpm`. */

type View = "front" | "sensor";
export type Band3DProps = { view?: View; connected?: boolean; className?: string; bpm?: number; alert?: boolean; orbits?: boolean };

const ACCENT = "#0D61BB";
const NAVY = "#8fb0f0"; // multiplies the dark weave albedo into the strap's deep navy

/* ── dimensions ─────────────────────────────────────────────────────────── */
const W = 2.9; // strap width
const T = 0.17; // strap thickness
const HALF_H = 3.3; // loop half height
const ZF = 2.3; // front of the loop (centre line of the strap)
const ZB = -2.9; // back of the loop
const R_FRONT = 2.35; // a round loop: only the stretch under the module is flat
const R_BACK = 2.6;

const POD_T = 0.42; // skin-side base of the module (towards the skin)
const POD_L = 2.0; // module length along the strap
const POD_Z = ZF - T / 2 - POD_T / 2;
const SKIN_Z = ZF - T / 2 - POD_T; // skin-side face of the module

/* the module on the outside of the band, in its own upright frame */
const MOD_W = 2.0; // along the strap
const MOD_H = 3.3; // across the strap: a little taller than the band is wide
const MOD_T = 0.5; // how far it stands off the fabric
const WIN_Y = 0.42; // centre of the pulse window, above the wordmark

/* ── small deterministic PRNG so the textures are identical on every mount ─ */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasOf(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function tex(c: HTMLCanvasElement, color: boolean, rx: number, ry: number) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fine basket weave for the outside of the strap: albedo + height. */
function weaveCanvases() {
  const size = 128, cell = 16;
  const a = canvasOf(size), b = canvasOf(size);
  const ax = a.getContext("2d")!, bx = b.getContext("2d")!;
  const ai = ax.createImageData(size, size), bi = bx.createImageData(size, size);
  const rand = rng(7);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = Math.floor(x / cell), j = Math.floor(y / cell);
    const u = (x % cell) / cell, v = (y % cell) / cell;
    const horizontal = (i + j) % 2 === 0;
    // a thread is round across its width and dips where it goes under its neighbours
    const across = horizontal ? v : u, along = horizontal ? u : v;
    const h = Math.pow(Math.sin(Math.PI * across), 0.7) * (0.55 + 0.45 * Math.sin(Math.PI * along));
    const fibre = 0.9 + 0.1 * Math.sin((horizontal ? x : y) * 1.9) + (rand() - 0.5) * 0.12;
    const o = (y * size + x) * 4;
    const g = Math.max(0, Math.min(255, (5 + 30 * h * h) * fibre));
    ai.data[o] = g; ai.data[o + 1] = g; ai.data[o + 2] = g * 1.05; ai.data[o + 3] = 255;
    const hb = Math.max(0, Math.min(255, 255 * h));
    bi.data[o] = bi.data[o + 1] = bi.data[o + 2] = hb; bi.data[o + 3] = 255;
  }
  ax.putImageData(ai, 0, 0); bx.putImageData(bi, 0, 0);
  return [a, b] as const;
}

/** Broad diagonal ribbing for the inside of the strap. */
function ribCanvases() {
  const size = 256;
  const a = canvasOf(size), b = canvasOf(size);
  const ax = a.getContext("2d")!, bx = b.getContext("2d")!;
  const ai = ax.createImageData(size, size), bi = bx.createImageData(size, size);
  const rand = rng(21);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = ((x + y) % 128) / 128; // two diagonal ribs per tile, seamless
    // a wide soft rib with a narrow valley between ribs
    const rib = Math.pow(Math.sin(Math.PI * t), 0.45);
    const twill = 0.5 + 0.5 * Math.sin(((x - y + 2048) % 8) / 8 * Math.PI * 2);
    const knit = 0.5 + 0.5 * Math.sin((x + y) / 4 * Math.PI * 2 / 2);
    const h = rib * (0.82 + 0.12 * twill + 0.06 * knit);
    const o = (y * size + x) * 4;
    const g = Math.max(0, Math.min(255, (5 + 24 * h * h) * (0.94 + rand() * 0.12)));
    ai.data[o] = g; ai.data[o + 1] = g; ai.data[o + 2] = g * 1.05; ai.data[o + 3] = 255;
    const hb = 255 * h;
    bi.data[o] = bi.data[o + 1] = bi.data[o + 2] = hb; bi.data[o + 3] = 255;
  }
  ax.putImageData(ai, 0, 0); bx.putImageData(bi, 0, 0);
  return [a, b] as const;
}

/** Brushed metal: long fine streaks, used as roughness + a whisper of height. */
function brushedCanvas() {
  const size = 256;
  const c = canvasOf(size);
  const x = c.getContext("2d")!;
  x.fillStyle = "#c4c4c4"; x.fillRect(0, 0, size, size);
  const rand = rng(99);
  for (let i = 0; i < 900; i++) {
    const y = Math.floor(rand() * size), len = 40 + rand() * 216, x0 = rand() * size;
    const g = Math.floor(150 + rand() * 105);
    x.fillStyle = `rgba(${g},${g},${g},${0.25 + rand() * 0.45})`;
    x.fillRect(x0, y, len, 1);
    if (x0 + len > size) x.fillRect(0, y, x0 + len - size, 1);
  }
  return c;
}

/* ── geometry ───────────────────────────────────────────────────────────── */

/** The loop's centre line, as evenly spaced (y, z) points with outward normals. */
function loopPath(n: number) {
  const p = new THREE.Path();
  const a = HALF_H;
  // 2D x = world z, 2D y = world y; counter-clockwise, flat at the front for the module
  p.moveTo(ZF, -(a - R_FRONT));
  p.lineTo(ZF, a - R_FRONT);
  p.absarc(ZF - R_FRONT, a - R_FRONT, R_FRONT, 0, Math.PI / 2, false);
  p.lineTo(ZB + R_BACK, a);
  p.absarc(ZB + R_BACK, a - R_BACK, R_BACK, Math.PI / 2, Math.PI, false);
  p.lineTo(ZB, -(a - R_BACK));
  p.absarc(ZB + R_BACK, -(a - R_BACK), R_BACK, Math.PI, Math.PI * 1.5, false);
  p.lineTo(ZF - R_FRONT, -a);
  p.absarc(ZF - R_FRONT, -(a - R_FRONT), R_FRONT, Math.PI * 1.5, Math.PI * 2, false);
  let pts = p.getSpacedPoints(n).slice(0, n);

  // relax the corners so the fabric bends like fabric, not like sheet metal;
  // the stretch over the module stays flat
  const stiff = (q: THREE.Vector2) => q.x > ZF - 0.02 && Math.abs(q.y) < POD_L / 2 + 0.05;
  for (let pass = 0; pass < 140; pass++) {
    pts = pts.map((q, i) => {
      if (stiff(q)) return q;
      const l = pts[(i + n - 1) % n], r = pts[(i + 1) % n];
      return new THREE.Vector2((l.x + r.x + q.x * 2) / 4, (l.y + r.y + q.y * 2) / 4);
    });
  }

  const out: { y: number; z: number; ny: number; nz: number; s: number }[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const l = pts[(i + n - 1) % n], r = pts[(i + 1) % n], q = pts[i];
    const tz = r.x - l.x, ty = r.y - l.y, len = Math.hypot(tz, ty) || 1;
    if (i > 0) s += Math.hypot(q.x - l.x, q.y - l.y);
    out.push({ y: q.y, z: q.x, ny: -tz / len, nz: ty / len, s });
  }
  const total = s + Math.hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y);
  return { pts: out, total };
}

/** The strap: a flat, round-edged section swept around the loop.
    Group 0 is the outside (basket weave), group 1 the inside (ribbing). */
function strapGeometry() {
  const N = 420;
  const { pts, total } = loopPath(N);
  const c = T / 2;

  // closed cross-section (u across the width, v along the outward normal)
  const prof: { u: number; v: number; nu: number; nv: number }[] = [];
  const arc = (cu: number, from: number, to: number, steps: number, skipFirst: boolean) => {
    for (let k = skipFirst ? 1 : 0; k <= steps; k++) {
      const t = from + ((to - from) * k) / steps;
      prof.push({ u: cu + Math.cos(t) * c, v: Math.sin(t) * c, nu: Math.cos(t), nv: Math.sin(t) });
    }
  };
  arc(-W / 2 + c, Math.PI, Math.PI / 2, 6, false); // left edge, upper half
  arc(W / 2 - c, Math.PI / 2, 0, 6, false); // right edge, upper half
  const outerSegs = prof.length - 1;
  arc(W / 2 - c, 0, -Math.PI / 2, 6, true); // right edge, lower half
  arc(-W / 2 + c, -Math.PI / 2, -Math.PI, 6, false); // left edge, lower half
  const M = prof.length;

  const pos = new Float32Array((N + 1) * M * 3);
  const nor = new Float32Array((N + 1) * M * 3);
  const uv = new Float32Array((N + 1) * M * 2);
  for (let i = 0; i <= N; i++) {
    const q = pts[i % N];
    const su = i === N ? 1 : q.s / total;
    for (let j = 0; j < M; j++) {
      const f = prof[j], o = (i * M + j) * 3;
      pos[o] = f.u; pos[o + 1] = q.y + q.ny * f.v; pos[o + 2] = q.z + q.nz * f.v;
      nor[o] = f.nu; nor[o + 1] = q.ny * f.nv; nor[o + 2] = q.nz * f.nv;
      uv[(i * M + j) * 2] = su; uv[(i * M + j) * 2 + 1] = f.u / W + 0.5;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < M - 1; j++) for (let i = 0; i < N; i++) {
    const a = i * M + j, b = (i + 1) * M + j, cc = i * M + j + 1, d = (i + 1) * M + j + 1;
    idx.push(a, cc, b, cc, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, outerSegs * N * 6, 0);
  g.addGroup(outerSegs * N * 6, (M - 1 - outerSegs) * N * 6, 1);
  g.computeBoundingBox();
  return { geometry: g, length: total };
}

/** A box with rounded corners in its face and a soft bevelled edge; final size w × h × d. */
function slab(w: number, h: number, r: number, d: number, b: number) {
  const iw = w - 2 * b, ih = h - 2 * b, ir = Math.max(Math.min(r - b, iw / 2, ih / 2), 0.001);
  const s = new THREE.Shape();
  const x = -iw / 2, y = -ih / 2;
  s.moveTo(x + ir, y);
  s.lineTo(x + iw - ir, y); s.absarc(x + iw - ir, y + ir, ir, -Math.PI / 2, 0, false);
  s.lineTo(x + iw, y + ih - ir); s.absarc(x + iw - ir, y + ih - ir, ir, 0, Math.PI / 2, false);
  s.lineTo(x + ir, y + ih); s.absarc(x + ir, y + ih - ir, ir, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + ir); s.absarc(x + ir, y + ir, ir, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(d - 2 * b, 0.001), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 6, curveSegments: 20,
  });
  g.center();
  return g;
}


/* ── the model ──────────────────────────────────────────────────────────── */

function useBandAssets() {
  const assets = useMemo(() => {
    const strap = strapGeometry();
    const [weaveA, weaveB] = weaveCanvases();
    const [ribA, ribB] = ribCanvases();
    const outerTile = 0.34, innerTile = 1.9;
    const oRep: [number, number] = [Math.round(strap.length / outerTile), W / outerTile];
    const iRep: [number, number] = [Math.round(strap.length / innerTile), W / innerTile];
    const brushed = brushedCanvas();
    const logo = new THREE.TextureLoader().load(asset("/brand/tawd-logo-white.png"));
    logo.colorSpace = THREE.SRGBColorSpace;
    logo.anisotropy = 8;

    const textures = {
      weaveMap: tex(weaveA, true, ...oRep), weaveBump: tex(weaveB, false, ...oRep),
      ribMap: tex(ribA, true, ...iRep), ribBump: tex(ribB, false, ...iRep),
      brushed: tex(brushed, false, 0.45, 0.45), logo,
    };
    const fabric = (map: THREE.Texture, bump: THREE.Texture, bumpScale: number, tint: string) =>
      new THREE.MeshPhysicalMaterial({
        map, bumpMap: bump, bumpScale, color: tint, metalness: 0, roughness: 0.9,
        sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color("#2a4a8a"), envMapIntensity: 0.3,
      });
    const materials = {
      outer: fabric(textures.weaveMap, textures.weaveBump, 1.6, NAVY),
      inner: fabric(textures.ribMap, textures.ribBump, 2.4, "#6f7f9f"),
      metal: new THREE.MeshPhysicalMaterial({
        color: "#8d9095", metalness: 1, roughness: 0.42, roughnessMap: textures.brushed,
        bumpMap: textures.brushed, bumpScale: 0.06, clearcoat: 0.25, clearcoatRoughness: 0.45, envMapIntensity: 1.2,
      }),
      body: new THREE.MeshPhysicalMaterial({ color: "#34373c", metalness: 0.75, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
      glass: new THREE.MeshPhysicalMaterial({ color: "#07080a", metalness: 0, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.8 }),
      steel: new THREE.MeshPhysicalMaterial({ color: "#a9adb3", metalness: 1, roughness: 0.32 }),
      dark: new THREE.MeshPhysicalMaterial({ color: "#15171a", metalness: 0.9, roughness: 0.45 }),
    };
    /* the outer module: near-black with a deep clear coat, as in the product reference */
    const shell = new THREE.MeshPhysicalMaterial({ color: "#0c0e13", metalness: 0.55, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.1 });
    const all = { ...materials, shell };
    const geometries = {
      strap: strap.geometry,
      pod: slab(W - 0.06, POD_L, 0.42, POD_T, 0.1),
      module: slab(MOD_W, MOD_H, 0.42, MOD_T, 0.11),
      bezel: slab(0.94, 1.86, 0.26, 0.03, 0.012),
      pane: slab(0.8, 1.72, 0.2, 0.05, 0.02),
      window: slab(1.5, 1.3, 0.42, 0.16, 0.07),
    };
    return { textures, materials: all, geometries };
  }, []);

  useEffect(() => () => {
    Object.values(assets.geometries).forEach((g) => g.dispose());
    Object.values(assets.materials).forEach((m) => m.dispose());
    Object.values(assets.textures).forEach((t) => t.dispose());
  }, [assets]);

  return assets;
}

function Lens({ x, y, r, color, glow }: { x: number; y: number; r: number; color: string; glow: number }) {
  // faces the skin (−Z); a tinted disc inside a thin dark bezel
  return (
    <group position={[x, y, 0]} rotation={[0, Math.PI, 0]}>
      <mesh>
        <circleGeometry args={[r * 1.45, 32]} />
        <meshStandardMaterial color="#1d2025" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <circleGeometry args={[r, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} metalness={0.1} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** The pulse trace behind the module's window: a light guide, not a display. Drawn once on a canvas. */
function pulseTexture(color: string) {
  const c = canvasOf(256);
  c.width = 128; c.height = 320;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, c.width, c.height);
  x.strokeStyle = color; x.lineWidth = 5; x.lineCap = "round"; x.lineJoin = "round";
  x.shadowColor = color; x.shadowBlur = 8;
  const mid = 64;
  /* runs edge to edge so the texture tiles vertically and can scroll like a live trace */
  x.beginPath(); x.moveTo(mid, 0); x.lineTo(mid, 320); x.stroke();
  for (const [y, w] of [[40, 14], [100, 22], [220, 22], [280, 14]]) { x.beginPath(); x.moveTo(mid - w, y); x.lineTo(mid + w, y); x.stroke(); }
  x.lineWidth = 4;
  /* one heartbeat complex per tile */
  x.beginPath(); x.moveTo(mid, 136); x.lineTo(mid - 16, 146); x.lineTo(mid + 36, 160); x.lineTo(mid - 30, 172); x.lineTo(mid + 10, 184); x.lineTo(mid, 192); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* thin elliptical orbits with travelling dots, as in the product image */
function Orbits() {
  const dots = useRef<THREE.Group[]>([]);
  const ORB = [
    { r: 5.0, tilt: 0.32, color: "#8b5cf6", speed: 0.32, phase: 0.4 },
    { r: 4.4, tilt: -0.22, color: "#22c55e", speed: -0.24, phase: 2.6 },
    { r: 5.6, tilt: 0.12, color: "#2f8dff", speed: 0.18, phase: 4.4 },
  ];
  useFrame((root) => {
    const t = root.clock.elapsedTime;
    ORB.forEach((o, i) => {
      const d = dots.current[i];
      if (!d) return;
      const a = o.phase + t * o.speed;
      d.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r * 0.62);
    });
  });
  return (
    <>
      {ORB.map((o, i) => (
        <group key={i} position={[0, LIFT, 0]} rotation={[o.tilt, 0, o.tilt * 0.4]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.62, 1]}>
            <torusGeometry args={[o.r, 0.012, 6, 160]} />
            <meshBasicMaterial color="#9fb8e8" transparent opacity={0.22} toneMapped={false} />
          </mesh>
          <group ref={(el) => { if (el) dots.current[i] = el; }}>
            <mesh>
              <sphereGeometry args={[0.16, 20, 20]} />
              <meshBasicMaterial color={o.color} toneMapped={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.34, 20, 20]} />
              <meshBasicMaterial color={o.color} transparent opacity={0.22} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  );
}

function BandModel({ connected, bpm, alert, orbits }: { connected: boolean; bpm: number; alert: boolean; orbits: boolean }) {
  const { materials: m, geometries: g, textures } = useBandAssets();
  const strapMaterials = useMemo(() => [m.outer, m.inner], [m]);
  const glassZ = SKIN_Z - 0.115;
  const lit = !connected ? "#6f757d" : alert ? "#ff5a4f" : "#2f8dff";
  const pulse = useMemo(() => pulseTexture(lit), [lit]);
  useEffect(() => () => pulse.dispose(), [pulse]);
  const float = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((root, dt) => {
    const t = root.clock.elapsedTime;
    /* one tile of the trace holds one beat: scroll at the live heart rate */
    if (connected) pulse.offset.y = (pulse.offset.y - Math.min(dt, 0.05) * (bpm / 60)) % 1;
    if (float.current) float.current.position.y = LIFT + Math.sin(t * 0.9) * 0.18;
    if (led.current) led.current.opacity = connected ? 0.45 + 0.55 * Math.max(0, Math.sin(t * Math.PI * 2 * (bpm / 60))) : 0.4;
  });

  return (
    <>
      {orbits && <Orbits />}
      <group ref={float} position={[0, LIFT, 0]}>
        {/* the loop was modelled standing up; laid flat here so the band's width is vertical, as it sits on a wrist */}
        <group rotation={[0, 0, Math.PI / 2]}>
          <mesh geometry={g.strap} material={strapMaterials} castShadow receiveShadow />
          {/* skin-side base of the module, under the fabric */}
          <mesh geometry={g.pod} material={m.body} position={[0, 0, POD_Z]} castShadow receiveShadow />
          {/* skin side: glossy optical window, lenses, charging pads */}
          <mesh geometry={g.window} material={m.glass} position={[0.4, 0, SKIN_Z - 0.03]} />
          <group position={[0.4, 0, glassZ]}>
            <Lens x={0} y={0} r={0.13} color="#0c0d10" glow={0} />
            <Lens x={0.36} y={0.3} r={0.085} color="#2c6e4c" glow={0.12} />
            <Lens x={0.36} y={-0.3} r={0.085} color="#2c6e4c" glow={0.12} />
            <Lens x={-0.4} y={0} r={0.085} color="#7c2f2f" glow={0.12} />
          </group>
          {[-0.3, 0.3].map((y) => (
            <mesh key={y} position={[-1.0, y, SKIN_Z - 0.004]} rotation={[0, Math.PI, 0]} material={m.steel}>
              <circleGeometry args={[0.105, 32]} />
            </mesh>
          ))}
        </group>

        {/* the module on the outside of the band: a compact dark capsule, taller than it is wide, no screen */}
        <group position={[0, 0, ZF + T / 2 - 0.03]}>
          <mesh geometry={g.module} material={m.shell} position={[0, 0, MOD_T / 2]} castShadow receiveShadow />
          {/* recessed vertical window with the blue pulse trace */}
          <mesh geometry={g.bezel} material={m.dark} position={[0, WIN_Y, MOD_T + 0.004]} />
          <mesh geometry={g.pane} material={m.glass} position={[0, WIN_Y, MOD_T + 0.018]} />
          <mesh position={[0, WIN_Y, MOD_T + 0.052]}>
            <planeGeometry args={[0.62, 1.55]} />
            <meshBasicMaterial map={pulse} transparent opacity={connected ? 0.95 : 0.45} toneMapped={false} />
          </mesh>
          {/* status light in the corner */}
          <mesh position={[MOD_W / 2 - 0.3, MOD_H / 2 - 0.3, MOD_T + 0.006]}>
            <circleGeometry args={[0.07, 28]} />
            <meshBasicMaterial ref={led} color={lit} transparent toneMapped={false} />
          </mesh>
          <mesh position={[MOD_W / 2 - 0.3, -MOD_H / 2 + 0.62, MOD_T + 0.006]}>
            <circleGeometry args={[0.05, 24]} />
            <meshBasicMaterial color={lit} toneMapped={false} />
          </mesh>
          {/* wordmark and the single blue accent line beneath it */}
          <mesh position={[0, -MOD_H / 2 + 0.62, MOD_T + 0.006]}>
            <planeGeometry args={[1.36, 1.36 * (194 / 850)]} />
            <meshBasicMaterial map={textures.logo} transparent opacity={0.95} toneMapped={false} />
          </mesh>
          <mesh position={[0, -MOD_H / 2 + 0.3, MOD_T + 0.006]}>
            <planeGeometry args={[1.3, 0.035]} />
            <meshBasicMaterial color={connected ? ACCENT : "#6f757d"} toneMapped={false} />
          </mesh>
        </group>
      </group>

      {/* drei blurs this on a plane fixed at the world origin, so the ground has to sit there */}
      <ContactShadows position={[0, -0.02, 0]} opacity={0.45} scale={18} blur={2.6} far={3.6} resolution={512} color="#000000" frames={2} />
    </>
  );
}

/* ── camera rig ─────────────────────────────────────────────────────────── */

const LIFT = MOD_H / 2 + 0.05; // the band lies flat: its width is its height above the ground
const POSES: Record<View, { theta: number; phi: number; radius: number; target: THREE.Vector3 }> = {
  /* three-quarter from slightly above: the module, its pulse window and the logo */
  front: { theta: 0.3, phi: 1.33, radius: 16, target: new THREE.Vector3(0, LIFT, 0.2) },
  /* over the far rim, down into the loop: the skin side of the module */
  sensor: { theta: Math.PI - 0.25, phi: 0.78, radius: 17.5, target: new THREE.Vector3(0, LIFT - 0.4, 0.5) },
};
const RESUME_AFTER = 3.5; // seconds of stillness before the idle turn resumes

function Rig({ view }: { view: View }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const eventTarget = useThree((s) => s.events.connected) as unknown;
  const aspect = useThree((s) => s.size.width / Math.max(s.size.height, 1));
  const fit = aspect < 1 ? 1 / Math.max(aspect, 0.4) : 1; // pull back in narrow containers
  const state = useRef({ animating: false, interacting: false, last: 0, placed: false });
  const sph = useMemo(() => new THREE.Spherical(), []);
  const off = useMemo(() => new THREE.Vector3(), []);

  // first frame: start at the pose, no fly-in; afterwards a view change eases
  useLayoutEffect(() => {
    const s = state.current;
    if (!s.placed) {
      const p = POSES[view];
      camera.position.setFromSpherical(sph.set(p.radius * fit, p.phi, p.theta)).add(p.target);
      camera.lookAt(p.target);
      controls.current?.target.copy(p.target);
      s.placed = true;
      return;
    }
    s.animating = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // OrbitControls claims every touch gesture; hand vertical swipes back to the page
  useEffect(() => {
    dom.style.touchAction = "pan-y";
    const el = eventTarget ?? controls.current?.domElement;
    if (el instanceof HTMLElement) el.style.touchAction = "pan-y";
  }, [dom, eventTarget]);

  useFrame((root, dt) => {
    const c = controls.current;
    if (!c) return;
    const s = state.current;
    const now = root.clock.elapsedTime;
    if (s.animating && !s.interacting) {
      const p = POSES[view];
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * 3.4);
      sph.setFromVector3(off.copy(camera.position).sub(c.target));
      let d = p.theta - sph.theta;
      d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest way round
      const dr = p.radius * fit - sph.radius, dp = p.phi - sph.phi;
      sph.theta += d * k; sph.phi += dp * k; sph.radius += dr * k;
      c.target.lerp(p.target, k);
      camera.position.setFromSpherical(sph).add(c.target);
      camera.lookAt(c.target);
      if (Math.abs(d) < 0.003 && Math.abs(dp) < 0.003 && Math.abs(dr) < 0.02) { s.animating = false; s.last = now; }
    }
    c.autoRotate = view === "front" && !s.animating && !s.interacting && now - s.last > RESUME_AFTER;
  });

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.9}
      zoomSpeed={0.6}
      minDistance={8.5 * fit}
      maxDistance={26 * fit}
      autoRotateSpeed={0.7}
      onStart={() => { const s = state.current; s.interacting = true; s.animating = false; }}
      onEnd={() => { const s = state.current; s.interacting = false; s.last = performance.now() / 1000; }}
    />
  );
}

function Scene({ view, connected, bpm, alert, orbits }: { view: View; connected: boolean; bpm: number; alert: boolean; orbits: boolean }) {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[5, 9, 8]} intensity={2.1} castShadow
        shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-normalBias={0.03}
        shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8}
        shadow-camera-near={1} shadow-camera-far={30}
      />
      <directionalLight position={[-7, 3, 4]} intensity={0.9} color="#e6eef8" />
      <directionalLight position={[-4, 2, -8]} intensity={1.5} />
      <directionalLight position={[0, 4, 10]} intensity={0.8} color="#cfe0ff" />
      <BandModel connected={connected} bpm={bpm} alert={alert} orbits={orbits} />
      <Rig view={view} />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#70767d"]} />
        <Lightformer form="rect" intensity={3} position={[0, 8, 2]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
        <Lightformer form="rect" intensity={2.4} position={[-9, 1, 2]} rotation-y={Math.PI / 2} scale={[12, 3, 1]} />
        <Lightformer form="rect" intensity={2.6} position={[9, 1, 1]} rotation-y={-Math.PI / 2} scale={[12, 3, 1]} color="#eaf1fa" />
        <Lightformer form="rect" intensity={2.4} position={[-2, 1, 11]} rotation-y={Math.PI} scale={[14, 5, 1]} />
        <Lightformer form="rect" intensity={2.6} position={[0, 1, -11]} scale={[10, 5, 1]} />
        <Lightformer form="rect" intensity={0.5} position={[0, -8, 0]} rotation-x={-Math.PI / 2} scale={[14, 14, 1]} />
      </Environment>
    </>
  );
}

/* ── fallback + shell ───────────────────────────────────────────────────── */

function Fallback() {
  return (
    <div dir="rtl" className="absolute inset-0 flex items-center justify-center p-4">
      <div className="max-w-xs rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-center">
        <div className="mx-auto mb-4 h-10 w-16 rounded-full border-[6px] border-[#1c2c4f]" aria-hidden />
        <p className="text-sm font-semibold text-white">العرض الثلاثي الأبعاد غير متاح في هذا المتصفح</p>
        <p className="mt-2 text-xs leading-6 text-white/50">سوار طود: حزام قماشي كحلي بوحدة استشعار نحيلة ونافذة نبض زرقاء.</p>
      </div>
    </div>
  );
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function Band3D({ view = "front", connected = true, className, bpm = 72, alert = false, orbits = true }: Band3DProps) {
  // null until checked in the browser, so nothing touches `document` during SSR
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => { setWebgl(hasWebGL()); }, []);

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      {webgl === false && <Fallback />}
      {webgl === true && (
        <Boundary>
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ fov: 30, near: 0.5, far: 120, position: [10.7, 3.6, 13.4] }}
            gl={{ antialias: true, alpha: true }}
            style={{ touchAction: "pan-y", background: "transparent" }}
          >
            <Scene view={view} connected={connected} bpm={bpm} alert={alert} orbits={orbits} />
          </Canvas>
        </Boundary>
      )}
    </div>
  );
}
