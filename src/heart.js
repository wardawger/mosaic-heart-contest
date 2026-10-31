import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SECTIONS, CORONARIES } from './sections.js';

// The heart is drawn as outlines only: each volume gets an invisible depth-only fill plus an inverted hull (back faces pushed out along the
// normals) that shows up as a line around its silhouette.
const OUTLINE = 0.075; // outline thickness in world units
const VALVE_R = 0.05; // valve ring tube radius
const PEEL_WIDTH = 0.3; // fraction of a section that is curling at once
const BLACK = new THREE.Color('#121214');

const vert = /* glsl */ `
  attribute float aU;
  uniform float uProgress;
  uniform float uW;
  uniform float uThick;
  uniform float uLift;
  varying float vT;
  void main() {
    float t = uProgress * (1.0 + uW) - aU;   // >0 behind the peel front
    vT = t;
    vec3 p = position + normal * uThick;
    #ifdef FLAP
      float k = clamp(t / uW, 0.0, 1.0);
      p += normal * (k * k * (3.0 - 2.0 * k)) * uLift;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uBlack;
  uniform float uW;
  uniform float uHover;
  uniform float uAlpha;
  varying float vT;
  void main() {
    #ifdef FLAP
      if (vT <= 0.0 || vT >= uW) discard;
      float k = vT / uW;
      gl_FragColor = vec4(uBlack + 0.12 * k, (1.0 - k) * 0.9);
    #else
      vec3 c = vT > 0.0 ? uColor : uBlack;
      c = mix(c, vec3(1.0), uHover * (vT > 0.0 ? 0.25 : 0.18));
      gl_FragColor = vec4(c, uAlpha);
    #endif
    #include <colorspace_fragment>
  }
`;

// Dividing lines between chambers: an offscreen pass writes, per pixel, which
// section is visible (r), whether the peel has passed that spot (g), hover (b)
// and view depth (a). A full-screen overlay then draws a line wherever two
// chambers (atria / ventricles) meet at about the same depth, each half in its
// own section's state. Vessels and valves don't get dividers.
const OCCLUDER = 200; // outlines and valves: block dividers, never get one
const idVert = /* glsl */ `
  attribute float aU;
  uniform float uProgress;
  uniform float uW;
  uniform float uThick;
  varying float vT;
  varying float vDepth;
  void main() {
    vT = uProgress * (1.0 + uW) - aU;
    vec4 mv = modelViewMatrix * vec4(position + normal * uThick, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const idFrag = /* glsl */ `
  uniform float uId;
  uniform float uHover;
  varying float vT;
  varying float vDepth;
  void main() { gl_FragColor = vec4(uId, vT > 0.0 ? 1.0 : 0.0, uHover, vDepth); }
`;
const dividerFrag = /* glsl */ `
  uniform sampler2D tId;
  uniform vec2 uTexel;
  uniform float uRadius;
  uniform vec3 uPalette[${SECTIONS.length + 1}];
  uniform float uChamber[${SECTIONS.length + 1}];
  uniform vec3 uBlack;
  varying vec2 vUv;
  bool isSection(float id) { return id > 0.5 && id < ${OCCLUDER - 1}.0; }
  bool isChamber(float id) { return isSection(id) && uChamber[int(id + 0.5)] > 0.5; }
  void main() {
    vec4 c = texture2D(tId, vUv);
    if (!isChamber(c.r)) discard;
    bool edge = false;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5235988;
      for (int j = 1; j <= 2; j++) {
        vec2 off = vec2(cos(a), sin(a)) * uRadius * float(j) * 0.3 * uTexel;
        vec4 n = texture2D(tId, vUv + off);
        if (isChamber(n.r) && abs(n.r - c.r) > 0.5 && abs(n.a - c.a) < 0.6) edge = true;
      }
    }
    if (!edge) discard;
    vec3 col = c.g > 0.5 ? uPalette[int(c.r + 0.5)] : uBlack;
    col = mix(col, vec3(1.0), c.b * (c.g > 0.5 ? 0.25 : 0.18));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// ---- geometry helpers (all geometry is baked into world space) ----
