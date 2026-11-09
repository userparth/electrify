'use client';
import { GRID, type Live, type PartDef, type Props } from '@eb/parts';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';

const SCALE = 2;
const cache = new Map<string, { tex: THREE.CanvasTexture; at: number }>();

/** Renders a part's 2D drawing to a canvas texture; re-renders at most every `minMs` when its key changes. */
export function partTexture(id: string, def: PartDef, props: Props, live: Live, minMs = 250): THREE.CanvasTexture {
  const box = def.box(props), key = `${id}`;
  const sig = JSON.stringify([props, live], (_k, v) => typeof v === 'number' ? Math.round(v * 100) / 100 : Array.isArray(v) && v.length > 40 ? v.length : v);
  let entry = cache.get(key);
  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(8, Math.round(box.w * GRID * SCALE));
    canvas.height = Math.max(8, Math.round(box.h * GRID * SCALE));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    entry = { tex, at: 0 };
    cache.set(key, entry);
  }
  const now = performance.now();
  if (entry.tex.userData.sig !== sig && now - entry.at > minMs) {
    entry.at = now;
    entry.tex.userData.sig = sig;
    const markup = renderToStaticMarkup(def.render({ props, live, selected: false, act: () => {} }) as React.ReactElement);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box.w * GRID * SCALE}" height="${box.h * GRID * SCALE}" viewBox="${box.x * GRID} ${box.y * GRID} ${box.w * GRID} ${box.h * GRID}"><rect x="${box.x * GRID}" y="${box.y * GRID}" width="${box.w * GRID}" height="${box.h * GRID}" fill="#efeadd"/>${markup}</svg>`;
    const img = new Image(), tex = entry.tex;
    img.onload = () => {
      const c = tex.image as HTMLCanvasElement, g = c.getContext('2d')!;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      tex.needsUpdate = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  return entry.tex;
}

export function dropTexture(id: string) { cache.get(id)?.tex.dispose(); cache.delete(id); }
