import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SECTIONS } from './sections.js';

const R_INNER = 0.15;
const R_SHELL = 0.185;
const PEEL_WIDTH = 0.35; // fraction of the path that is "curling" at once

// Map image px -> world units, with a soft bulge so the heart has depth.
function toWorld([x, y]) {
  const nx = (x - 236) / 250;
  const ny = (y - 340) / 330;
  const z = 1.1 * Math.max(0, 1 - nx * nx - ny * ny) - 0.3;
  return new THREE.Vector3((x - 236) / 60, -(y - 340) / 60, z);
}

const shellVert = /* glsl */ `
  attribute float aU;
  uniform float uProgress;
  uniform float uDir;
  uniform float uW;
  varying float vT;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float u = uDir > 0.5 ? 1.0 - aU : aU;
    float t = uProgress * (1.0 + uW) - u;     // <0 intact, 0..uW curling, >uW gone
    float k = clamp(t / uW, 0.0, 1.0);
    vT = k;
    vec3 p = position;
    float lift = k * k * (3.0 - 2.0 * k);
    p += normal * lift * 0.5;
    p += vec3(0.25 * lift, 0.35 * lift, 1.1 * lift);
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const shellFrag = /* glsl */ `
  uniform float uHover;
  varying float vT;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    if (vT >= 0.999) discard;
    vec3 n = normalize(vN);
    float rim = pow(1.0 - abs(dot(n, vView)), 2.5);
    float spec = pow(max(dot(reflect(-vView, n), normalize(vec3(0.4, 0.7, 0.6))), 0.0), 24.0);
    vec3 c = vec3(0.035) + vec3(0.16) * rim + vec3(0.35) * spec + vec3(0.1) * uHover;
    gl_FragColor = vec4(c, 1.0 - vT);
  }