function finish(geo) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  const g = mergeVertices(geo);
  g.computeVertexNormals();
  return g;
}
function setU(geo, fn) {
  const pos = geo.attributes.position;
  const a = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) a[i] = fn(v.fromBufferAttribute(pos, i), i);
  geo.setAttribute('aU', new THREE.BufferAttribute(a, 1));
  return geo;
}
function tubeGeo(curve, r, segs, closed = false) {
  const g = new THREE.TubeGeometry(curve, segs, r, 16, closed);
  setU(g, (_, i) => g.attributes.uv.getX(i));
  return finish(g);
}
function sphereGeo(r, center, u) {
  const g = finish(new THREE.SphereGeometry(r, 24, 16));
  g.translate(center.x, center.y, center.z);
  return setU(g, () => u);
}
function chamberGeo({ c, r, rot, taper, axis }) {
  const g = finish(new THREE.SphereGeometry(1, 56, 40));
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) {
      const s = 1 + y * taper;
      pos.setX(i, pos.getX(i) * s);
      pos.setZ(i, pos.getZ(i) * s);
    }
  }
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(...c),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...r),
  ));
  g.computeVertexNormals();
  const a = new THREE.Vector3(...axis[0]);
  const ab = new THREE.Vector3(...axis[1]).sub(a);
  const len2 = ab.lengthSq();
  const tmp = new THREE.Vector3();
  return setU(g, (p) => THREE.MathUtils.clamp(tmp.copy(p).sub(a).dot(ab) / len2, 0, 1));
}
class Ring extends THREE.Curve {
  constructor(c, n, R) {
    super();
    this.c = new THREE.Vector3(...c);
    const nn = new THREE.Vector3(...n).normalize();
    this.a = new THREE.Vector3(0, 0, 1).cross(nn);
    if (this.a.lengthSq() < 1e-4) this.a.set(1, 0, 0);
    this.a.normalize();
    this.b = nn.clone().cross(this.a).normalize();
    this.R = R;
  }
  getPoint(t, out = new THREE.Vector3()) {
    const th = t * Math.PI * 2;
    return out.copy(this.c).addScaledVector(this.a, Math.cos(th) * this.R).addScaledVector(this.b, Math.sin(th) * this.R);
  }
}

