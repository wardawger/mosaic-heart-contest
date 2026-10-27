// Animated grayscale gradient background: a few large, blurred radial blobs
// orbit the center and lighten each other where they overlap (screen blend).
// The first blob leans toward the pointer. Kept mid-gray overall so the heart's
// black outlines stay readable.

const BLOBS = [
  { gray: 0.42, follow: 0.35 },
  { gray: 0.30, follow: 0.3 },
  { gray: 0.36, follow: 0.15 },
  { gray: 0.24, follow: 0.1 },
  { gray: 0.33, follow: 0.08 },
];
const LOOP_SECONDS = 16;
const ORBIT = 0.28; // orbit radius as a fraction of the shorter side

export function startBackground(el) {
  const blobs = BLOBS.map((b, i) => {
    const d = document.createElement('div');
    const g = Math.round(b.gray * 255);
    const c = `rgb(${g},${g},${g})`;
    d.style.background = `radial-gradient(circle, ${c} 0%, ${c} 22%, rgba(0,0,0,0) 60%)`;
    el.append(d);
    // each blob gets its own phase, orbit shape and speed so the motion never lines up
    return { el: d, ...b, phase: (i / BLOBS.length) * Math.PI * 2, wobble: 0.6 + i * 0.17, dir: i % 2 ? -1 : 1 };
  });

  let w = 0, h = 0, size = 0;
  function resize() {
    w = el.clientWidth;
    h = el.clientHeight;
    size = Math.max(w, h) * 1.5;
    for (const b of blobs) {
      b.el.style.width = b.el.style.height = size + 'px';
      b.el.style.marginLeft = b.el.style.marginTop = -size / 2 + 'px';
    }
  }
  new ResizeObserver(resize).observe(el);
  resize();

  // pointer target in -0.5..0.5 of the viewport, eased toward
  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / innerWidth - 0.5;
    pointer.y = e.clientY / innerHeight - 0.5;
  }, { passive: true });

  function place(t) {
    const r = Math.min(w, h) * ORBIT;
    for (const b of blobs) {
      const a = b.dir * t + b.phase;
      // mix a circle with a slower figure-eight so the paths feel organic
      const x = Math.cos(a) * r * 0.7 + Math.sin(a * b.wobble + b.phase) * r * 0.3;
      const y = Math.sin(a) * r * 0.55 + Math.sin(2 * a * b.wobble) * r * 0.3;
      const fx = eased.x * w * b.follow;
      const fy = eased.y * h * b.follow;
      b.el.style.transform = `translate3d(${w / 2 + x + fx}px, ${h / 2 + y + fy}px, 0)`;
    }
  }

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    place(0);
    return;
  }
  const speed = (Math.PI * 2) / LOOP_SECONDS;
  let t = 0;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!document.hidden) {
      t += dt * speed;
      eased.x += (pointer.x - eased.x) * Math.min(1, dt * 3);
      eased.y += (pointer.y - eased.y) * Math.min(1, dt * 3);
      place(t);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
