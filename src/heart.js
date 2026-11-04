import * as THREE from 'three';
import { SECTIONS } from './sections.js';
import traced from './heart-paths.json';

// The heart is the flat line drawing from design/heart-reference.png: every
// section is a set of thick strokes (ribbons) in its own color, covered in black
// until revealed. The black covering peels off along each stroke like tape: the
// curling band lifts toward the camera and fades. Image pixels are world units
// (y flipped so up is up).
const PEEL_WIDTH = 0.3; // fraction of a stroke that is curling at once
const STEP = 1.5; // ribbon sample spacing in image px
const BLACK = new THREE.Color('#121214');

const vert = /* glsl */ `
  attribute float aU;
  attribute vec2 aSide;
  uniform float uProgress;
  uniform float uW;
  varying float vT;
  void main() {
    float t = uProgress * (1.0 + uW) - aU;   // >0 behind the peel front
    vT = t;
    vec3 p = position;
    #ifdef FLAP
      float k = clamp(t / uW, 0.0, 1.0);
      float s = k * k * (3.0 - 2.0 * k);
      p.xy += aSide * s * 7.0;   // the lifted tape widens a little
      p.z += s * 70.0;           // and comes up off the page
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uBlack;
  uniform float uW;
  uniform float uHover;
  varying float vT;
  void main() {
    #ifdef FLAP
      if (vT <= 0.0 || vT >= uW) discard;
      float k = vT / uW;
      // the underside of the tape shows lighter as it curls over
      gl_FragColor = vec4(mix(uBlack, vec3(0.32), k), (1.0 - k) * 0.95);
    #else
      vec3 c = vT > 0.0 ? uColor : uBlack;
      c = mix(c, vec3(1.0), uHover * (vT > 0.0 ? 0.25 : 0.2));
      gl_FragColor = vec4(c, 1.0);
    #endif
    #include <colorspace_fragment>
  }
`;

// Smooth a traced polyline and resample it every STEP px.
function resample(points) {
  const v = points.map(([x, y]) => new THREE.Vector2(x, -y));
  if (v.length < 2) return v;
  const curve = new THREE.SplineCurve(v);
  const n = Math.max(2, Math.ceil(curve.getLength() / STEP));
  return curve.getSpacedPoints(n);
}

// Ribbon (and optional round end caps) for one stroke, with per-vertex peel
// position aU (0..1 along the stroke) and outward direction aSide.
function strokeGeometry(pts, width, [capStart, capEnd]) {
  const pos = [], side = [], u = [], idx = [];
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = len[len.length - 1] || 1;
  const r = width / 2;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = new THREE.Vector2().subVectors(b, a).normalize();
    const n = new THREE.Vector2(-t.y, t.x);
    for (const s of [1, -1]) {
      pos.push(pts[i].x + n.x * r * s, pts[i].y + n.y * r * s, 0);
      side.push(n.x * s, n.y * s);
      u.push(len[i] / total);
    }
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const cap = (c, uval) => {
    const base = pos.length / 3;
    pos.push(c.x, c.y, 0); side.push(0, 0); u.push(uval);
    const seg = 20;
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      pos.push(c.x + Math.cos(th) * r, c.y + Math.sin(th) * r, 0);
      side.push(Math.cos(th), Math.sin(th));
      u.push(uval);
      if (j > 0) idx.push(base, base + j, base + j + 1);
    }
  };
  if (capStart) cap(pts[0], 0);
  if (capEnd) cap(pts[pts.length - 1], 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 2));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(u, 1));
  g.setIndex(idx);
  return g;
}

function distToSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