`;

export function createHeart(container, { onHover, onSelect }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 23);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c0d8, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 6, 9);
  scene.add(key);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 14;
  controls.maxDistance = 40;
  controls.minAzimuthAngle = -0.9;
  controls.maxAzimuthAngle = 0.9;
  controls.minPolarAngle = 1.0;
  controls.maxPolarAngle = 2.1;

  const heart = new THREE.Group();
  scene.add(heart);

  const state = new Map(); // id -> { uniforms, inner materials, progress, target, ... }
  const pickables = [];

  for (const sec of SECTIONS) {
    const uniforms = { uProgress: { value: 0 }, uDir: { value: 0 }, uW: { value: PEEL_WIDTH }, uHover: { value: 0 } };
    const innerMat = new THREE.MeshStandardMaterial({
      color: sec.color, roughness: 0.35, metalness: 0.05, emissive: new THREE.Color(sec.color), emissiveIntensity: 0,
    });
    const entry = { sec, uniforms, innerMat, shells: [], anim: null, revealed: false, hover: 0, hoverTarget: 0 };
    state.set(sec.id, entry);

    sec.paths.forEach((pts, pi) => {
      const curve = new THREE.CatmullRomCurve3(pts.map(toWorld), false, 'catmullrom', 0.4);
      const segs = Math.max(48, pts.length * 14);
      const shellMat = new THREE.ShaderMaterial({
        vertexShader: shellVert, fragmentShader: shellFrag, transparent: true, depthWrite: true,
        uniforms: { ...uniforms, uDir: { value: pi % 2 } },
      });
      // share progress/hover by reference through a per-path wrapper
      shellMat.uniforms.uProgress = uniforms.uProgress;
      shellMat.uniforms.uHover = uniforms.uHover;
      shellMat.uniforms.uW = uniforms.uW;

      const addAU = (geo, fn) => {
        const pos = geo.attributes.position;
        const a = new Float32Array(pos.count);
        for (let i = 0; i < pos.count; i++) a[i] = fn(i);
        geo.setAttribute('aU', new THREE.BufferAttribute(a, 1));
      };

      const innerGeo = new THREE.TubeGeometry(curve, segs, R_INNER, 14, false);
      const shellGeo = new THREE.TubeGeometry(curve, segs, R_SHELL, 14, false);
      addAU(shellGeo, (i) => shellGeo.attributes.uv.getX(i));

      const meshes = [new THREE.Mesh(innerGeo, innerMat), new THREE.Mesh(shellGeo, shellMat)];
      // rounded end caps
      [0, 1].forEach((end) => {
        const p = curve.getPoint(end);
        const capIn = new THREE.Mesh(new THREE.SphereGeometry(R_INNER, 14, 10), innerMat);
        const capGeo = new THREE.SphereGeometry(R_SHELL, 14, 10);
        addAU(capGeo, () => end);
        const capSh = new THREE.Mesh(capGeo, shellMat);
        capIn.position.copy(p);
        capSh.position.copy(p);
        meshes.push(capIn, capSh);
      });
      meshes.forEach((m) => {
        m.userData.sectionId = sec.id;
        heart.add(m);
        pickables.push(m);
      });
      entry.shells.push(shellMat);
    });

    // Pulmonary artery opening ring
    if (sec.id === 'pulmonary-artery') {
      const ringGeo = new THREE.TorusGeometry(0.28, 0.07, 10, 28);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: '#0b0b0b', roughness: 0.4 }));
      ring.position.copy(toWorld([428, 156]));
      ring.rotation.set(0.1, 1.2, 0.4);
      heart.add(ring);
    }
  }

  // ---- interaction ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoverId = null;
  let downAt = null;

  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false).find((h) => {
      const e = state.get(h.object.userData.sectionId);
      // fully-peeled shells shouldn't block; inner tube always hittable
      return h.object.geometry && (e.uniforms.uProgress.value < 0.99 || h.object.material === e.innerMat);
    });
    return hit ? hit.object.userData.sectionId : null;
  }
  function setHover(id, ev) {
    if (hoverId && hoverId !== id) state.get(hoverId).hoverTarget = 0;
    hoverId = id;
    if (id) state.get(id).hoverTarget = 1;
    renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    onHover?.(id, ev);
  }
  renderer.domElement.addEventListener('pointermove', (ev) => setHover(pick(ev), ev));
  renderer.domElement.addEventListener('pointerleave', () => setHover(null));
  renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (downAt && Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) < 6) {
      const id = pick(ev);
      setHover(id, ev);
      onSelect?.(id, ev);
    }
  });

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.position.z = Math.max(23, 23 * (0.9 / camera.aspect));
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // ---- loop ----
  let last = performance.now(), elapsed = 0;
  let reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function frame() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now; elapsed += dt;
    const t = elapsed;
    heart.rotation.y = Math.sin(t * 0.4) * 0.08;
    for (const e of state.values()) {
      if (e.anim) {
        e.anim.elapsed += dt;
        const k = (e.anim.elapsed - e.anim.delay) / e.anim.duration;
        const c = Math.min(Math.max(k, 0), 1);
        e.uniforms.uProgress.value = c;
        if (c >= 1) e.anim = null;
      }
      e.hover += (e.hoverTarget - e.hover) * Math.min(1, dt * 12);
      e.uniforms.uHover.value = e.hover;
      e.innerMat.emissiveIntensity = e.revealed ? e.hover * 0.45 : 0;
    }
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();

  return {
    /** Play the peel animation for a section (delay in seconds). */
    peel(id, delay = 0) {
      const e = state.get(id);
      if (!e || e.revealed) return;
      e.revealed = true;
      if (reduced) { e.uniforms.uProgress.value = 1; return; }
      e.anim = { elapsed: 0, delay, duration: 2.4 };
    },
    /** Put a section back under its black cover. */
    cover(id) {
      const e = state.get(id);
      if (!e) return;
      e.revealed = false;
      e.anim = null;
      e.uniforms.uProgress.value = 0;
    },
    isRevealed: (id) => !!state.get(id)?.revealed,
    highlight(id) {
      setHover(id, null);
    },
  };
}
