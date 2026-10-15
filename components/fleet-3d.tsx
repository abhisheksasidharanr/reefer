'use client';

import { MutableRefObject, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { BOX, layoutFleet } from '@/lib/layout3d';

export interface FleetItem {
  id: number;
  containerNo: string;
  group: string;
  groupLabel: string;
  color: string;
  /** pulsing beacon above the box */
  beacon: 'critical' | 'warning' | null;
  dim: boolean;
  tooltip: { title: string; lines: string[] };
}

export type Preset = 'iso' | 'top' | 'front';
export interface Fleet3DHandle {
  preset: (p: Preset) => void;
}

interface Built {
  key: string;
  ids: number[];
  body: THREE.InstancedMesh;
  unit: THREE.InstancedMesh;
  beacons: { mesh: THREE.InstancedMesh; pos: THREE.Vector3[]; color: THREE.Color[] } | null;
  group: THREE.Group;
  labels: CSS2DObject[];
  radius: number;
}

/** Corrugated steel look: vertical ribs as a greyscale texture that the instance colour tints. */
function corrugation(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 32);
  for (let x = 0; x < 256; x += 8) {
    const grd = g.createLinearGradient(x, 0, x + 8, 0);
    grd.addColorStop(0, '#d9d9d9');
    grd.addColorStop(0.5, '#ffffff');
    grd.addColorStop(1, '#c4c4c4');
    g.fillStyle = grd;
    g.fillRect(x, 0, 8, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BEACON = { critical: new THREE.Color('#ef4444'), warning: new THREE.Color('#f59e0b') };

/**
 * `controller` is a plain prop (not a React ref): the page loads this component with next/dynamic,
 * which does not forward refs — a forwarded ref would stay null and the camera buttons would do nothing.
 */
export function Fleet3D({
  items,
  onOpen,
  autoRotate,
  controller,
}: {
  items: FleetItem[];
  onOpen: (id: number) => void;
  autoRotate: boolean;
  controller?: MutableRefObject<Fleet3DHandle | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [noGl, setNoGl] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; item: FleetItem } | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  const ctx = useRef<{
    renderer: THREE.WebGLRenderer;
    labels: CSS2DRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    texture: THREE.CanvasTexture;
    built: Built | null;
    hovered: number | null;
    raf: number;
  }>();

  // ── one-time scene setup ──
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setNoGl(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    el.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    const dark = document.documentElement.classList.contains('dark');
    scene.fog = new THREE.Fog(dark ? 0x020617 : 0xf1f5f9, 160, 420);
    scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x0f172a : 0xcbd5e1, dark ? 1.1 : 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, far: 300 });
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: dark ? 0x0f172a : 0xe2e8f0, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(800, 160, dark ? 0x1e293b : 0xcbd5e1, dark ? 0x172033 : 0xd8dee8);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    grid.position.y = 0.01;
    scene.add(grid);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 8;
    controls.maxDistance = 600;

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      labels.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Hover + click picking
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const pick = (e: PointerEvent): number | null => {
      const b = ctx.current?.built;
      if (!b) return null;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      camera.updateMatrixWorld(); // don't depend on a frame having been rendered since the last camera move
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects([b.body, b.unit])[0];
      return hit?.instanceId !== undefined ? b.ids[hit.instanceId] : null;
    };
    const onMove = (e: PointerEvent) => {
      const id = pick(e);
      const c = ctx.current!;
      if (id !== c.hovered) {
        highlight(c.hovered, false);
        highlight(id, true);
        c.hovered = id;
        renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
      }
      const item = id ? itemsRef.current.find((i) => i.id === id) : undefined;
      const r = el.getBoundingClientRect();
      setHover(item ? { x: e.clientX - r.left, y: e.clientY - r.top, item } : null);
    };
    const onLeave = () => {
      highlight(ctx.current?.hovered ?? null, false);
      if (ctx.current) ctx.current.hovered = null;
      setHover(null);
    };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const id = pick(e);
      if (id) openRef.current(id);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const clock = new THREE.Clock();
    const dummy = new THREE.Object3D();
    const tick = () => {
      const c = ctx.current!;
      c.controls.update();
      const b = c.built;
      if (b) {
        const dist = c.camera.position.distanceTo(c.controls.target);
        const showLabels = dist < Math.max(70, b.radius * 1.1);
        for (const l of b.labels) if (l.userData.lod) l.visible = showLabels;
        if (b.beacons) {
          const t = clock.getElapsedTime();
          b.beacons.pos.forEach((p, i) => {
            const s = 0.75 + 0.35 * Math.sin(t * 4 + i);
            dummy.position.set(p.x, p.y + 0.25 * Math.sin(t * 2 + i), p.z);
            dummy.scale.setScalar(s);
            dummy.updateMatrix();
            b.beacons!.mesh.setMatrixAt(i, dummy.matrix);
          });
          b.beacons.mesh.instanceMatrix.needsUpdate = true;
        }
      }
      c.renderer.render(c.scene, c.camera);
      c.labels.render(c.scene, c.camera);
      c.raf = requestAnimationFrame(tick);
    };

    ctx.current = { renderer, labels, scene, camera, controls, texture: corrugation(), built: null, hovered: null, raf: requestAnimationFrame(tick) };

    return () => {
      cancelAnimationFrame(ctx.current?.raf ?? 0);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
      });
      ctx.current?.texture.dispose();
      renderer.dispose();
      el.innerHTML = '';
    };
  }, []);

  function highlight(id: number | null, on: boolean) {
    const b = ctx.current?.built;
    if (!b || id === null) return;
    const i = b.ids.indexOf(id);
    const item = itemsRef.current.find((x) => x.id === id);
    if (i < 0 || !item) return;
    const c = new THREE.Color(item.color);
    if (on) c.lerp(new THREE.Color('#ffffff'), 0.35);
    b.body.setColorAt(i, c);
    if (b.body.instanceColor) b.body.instanceColor.needsUpdate = true;
  }

  useEffect(() => {
    if (ctx.current) ctx.current.controls.autoRotate = autoRotate;
    if (ctx.current) ctx.current.controls.autoRotateSpeed = 0.6;
  }, [autoRotate]);

  // ── build or recolour when items change ──
  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    const key = items.map((i) => `${i.id}:${i.group}`).join('|');
    const color = new THREE.Color();

    if (c.built && c.built.key === key) {
      // Same layout → recolour in place and refresh beacons.
      items.forEach((it, i) => {
        color.set(it.color);
        if (it.dim) color.lerp(new THREE.Color('#94a3b8'), 0.6);
        if (c.hovered === it.id) color.lerp(new THREE.Color('#ffffff'), 0.35);
        c.built!.body.setColorAt(i, color);
      });
      if (c.built.body.instanceColor) c.built.body.instanceColor.needsUpdate = true;
      const beaconKey = items.map((i) => i.beacon ?? '').join();
      if (c.built.group.userData.beaconKey === beaconKey) return;
    }

    // Rebuild everything.
    if (c.built) {
      c.scene.remove(c.built.group);
      c.built.group.traverse((o) => {
        if (o instanceof CSS2DObject) o.element.remove();
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
    }
    const { placed, groups, width, depth } = layoutFleet(
      items.map((i) => ({ id: i.id, group: i.group })),
      [...new Set(items.map((i) => i.group))],
    );
    const pos = new Map(placed.map((p) => [p.id, p]));
    const group = new THREE.Group();
    group.userData.beaconKey = items.map((i) => i.beacon ?? '').join();

    const bodyMat = new THREE.MeshStandardMaterial({ map: c.texture, roughness: 0.55, metalness: 0.25 });
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(BOX.length - 0.5, BOX.height, BOX.width), bodyMat, Math.max(items.length, 1));
    const unit = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.5, BOX.height - 0.1, BOX.width - 0.08),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8, metalness: 0.1 }),
      Math.max(items.length, 1),
    );
    body.castShadow = unit.castShadow = true;
    body.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const labels: CSS2DObject[] = [];
    const ids: number[] = [];
    const beaconPos: THREE.Vector3[] = [];
    const beaconColor: THREE.Color[] = [];

    items.forEach((it, i) => {
      const p = pos.get(it.id)!;
      ids.push(it.id);
      dummy.position.set(p.x - 0.25, BOX.height / 2, p.z);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      color.set(it.color);
      if (it.dim) color.lerp(new THREE.Color('#94a3b8'), 0.6);
      body.setColorAt(i, color);
      // refrigeration machinery at the door-opposite end
      dummy.position.set(p.x + BOX.length / 2 - 0.25, BOX.height / 2, p.z);
      dummy.updateMatrix();
      unit.setMatrixAt(i, dummy.matrix);

      const el = document.createElement('div');
      el.className = 'rounded-md bg-white/90 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-800 shadow ring-1 ring-slate-200 dark:bg-slate-900/90 dark:text-slate-100 dark:ring-slate-700';
      el.textContent = it.containerNo;
      const label = new CSS2DObject(el);
      label.position.set(p.x, BOX.height + 0.9, p.z);
      label.userData.lod = true;
      group.add(label);
      labels.push(label);

      if (it.beacon) {
        beaconPos.push(new THREE.Vector3(p.x, BOX.height + 2.4, p.z));
        beaconColor.push(BEACON[it.beacon]);
      }
    });
    if (!items.length) body.count = unit.count = 0;
    group.add(body, unit);

    let beacons: Built['beacons'] = null;
    if (beaconPos.length) {
      const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }), beaconPos.length);
      beaconColor.forEach((col, i) => mesh.setColorAt(i, col));
      group.add(mesh);
      beacons = { mesh, pos: beaconPos, color: beaconColor };
    }

    // Lane labels + painted lane outlines
    for (const g of groups) {
      const el = document.createElement('div');
      const item = items.find((i) => i.group === g.key);
      el.className = 'whitespace-nowrap rounded-full bg-slate-900/80 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur dark:bg-white/85 dark:text-slate-900';
      el.textContent = `${item?.groupLabel ?? g.key} · ${g.count}`;
      const lbl = new CSS2DObject(el);
      // In the aisle just in front of the lane, so labels of neighbouring lanes never collide.
      lbl.position.set(g.x + 4, 0.2, g.z - 3.5);
      group.add(lbl);
      labels.push(lbl);
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(g.width + 3, 0.02, g.depth + 3)),
        new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.55 }),
      );
      outline.position.set(g.x + g.width / 2, 0.03, g.z + g.depth / 2);
      group.add(outline);
    }

    c.scene.add(group);
    const radius = Math.max(25, Math.hypot(width, depth) / 2);
    const first = !c.built;
    const resized = c.built && Math.abs(c.built.radius - radius) > 5;
    c.built = { key, ids, body, unit, beacons, group, labels, radius };
    if (first || resized) applyPreset('iso');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const applyPreset = (p: Preset) => {
    const c = ctx.current;
    if (!c?.built) return;
    const r = c.built.radius;
    const vFov = THREE.MathUtils.degToRad(c.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * c.camera.aspect);
    // Per-view framing: top-down and front fill the frame more tightly than the perspective overview.
    const fit = { top: 0.72, front: 0.62, iso: 0.85 }[p];
    const dist = (r / Math.sin(Math.min(vFov, hFov) / 2)) * fit;
    const dir = p === 'top' ? new THREE.Vector3(0, 1, 0.001) : p === 'front' ? new THREE.Vector3(0, 0.42, 1) : new THREE.Vector3(0.9, 0.75, 1);
    c.camera.position.copy(dir.normalize().multiplyScalar(dist));
    c.controls.target.set(0, 0, 0);
    c.controls.update();
  };

  useEffect(() => {
    if (!controller) return;
    controller.current = { preset: applyPreset };
    return () => {
      controller.current = null;
    };
  });

  if (noGl) return <div className="grid h-full place-items-center p-8 text-center text-sm text-slate-500">3D needs WebGL, which this browser doesn’t provide. Use the dashboard or reefer list instead.</div>;

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="absolute inset-0" />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-56 animate-fade-in rounded-xl bg-white/95 p-3 text-xs shadow-lift ring-1 ring-slate-200 backdrop-blur dark:bg-slate-900/95 dark:ring-slate-700"
          style={{ left: Math.min(hover.x + 14, (host.current?.clientWidth ?? 9999) - 236), top: hover.y + 14 }}
        >
          <div className="font-mono text-sm font-semibold">{hover.item.tooltip.title}</div>
          {hover.item.tooltip.lines.map((l) => (
            <div key={l} className="mt-0.5 text-slate-600 dark:text-slate-300">
              {l}
            </div>
          ))}
          <div className="mt-1.5 text-[10px] text-slate-400">Click to open</div>
        </div>
      )}
    </div>
  );
}
