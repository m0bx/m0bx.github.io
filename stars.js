/* Interactive star field. Moving the pointer makes nearby stars dissolve and
   drift away like vapour; they slowly re-form afterwards. No dependencies. */
(() => {
  const canvas = document.getElementById("starfield");
  const ctx = canvas && canvas.getContext("2d");
  if (!ctx) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLORS = ["255,255,255", "219,234,254", "186,230,253"];
  const pointer = { x: 0, y: 0, px: 0, py: 0, active: false, moved: false };
  let w = 0, h = 0, radius = 100, stars = [], last = 0;

  function build() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    radius = Math.max(90, Math.min(170, w * 0.12));
    const count = Math.min(1100, Math.round((w * h) / 2200));
    stars = Array.from({ length: count }, () => {
      const x = Math.random() * w, y = Math.random() * h;
      return {
        hx: x, hy: y, x, y, vx: 0, vy: 0, ev: 0,
        r: 0.35 + Math.pow(Math.random(), 4) * 1.5,
        a: 0.25 + Math.random() * 0.6,
        ph: Math.random() * 6.283, sp: 0.4 + Math.random() * 1.2,
        c: COLORS[(Math.random() * COLORS.length) | 0],
      };
    });
  }

  function disturb(x, y) {
    const r2 = radius * radius;
    for (const s of stars) {
      const dx = s.x - x, dy = s.y - y, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 0.001, k = 1 - d / radius;
      s.ev = Math.min(1, s.ev + k * 0.6);
      s.vx += (dx / d) * k * 2.2 + (Math.random() - 0.5) * 0.5;
      s.vy += (dy / d) * k * 2.2 - k * 0.7 + (Math.random() - 0.5) * 0.5; // slight upward lift
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const twinkle = reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(t * 0.001 * s.sp + s.ph);
      const alpha = s.a * twinkle * (1 - s.ev * 0.92);
      if (alpha < 0.02) continue;
      ctx.fillStyle = `rgba(${s.c},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (1 + s.ev * 0.6), 0, 6.283);
      ctx.fill();
    }
  }

  function frame(now) {
    const f = Math.min(2.5, (now - last) / 16.67 || 1);
    last = now;
    if (pointer.moved) { // sweep along the path so fast movement leaves no gaps
      const dx = pointer.x - pointer.px, dy = pointer.y - pointer.py;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (radius / 3)));
      for (let i = 1; i <= steps; i += 1) disturb(pointer.px + (dx * i) / steps, pointer.py + (dy * i) / steps);
      pointer.px = pointer.x; pointer.py = pointer.y; pointer.moved = false;
    }
    const damp = Math.pow(0.94, f);
    for (const s of stars) {
      const spring = 0.0008 + (1 - s.ev) * 0.003; // re-forms slowly while still faded
      s.vx += (s.hx - s.x) * spring * f;
      s.vy += (s.hy - s.y) * spring * f;
      s.vx *= damp; s.vy *= damp;
      s.x += s.vx * f; s.y += s.vy * f;
      s.ev = Math.max(0, s.ev - 0.003 * f);
    }
    draw(now);
    requestAnimationFrame(frame);
  }

  let resizeTimer = 0, lastW = window.innerWidth, lastH = window.innerHeight;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Ignore small height changes (mobile address bar) to avoid reshuffling the stars.
      if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 120) return;
      lastW = window.innerWidth; lastH = window.innerHeight;
      build();
      if (reduceMotion) draw(0);
    }, 150);
  });

  build();
  if (reduceMotion) { draw(0); return; }

  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY;
    if (!pointer.active) { pointer.px = pointer.x; pointer.py = pointer.y; pointer.active = true; }
    pointer.moved = true;
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { pointer.active = false; pointer.moved = false; });
  requestAnimationFrame(frame);
})();