export function createHeart(container, { onHover, onSelect }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(20, 1, 10, 10000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const W = traced.width, H = traced.height;
  const heart = new THREE.Group();
  heart.position.set(-W / 2, H / 2, 0); // center the drawing on the origin
  scene.add(heart);

  const state = new Map();
  for (const [order, sec] of SECTIONS.entries()) {
    const data = traced.sections[sec.id];
    if (!data) continue;
    const uniforms = {
      uProgress: { value: 0 }, uW: { value: PEEL_WIDTH }, uHover: { value: 0 },
      uColor: { value: new THREE.Color(sec.color) }, uBlack: { value: BLACK },
    };
    const base = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms });
    const flap = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms, defines: { FLAP: '' },
      transparent: true, depthWrite: false,
    });
    const strokes = [];
    const meshes = [];
    for (const path of data.paths) {
      const pts = resample(path.p);
      if (pts.length < 2) continue;
      const geo = strokeGeometry(pts, data.stroke, path.cap);
      const mesh = new THREE.Mesh(geo, base);
      mesh.position.z = order * 0.01; // stable overlap order between sections
      meshes.push(mesh);
      const lift = new THREE.Mesh(geo, flap);
      lift.renderOrder = 1;
      heart.add(mesh, lift);
      strokes.push(pts);
    }
    state.set(sec.id, { sec, uniforms, strokes, meshes, order, half: data.stroke / 2, anim: null, revealed: false, hover: 0, hoverTarget: 0 });
  }

  // Revealed sections sit above covered ones, so where two strokes butt
  // together the color wins over its neighbour's black end.
  const raise = (e, up) => { for (const m of e.meshes) m.position.z = e.order * 0.01 + (up ? 1 : 0); };

  // ---- interaction: hit-test in image space against the stroke centerlines ----
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hitPoint = new THREE.Vector3();
  let hoverId = null;
  let downAt = null;

  function pick(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hitPoint)) return null;
    const p = new THREE.Vector2(hitPoint.x - heart.position.x, hitPoint.y - heart.position.y);
    // fingers get a more generous target than a mouse pointer
    const slop = (ev.pointerType === 'mouse' ? 3 : 10) * (H / rect.height);
    let best = null, bestD = Infinity;
    for (const [id, e] of state) {
      for (const pts of e.strokes) {
        for (let i = 1; i < pts.length; i += 1) {
          const d = distToSegment(p, pts[i - 1], pts[i]) - e.half;
          if (d < bestD) { bestD = d; best = id; }
        }
      }
    }
    return bestD <= slop ? best : null;
  }
  function setHover(id, ev) {
    if (hoverId && hoverId !== id) state.get(hoverId).hoverTarget = 0;
    hoverId = id;
    if (id) state.get(id).hoverTarget = 1;
    renderer.domElement.style.cursor = id ? 'pointer' : 'default';
    onHover?.(id, ev);
  }
  const el = renderer.domElement;
  // Hover is mouse-only; on touch a tap selects and the tip stays until the next tap.
  el.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') setHover(pick(ev), ev); });
  el.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') setHover(null); });
  el.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
  el.addEventListener('pointercancel', () => { downAt = null; });
  el.addEventListener('pointerup', (ev) => {
    if (downAt && Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) < 8) {
      const id = pick(ev);
      setHover(id, ev);
      onSelect?.(id, ev);
    }
    downAt = null;
  });

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // fit the drawing with a margin
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max((H * 1.08) / (2 * tan), (W * 1.12) / (2 * tan * camera.aspect));
    camera.position.set(0, 0, d);
    camera.lookAt(0, 0, 0);
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // ---- loop ----
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  function frame() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    for (const e of state.values()) {
      if (e.anim) {
        e.anim.elapsed += dt;
        const k = THREE.MathUtils.clamp((e.anim.elapsed - e.anim.delay) / e.anim.duration, 0, 1);
        e.uniforms.uProgress.value = k;
        if (k >= 1) e.anim = null;
      }
      e.hover += (e.hoverTarget - e.hover) * Math.min(1, dt * 12);
      e.uniforms.uHover.value = e.hover;
    }
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
      raise(e, true);
      if (reduced) { e.uniforms.uProgress.value = 1; return; }
      e.anim = { elapsed: 0, delay, duration: 2.4 };
    },
    /** Put a section back under its black covering. */
    cover(id) {
      const e = state.get(id);
      if (!e) return;
      e.revealed = false;
      raise(e, false);
      e.anim = null;
      e.uniforms.uProgress.value = 0;
    },
    isRevealed: (id) => !!state.get(id)?.revealed,
    highlight(id) {
      setHover(id, null);
    },
  };
}
