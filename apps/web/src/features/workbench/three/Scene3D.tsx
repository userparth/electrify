'use client';
import { ContactShadows, Edges, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { getPart, resistorBands, type Live, type Props } from '@eb/parts';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { placedPins, type Inst, type PlacedPin } from '../model';
import { useBench } from '../store';
import { partTexture } from './svgTexture';

const INK = '#1d1d1b';
const BB_H = 3.4;
const LED_HEX: Record<string, string> = { red: '#e0453a', yellow: '#f2c230', green: '#3fae66', blue: '#3a6ed6', white: '#f4f4f4' };
// Body height (grid units, 1 = 2.54 mm) for parts drawn as a textured block.
const HEIGHT: Record<string, number> = {
  battery: 6, psu: 5, solar: 1.2, fgen: 4, dmm: 2.4, scope: 6, 'logic-analyzer': 3, 'logic-probe': 1.6,
  'arduino-uno': 1.4, rpi4: 1.8, pico: 0.9, 'seven-segment': 3, buzzer: 3.5, motor: 4, lamp: 4, button: 1.4,
  spdt: 1.6, spst: 1.6, 'logic-switch': 1.4, 'dip-switch-8': 1.2, pot: 2.6, fuse: 1.8, inductor: 2.2, 'cap-ceramic': 1.8,
};

function Part({ inst, live, onBoard, selected }: { inst: Inst; live: Live | undefined; onBoard: boolean; selected: boolean }) {
  const def = getPart(inst.type)!, props = { ...def.defaults, ...inst.props } as Props, lv = live ?? {};
  const elev = onBoard ? BB_H : 0, select = () => useBench.getState().select({ kind: 'part', id: inst.id });
  return (
    <group position={[inst.x, elev, inst.y]} rotation={[0, -inst.rot * Math.PI / 2, 0]} onClick={e => { e.stopPropagation(); select(); }}>
      <Model inst={inst} props={props} live={lv} />
      {selected && <SelectBox inst={inst} props={props} />}
    </group>
  );
}

function SelectBox({ inst, props }: { inst: Inst; props: Props }) {
  const b = getPart(inst.type)!.box(props), h = (HEIGHT[inst.type] ?? 3) + 0.6;
  return <mesh position={[b.x + b.w / 2, h / 2, b.y + b.h / 2]}><boxGeometry args={[b.w + 0.6, h, b.h + 0.6]} /><meshBasicMaterial color="#3a6ed6" wireframe /></mesh>;
}

function Block({ inst, props, live, height, side }: { inst: Inst; props: Props; live: Live; height: number; side?: string }) {
  const def = getPart(inst.type)!, b = def.box(props), tex = partTexture(inst.id, def, props, live, inst.type === 'breadboard' ? 2000 : 200);
  const mats = useMemo(() => {
    const s = new THREE.MeshStandardMaterial({ color: side ?? '#d9d2c2', roughness: 0.8 });
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 });
    return [s, s, top, s, s, s];
  }, [tex, side]);
  return (
    <mesh position={[b.x + b.w / 2, height / 2, b.y + b.h / 2]} material={mats} castShadow receiveShadow>
      <boxGeometry args={[b.w, height, b.h]} />
      <Edges color={INK} threshold={20} />
    </mesh>
  );
}