export function createHeart(container, { onHover, onSelect }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 2.6;
  controls.autoRotate = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  controls.autoRotateSpeed = 0.7;
  let idleTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener('end', () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { controls.autoRotate = !reduced; }, 6000);
  });

  const heart = new THREE.Group();
  heart.position.y = -0.75;
  heart.rotation.y = -0.15;
  scene.add(heart);

  // Depth-only fill: invisible (the page background shows through) but it still
  // hides outlines behind each volume. Drawn first so it occludes everything later.
  const fillMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

  const state = new Map();
  const pickables = [];

  function material(uniforms, opts) {
    return new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      defines: opts.flap ? { FLAP: '' } : {},
      side: opts.side,
      transparent: !!opts.transparent,
      depthWrite: !opts.transparent,
      depthFunc: opts.depthFunc ?? THREE.LessEqualDepth,
      uniforms: {
        uProgress: uniforms.uProgress, uW: uniforms.uW, uHover: uniforms.uHover,
        uColor: uniforms.uColor, uBlack: uniforms.uBlack,
        uThick: { value: opts.thick }, uLift: { value: opts.lift ?? 0 }, uAlpha: { value: opts.alpha ?? 1 },
      },
    });
  }

  const idMaterial = (uniforms, id, opts) => new THREE.ShaderMaterial({
    vertexShader: idVert,
    fragmentShader: idFrag,
    side: opts.side,
    uniforms: {
      uProgress: uniforms.uProgress, uW: uniforms.uW, uHover: uniforms.uHover,
      uThick: { value: opts.thick }, uId: { value: id },
    },
  });
  const palette = [BLACK.clone(), ...SECTIONS.map((s) => new THREE.Color(s.color))];

  SECTIONS.forEach((sec, si) => {
    const uniforms = {
      uProgress: { value: 0 }, uW: { value: PEEL_WIDTH }, uHover: { value: 0 },
      uColor: { value: new THREE.Color(sec.color) }, uBlack: { value: BLACK },
    };
    const entry = { sec, uniforms, anim: null, revealed: false, hover: 0, hoverTarget: 0 };
    state.set(sec.id, entry);
    const sh = sec.shape;
    const add = (mesh, pick, idMat = null) => {
      mesh.userData.sectionId = sec.id;
      mesh.userData.idMat = idMat;
      heart.add(mesh);
      if (pick) pickables.push(mesh);
    };

    if (sh.kind === 'valve') {
      const geo = tubeGeo(new Ring(sh.c, sh.n, sh.R), VALVE_R, 96, true);
      add(new THREE.Mesh(geo, material(uniforms, { side: THREE.FrontSide, thick: 0 })), true,
        idMaterial(uniforms, OCCLUDER, { side: THREE.FrontSide, thick: 0 }));
      add(new THREE.Mesh(geo, material(uniforms, { side: THREE.FrontSide, thick: 0.01, lift: 0.35, flap: true, transparent: true })));
      // faint x-ray pass so valves inside the heart can still be found
      const ghost = new THREE.Mesh(geo, material(uniforms, { side: THREE.FrontSide, thick: 0, transparent: true, alpha: 0.18, depthFunc: THREE.GreaterDepth }));
      ghost.renderOrder = 2;
      add(ghost);
      return;
    }

    const geos = [];
    if (sh.kind === 'chamber') geos.push(chamberGeo(sh));
    else {
      sh.paths.forEach((pts, i) => {
        const r = sh.radii?.[i] ?? sh.r;
        const v = pts.map((p) => new THREE.Vector3(...p));
        const curve = new THREE.CatmullRomCurve3(v, false, 'catmullrom', 0.5);
        geos.push(tubeGeo(curve, r, Math.max(60, pts.length * 24)));
        geos.push(sphereGeo(r, v[0], 0), sphereGeo(r, v[v.length - 1], 1));
      });
    }
    for (const geo of geos) {
      const fill = new THREE.Mesh(geo, fillMat);
      fill.renderOrder = -1;
      add(fill, true, idMaterial(uniforms, si + 1, { side: THREE.FrontSide, thick: 0 }));
      add(new THREE.Mesh(geo, material(uniforms, { side: THREE.BackSide, thick: OUTLINE })), false,
        idMaterial(uniforms, OCCLUDER, { side: THREE.BackSide, thick: OUTLINE }));
      add(new THREE.Mesh(geo, material(uniforms, { side: THREE.BackSide, thick: OUTLINE, lift: 0.45, flap: true, transparent: true })));
    }
  });

  // ---- coronary arteries (decorative) ----
  // Sample each guide curve, project every sample onto the chamber surfaces by
  // casting a ray from outside toward the heart's core, smooth the result, then
  // run a thin black tube through it. Trunks start at the aortic root; branches
  // start exactly on their parent. They block chamber dividers underneath.
  {
    // Rays are tested against the chamber shapes analytically (the same egg
    // shapes chamberGeo builds) rather than their meshes: thousands of mesh
    // raycasts would stall page load on phones.
    const shapes = SECTIONS.filter((x) => x.shape.kind === 'chamber').map(({ id, shape: c }) => {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(...c.c),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...c.rot)),
        new THREE.Vector3(...c.r),
      );
      return { id, inv: m.invert(), taper: c.taper, center: new THREE.Vector3(...c.c), R: Math.max(...c.r) * 1.05 };
    });
    const q = new THREE.Vector3();
    const inside = (sh, p) => {
      q.copy(p).applyMatrix4(sh.inv);
      const k = q.y < 0 ? 1 + q.y * sh.taper : 1;
      return (q.x / k) ** 2 + q.y ** 2 + (q.z / k) ** 2 <= 1;
    };
    const pt = new THREE.Vector3();
    const oc = new THREE.Vector3();
    // first surface hit along origin + t * d (d normalized), or null
    const hitShape = (sh, o, d) => {
      oc.copy(o).sub(sh.center);
      const b = oc.dot(d);
      const disc = b * b - (oc.lengthSq() - sh.R * sh.R);
      if (disc < 0) return null;
      const t0 = Math.max(0, -b - Math.sqrt(disc));
      const t1 = -b + Math.sqrt(disc);
      const step = 0.02;
      for (let t = t0 + step; t <= t1; t += step) {
        if (!inside(sh, pt.copy(o).addScaledVector(d, t))) continue;
        let lo = t - step, hi = t;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          if (inside(sh, pt.copy(o).addScaledVector(d, mid))) hi = mid; else lo = mid;
        }
        return hi;
      }
      return null;
    };
    const dir = new THREE.Vector3();
    const cast = (p) => {
      const core = new THREE.Vector3(0.2, p.y, -0.4);
      dir.copy(core).sub(p).normalize();
      const origin = core.clone().addScaledVector(dir, -8);
      let best = null;
      for (const sh of shapes) {
        const t = hitShape(sh, origin, dir);
        if (t !== null && (!best || t < best.t)) best = { t, id: sh.id };
      }
      return best ? { point: origin.addScaledVector(dir, best.t), id: best.id, dir: dir.clone() } : null;
    };
    // sit the tube about half way out of the surface
    const project = (p, r) => {
      const h = cast(p);
      return h ? h.point.addScaledVector(h.dir, -r * 0.5) : null;
    };
    // Slide sideways from p (along x or y) to the nearest spot where the surface
    // changes from chamber a to chamber b; null if they don't meet nearby.
    const toGroove = (p, [a, b, axis], r) => {
      const at = (d) => { const q = p.clone(); q[axis] += d; return cast(q); };
      let best = null;
      for (const sign of [1, -1]) {
        let prev = at(0);
        for (let d = 0.03; d <= 0.9 && (!best || d < best.d); d += 0.03) {
          const cur = at(sign * d);
          if (prev && cur && prev.id !== cur.id && [a, b].includes(prev.id) && [a, b].includes(cur.id)) {
            best = { d, h: at(sign * (d - 0.015)) };
            break;
          }
          prev = cur;
        }
      }
      return best?.h ? best.h.point.addScaledVector(best.h.dir, -r * 0.5) : null;
    };
    const smooth = (pts, passes) => {
      for (let k = 0; k < passes; k++) {
        for (let i = 1; i < pts.length - 1; i++) {
          pts[i] = pts[i - 1].clone().add(pts[i + 1]).multiplyScalar(0.25).addScaledVector(pts[i], 0.5);
        }
      }
      return pts;
    };
    const coronaryMat = new THREE.MeshBasicMaterial({ color: BLACK });
    const still = { uProgress: { value: 0 }, uW: { value: PEEL_WIDTH }, uHover: { value: 0 } };
    const coronaryId = idMaterial(still, OCCLUDER, { side: THREE.FrontSide, thick: 0 });
    const curves = {};

    for (const { id, r, root, from, groove, pts } of CORONARIES) {
      const start = root ? new THREE.Vector3(...root) : curves[from.id]?.getPoint(from.t);
      if (!start) continue;
      const guide = new THREE.CatmullRomCurve3([start, ...pts.map((p) => new THREE.Vector3(...p))]);
      const n = 40;
      const line = [start.clone()];
      for (let i = 1; i <= n; i++) {
        const g = guide.getPoint(i / n);
        const p = (groove && toGroove(g, groove, r)) || project(g, r);
        if (p) line.push(p);
      }
      if (line.length < 4) continue;
      smooth(line, 4);
      const curve = new THREE.CatmullRomCurve3(line, false, 'centripetal');
      curves[id] = curve;
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, line.length * 4, r, 8, false), coronaryMat);
      tube.userData.idMat = coronaryId;
      heart.add(tube);
      for (const end of [0, 1]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), coronaryMat);
        cap.position.copy(curve.getPoint(end));
        cap.userData.idMat = coronaryId;
        heart.add(cap);
      }
    }
  }

  // ---- divider pass ----
  const idTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: dividerFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tId: { value: idTarget.texture }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 3 },
      uPalette: { value: palette }, uBlack: { value: BLACK },
      uChamber: { value: [0, ...SECTIONS.map((s) => (s.shape.kind === 'chamber' ? 1 : 0))] },
    },
  }));
  const overlayScene = new THREE.Scene();
  overlayScene.add(overlay);
  const swapped = [];
  function renderDividers() {
    heart.traverse((m) => {
      if (!m.isMesh) return;
      swapped.push([m, m.material, m.visible]);
      if (m.userData.idMat) m.material = m.userData.idMat;
      else m.visible = false;
    });
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(idTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clear, alpha);
    for (const [m, mat, vis] of swapped) { m.material = mat; m.visible = vis; }
    swapped.length = 0;
    renderer.autoClear = false;
    renderer.render(overlayScene, overlayCam);
    renderer.autoClear = true;
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
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.sectionId : null;
  }
  function setHover(id, ev) {
    if (hoverId && hoverId !== id) state.get(hoverId).hoverTarget = 0;
    hoverId = id;
    if (id) state.get(id).hoverTarget = 1;
    renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    onHover?.(id, ev);
  }
  // Hover is mouse-only; on touch a tap selects and the tip stays until the next tap.
  renderer.domElement.addEventListener('pointermove', (ev) => { if (!downAt && ev.pointerType === 'mouse') setHover(pick(ev), ev); });
  renderer.domElement.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') setHover(null); });
  renderer.domElement.addEventListener('pointercancel', () => { downAt = null; });
  renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (downAt && Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) < 6) {
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
    const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
    idTarget.setSize(buf.x, buf.y);
    overlay.material.uniforms.uTexel.value.set(1 / buf.x, 1 / buf.y);
    // match the hull outline width: OUTLINE world units at the camera distance, in buffer px
    overlay.material.uniforms.uRadius.value = Math.max(2, buf.y * OUTLINE / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 15));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(8.8 / (2 * tan), 7.6 / (2 * tan * camera.aspect));
    camera.position.setLength(d);
    if (camera.position.lengthSq() === 0) camera.position.set(0, 0, d);
    controls.minDistance = d * 0.5;
    controls.maxDistance = d * 1.8;
  }
  camera.position.set(0, 0.8, 1);
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
    controls.update(dt);
    renderer.render(scene, camera);
    renderDividers();
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
    /** Put a section back under its black outline. */
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