function Lead({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const curve = useMemo(() => new THREE.LineCurve3(new THREE.Vector3(...from), new THREE.Vector3(...to)), [from, to]);
  return <mesh castShadow><tubeGeometry args={[curve, 1, 0.09, 6, false]} /><meshStandardMaterial color="#b9bec3" metalness={0.8} roughness={0.3} /></mesh>;
}

function Model({ inst, props, live }: { inst: Inst; props: Props; live: Live }) {
  switch (inst.type) {
    case 'breadboard': return <Block inst={inst} props={props} live={live} height={BB_H} side="#f4f1ea" />;
    case 'resistor': {
      const span = Number(props.span), bands = resistorBands(Number(props.ohms)), y = 1.1, L = Math.min(2.6, span - 1), x0 = (span - L) / 2;
      return (
        <group>
          <Lead from={[0, -0.3, 0]} to={[0, y, 0]} /><Lead from={[0, y, 0]} to={[x0, y, 0]} />
          <Lead from={[span, -0.3, 0]} to={[span, y, 0]} /><Lead from={[span - x0, y, 0]} to={[span, y, 0]} />
          <mesh position={[span / 2, y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <capsuleGeometry args={[0.42, L - 0.84, 6, 16]} /><meshStandardMaterial color="#e3cfa3" roughness={0.6} />
          </mesh>
          {bands.map((c, i) => (
            <mesh key={i} position={[x0 + 0.5 + i * (L - 1.2) / 3.2 + (i === 3 ? 0.35 : 0), y, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.44, 0.44, 0.16, 16]} /><meshStandardMaterial color={c} />
            </mesh>
          ))}
        </group>
      );
    }
    case 'led': {
      const color = LED_HEX[String(props.color)] ?? '#e0453a', glow = live.burnt ? 0 : Number(live.glow ?? 0);
      return (
        <group>
          <Lead from={[0, -0.3, 0]} to={[0, 2.4, 0]} /><Lead from={[1, -0.3, 0]} to={[1, 2.1, 0]} />
          <mesh position={[0.5, 3.2, 0]} castShadow>
            <cylinderGeometry args={[1, 1.05, 1.6, 24]} />
            <meshStandardMaterial color={live.burnt ? '#4a4741' : color} transparent opacity={0.85} emissive={color} emissiveIntensity={glow * 3} roughness={0.2} />
          </mesh>
          <mesh position={[0.5, 4, 0]}>
            <sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={live.burnt ? '#4a4741' : color} transparent opacity={0.85} emissive={color} emissiveIntensity={glow * 3} roughness={0.2} />
          </mesh>
          {glow > 0.08 && <pointLight position={[0.5, 4, 0]} color={color} intensity={glow * 40} distance={14} decay={2} />}
        </group>
      );
    }
    case 'cap-electrolytic': {
      const rev = !!live.reversed;
      return (
        <group>
          <Lead from={[0, -0.3, 0]} to={[0, 0.6, 0]} /><Lead from={[2, -0.3, 0]} to={[2, 0.6, 0]} />
          <mesh position={[1, 2.6, 0]} castShadow><cylinderGeometry args={[1.4, 1.4, 4, 28]} /><meshStandardMaterial color={rev ? '#8a3a2a' : '#2f4a8a'} roughness={0.5} /><Edges color={INK} threshold={30} /></mesh>
          <mesh position={[1, 4.62, 0]}><cylinderGeometry args={[1.38, 1.38, 0.05, 28]} /><meshStandardMaterial color="#c9ced2" metalness={0.7} roughness={0.3} /></mesh>
        </group>
      );
    }
    case '2n2222': case '2n2907': case '2n7000': {
      return (
        <group>
          {[0, 1, 2].map(x => <Lead key={x} from={[x, -0.3, 0]} to={[x, 1.2, 0]} />)}
          <mesh position={[1, 2.2, 0.2]} castShadow>
            <cylinderGeometry args={[1, 1, 2, 24, 1, false, 0, Math.PI]} /><meshStandardMaterial color="#2b2b2b" roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[1, 2.2, 0.2]}><boxGeometry args={[2, 2, 0.05]} /><meshStandardMaterial color="#2b2b2b" /></mesh>
        </group>
      );
    }
    default: {
      const def = getPart(inst.type)!;
      const h = HEIGHT[inst.type] ?? (def.category === 'Digital ICs' ? 1.3 : 2);
      const side = def.category === 'Microcontrollers' ? '#1f5f4a' : def.category === 'Digital ICs' ? '#2b2b2b' : undefined;
      return <Block inst={inst} props={props} live={live} height={h} side={side} />;
    }
  }
}

function pinHeight(p: PlacedPin, onBoard: Set<string>, holes: Set<string>): number {
  if (p.inst.type === 'breadboard') return BB_H + 0.05;
  if (holes.has(`${p.x},${p.y}`) && (p.def.mount ?? 'board') === 'board') return BB_H + 0.05;
  const base = onBoard.has(p.inst.id) ? BB_H : 0;
  return base + (HEIGHT[p.inst.type] ?? 2) + 0.15;
}

function Wire3D({ a, b, ha, hb, color }: { a: PlacedPin; b: PlacedPin; ha: number; hb: number; color: string }) {
  const curve = useMemo(() => {
    const A = new THREE.Vector3(a.x, ha, a.y), B = new THREE.Vector3(b.x, hb, b.y), d = A.distanceTo(B), lift = Math.min(10, 1.5 + d * 0.25);
    const top = Math.max(ha, hb) + lift;
    return new THREE.CatmullRomCurve3([A, A.clone().setY(ha + 1.2), new THREE.Vector3((a.x + b.x) / 2, top, (a.y + b.y) / 2), B.clone().setY(hb + 1.2), B]);
  }, [a.x, a.y, b.x, b.y, ha, hb]);
  return <mesh castShadow><tubeGeometry args={[curve, 48, 0.32, 8, false]} /><meshStandardMaterial color={color} roughness={0.55} /></mesh>;
}

/** Re-frames the camera when the circuit's footprint changes (new example, big edits). */
function Fit({ center, radius }: { center: [number, number, number]; radius: number }) {
  const camera = useThree(s => s.camera), controls = useThree(s => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const key = `${Math.round(center[0] / 4)},${Math.round(center[2] / 4)},${Math.round(radius / 4)}`;
  useEffect(() => {
    camera.position.set(center[0] + radius * 0.3, radius * 0.85, center[2] + radius * 1.0);
    if (controls) { controls.target.set(...center); controls.update(); }
  }, [key, controls]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function Scene3D() {
  const doc = useBench(s => s.doc), live = useBench(s => s.live), sel = useBench(s => s.sel);
  const { pins, onBoard, holes, center, radius } = useMemo(() => {
    const pins = doc.parts.flatMap(placedPins), holes = new Set(pins.filter(p => p.inst.type === 'breadboard').map(p => `${p.x},${p.y}`));
    const onBoard = new Set(doc.parts.filter(i => i.type !== 'breadboard' && pins.some(p => p.inst === i && (p.def.mount ?? 'board') === 'board' && holes.has(`${p.x},${p.y}`))).map(i => i.id));
    const corners = doc.parts.flatMap(i => {
      const d = getPart(i.type), b = d?.box({ ...d.defaults, ...i.props });
      if (!b) return [];
      return [[b.x, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h], [b.x + b.w, b.y]].map(([x, y]) => { const r = i.rot & 3, [rx, ry] = r === 1 ? [-y!, x!] : r === 2 ? [-x!, -y!] : r === 3 ? [y!, -x!] : [x!, y!]; return [i.x + rx, i.y + ry]; });
    });
    const xs = [...pins.map(p => p.x), ...corners.map(c => c[0]!)], ys = [...pins.map(p => p.y), ...corners.map(c => c[1]!)];
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0, cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    const radius = xs.length ? Math.max(20, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 30;
    return { pins, onBoard, holes, center: [cx, 0, cy] as [number, number, number], radius };
  }, [doc.parts]);
  const pinAt = useMemo(() => new Map(pins.map(p => [p.key, p])), [pins]);

  return (
    <div className="wb-canvas">
      <Canvas dpr={[1, 2]} camera={{ position: [center[0] + radius * 0.3, radius * 0.85, center[2] + radius * 1.0], fov: 40, near: 0.5, far: 2000 }} onPointerMissed={() => useBench.getState().select(null)}>
        <color attach="background" args={['#efeadd']} />
        <hemisphereLight args={['#fffaf0', '#c9bfa8', 1.2]} />
        <directionalLight position={[center[0] - 40, 90, center[2] + 30]} intensity={1.6} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.01, center[2]]} receiveShadow>
          <planeGeometry args={[radius * 8, radius * 8]} /><meshStandardMaterial color="#e6dcc6" roughness={1} />
        </mesh>
        {doc.parts.map(inst => <Part key={inst.id} inst={inst} live={live[inst.id]} onBoard={onBoard.has(inst.id)} selected={sel?.kind === 'part' && sel.id === inst.id} />)}
        {doc.wires.map(w => {
          const a = pinAt.get(w.a), b = pinAt.get(w.b);
          if (!a || !b) return null;
          return <Wire3D key={w.id} a={a} b={b} ha={pinHeight(a, onBoard, holes)} hb={pinHeight(b, onBoard, holes)} color={w.color} />;
        })}
        <ContactShadows position={[center[0], 0.02, center[2]]} scale={radius * 2.5} blur={2} opacity={0.45} far={12} resolution={1024} />
        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} enableDamping />
        <Fit center={center} radius={radius} />
      </Canvas>
      <div className="wb-3d-hint">3D view · drag to orbit, right-drag to pan, scroll to zoom · edit in 2D</div>
    </div>
  );
}
