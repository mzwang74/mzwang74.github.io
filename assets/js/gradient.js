/* Gradient: a smooth navy field with silver-blue crests and a faint violet tint,
   drawn with react-three-fiber + Three.js under the water dots on every page.

   Synced to the dots: the shader runs the same surface() waves as water.js, in
   the water canvas's CSS-pixel space. The clock is shared both ways:
   - while water.js is animating, this follows window.__waterTime;
   - while water is stopped but not paused (scrolled away, covered), this keeps
     its own clock and publishes window.__gradientTime, which water.js catches
     up to when it starts again (its dots are off-screen then, so the jump is
     invisible).
   Pause water and prefers-reduced-motion freeze both layers. On pages without
   a water canvas, this script runs the pause button itself.
   If WebGL2 or the CDN fails, .gradient keeps its static CSS fallback. */

const V = { react: '19.2.0', three: '0.180.0', fiber: '9.4.0' };
const PIN = `react@${V.react},react-dom@${V.react},three@${V.three}`;
/* Pin r3f's own dependencies too, so esm.sh never resolves a moving range. */
const FIBER_PIN = `${PIN},zustand@5.0.8,its-fine@2.0.0,scheduler@0.25.0,react-reconciler@0.31.0,react-use-measure@2.1.7,suspend-react@0.1.3`;
const host = document.querySelector('[data-gradient]');

/* Navy (night pool). base = troughs, mid/high = silver-blue as the wave rises,
   tint = a hint of violet. */
const PALETTE = {
  dark: { base: '#05080f', mid: '#1c2a44', high: '#8fa3c0', tint: '#3a2d60' },
  light: { base: '#f3f5f8', mid: '#d6deea', high: '#b7c4d8', tint: '#e0dcee' },
};

const VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/* surface() below is water.js's surface(), line for line, so a colour band
   sits exactly where the dots are being pulled. */
const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uDpr;
  uniform float uBufH;    // drawing-buffer height, device px (what gl_FragCoord uses)
  uniform vec2 uOrigin;   // water canvas top-left in the viewport, CSS px
  uniform vec2 uTilt;     // pointer, -1..1
  uniform float uGrain;   // grain strength
  uniform vec3 uBase, uMid, uHigh, uTint;

  vec3 surface(vec2 p, float t) {
    float a = sin(p.x * 0.0062 + t * 0.55 + sin(p.y * 0.0041 + t * 0.23) * 1.6);
    float b = cos(p.y * 0.0074 - t * 0.43 + sin(p.x * 0.0052 - t * 0.19) * 1.4);
    return vec3((a + b) * 0.5, a, b * 0.7);
  }

  void main() {
    // Fragment position in CSS px, top-left origin, in the water canvas's space.
    vec2 css = vec2(gl_FragCoord.x, uBufH - gl_FragCoord.y) / uDpr;
    vec2 p = css - uOrigin + uTilt * 18.0;

    vec3 s = surface(p, uTime);
    // Soften by averaging a wider neighbourhood, so it reads as one body of colour.
    vec3 s2 = surface(p * 0.6 + 140.0, uTime * 0.8);
    float h = mix(s.x, s2.x, 0.35) * 0.5 + 0.5;

    vec3 col = mix(uBase, uMid, smoothstep(0.05, 0.75, h));
    // Crests stay soft enough for text on top to keep its contrast.
    col = mix(col, uHigh, smoothstep(0.6, 1.0, h) * 0.4);
    // Violet only where the current pushes sideways, and only faintly.
    col = mix(col, uTint, smoothstep(0.2, 1.0, s.y) * 0.3);

    // Film grain, one speck per CSS pixel. Interleaved-gradient noise: stable
    // on mobile GPUs, unlike the sin() hash at large coordinates.
    float n = fract(52.9829189 * fract(dot(floor(css), vec2(0.06711056, 0.00583715))));
    col += (n - 0.5) * uGrain;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* three r163+ needs WebGL2. Release the probe's context straight away. */
function webgl2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch (e) {
    return false;
  }
}

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const toggle = document.querySelector('[data-water-toggle]');
const water = document.querySelector('[data-water]');

function storedPause() {
  try {
    return localStorage.getItem('water') === 'paused';
  } catch (e) {
    return false;
  }
}

/* The pause state lives on the button as data-paused (water.js writes it on
   pages with water; this script writes it on pages without). */
function paused() {
  if (reduce.matches) return true;
  if (toggle && toggle.hasAttribute('data-paused')) return toggle.getAttribute('data-paused') === 'true';
  return storedPause();
}

/* Pages without water (resume, 404): run the pause button here, so the
   gradient can still be stopped and the saved choice is respected. */
if (toggle && !water) {
  let isPaused = storedPause();
  const paint = () => {
    toggle.hidden = reduce.matches;
    toggle.textContent = isPaused ? 'Play background' : 'Pause background';
    toggle.setAttribute('data-paused', isPaused ? 'true' : 'false');
  };
  toggle.addEventListener('click', () => {
    isPaused = !isPaused;
    try {
      localStorage.setItem('water', isPaused ? 'paused' : 'playing');
    } catch (e) {
      /* Storage blocked: the choice lasts for this page only. */
    }
    paint();
  });
  if (reduce.addEventListener) reduce.addEventListener('change', paint);
  paint();
}

/* Load after the page is ready, so ~400 KB of modules never competes with
   fonts, GSAP and the intro animation. */
if (host && webgl2()) {
  const go = () => start().catch(() => host.classList.remove('is-live'));
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 2000 }) : setTimeout(go, 200));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

async function start() {
  const [React, { createRoot }, THREE, Fiber] = await Promise.all([
    import(`https://esm.sh/react@${V.react}`),
    import(`https://esm.sh/react-dom@${V.react}/client?deps=${PIN}`),
    import(`https://esm.sh/three@${V.three}`),
    import(`https://esm.sh/@react-three/fiber@${V.fiber}?deps=${FIBER_PIN}`),
  ]);
  const h = React.createElement;
  const root = document.documentElement;
  const coarse = matchMedia('(pointer: coarse)');

  const theme = () => (root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

  const pointer = { x: 0, y: 0 };
  if (!coarse.matches) {
    addEventListener(
      'pointermove',
      (e) => {
        pointer.x = (e.clientX / innerWidth) * 2 - 1;
        pointer.y = (e.clientY / innerHeight) * 2 - 1;
      },
      { passive: true }
    );
  }

  /* Where the water canvas sits. Home: fixed at the viewport origin. Inner
     pages: inside an absolutely positioned band, so its document position is
     constant and only scroll changes its viewport position. Measured on
     resize, not every frame, to avoid forcing layout during GSAP scrubs. */
  const origin = { left: 0, docTop: 0, fixed: true };
  function measure() {
    if (!water) return;
    const r = water.getBoundingClientRect();
    origin.left = r.left;
    origin.fixed = getComputedStyle(water).position === 'fixed';
    origin.docTop = origin.fixed ? r.top : r.top + scrollY;
  }
  measure();
  addEventListener('resize', measure);

  let clock = 0;
  let seen = -1;

  function setColours(u) {
    const p = PALETTE[theme()];
    /* The shader writes raw values, so keep the hex colours in sRGB as written. */
    u.uBase.value.set(p.base).convertLinearToSRGB();
    u.uMid.value.set(p.mid).convertLinearToSRGB();
    u.uHigh.value.set(p.high).convertLinearToSRGB();
    u.uTint.value.set(p.tint).convertLinearToSRGB();
  }

  function Field() {
    const { gl, invalidate, setFrameloop } = Fiber.useThree();
    const mat = React.useMemo(() => {
      const uniforms = {
        uTime: { value: 0 },
        uDpr: { value: 1 },
        uBufH: { value: 1 },
        uOrigin: { value: new THREE.Vector2(0, 0) },
        uTilt: { value: new THREE.Vector2(0, 0) },
        uGrain: { value: 0.1 },
        uBase: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uHigh: { value: new THREE.Color() },
        uTint: { value: new THREE.Color() },
      };
      setColours(uniforms);
      return new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, depthTest: false });
    }, []);

    React.useEffect(() => {
      /* Paused or reduced motion: render only when something changes. */
      const loop = () => {
        setFrameloop(paused() ? 'demand' : 'always');
        invalidate();
      };
      const themeObs = new MutationObserver(() => {
        setColours(mat.uniforms);
        invalidate();
      });
      themeObs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
      const pauseObs = toggle ? new MutationObserver(loop) : null;
      if (pauseObs) pauseObs.observe(toggle, { attributes: true, attributeFilter: ['data-paused'] });
      if (reduce.addEventListener) reduce.addEventListener('change', loop);
      const onResize = () => invalidate();
      addEventListener('resize', onResize);
      addEventListener('scroll', onResize, { passive: true });
      loop();
      return () => {
        themeObs.disconnect();
        if (pauseObs) pauseObs.disconnect();
        if (reduce.removeEventListener) reduce.removeEventListener('change', loop);
        removeEventListener('resize', onResize);
        removeEventListener('scroll', onResize);
      };
    }, []);

    Fiber.useFrame((_, dt) => {
      const u = mat.uniforms;
      const still = paused();

      /* Follow the dots while their clock moves; otherwise keep our own. */
      const wt = window.__waterTime;
      if (typeof wt === 'number' && wt !== seen) clock = seen = wt;
      else if (!still) clock += Math.min(dt, 1 / 30);
      u.uTime.value = window.__gradientTime = clock;

      u.uDpr.value = gl.getPixelRatio();
      u.uBufH.value = gl.domElement.height;
      u.uOrigin.value.set(origin.left, origin.fixed ? origin.docTop : origin.docTop - scrollY);

      /* Cursor tilt: frame-rate independent easing, frozen while paused. */
      if (!still) {
        const k = 1 - Math.exp(-3 * Math.min(dt, 0.1));
        u.uTilt.value.x += (pointer.x - u.uTilt.value.x) * k;
        u.uTilt.value.y += (pointer.y - u.uTilt.value.y) * k;
      }
    });

    return h('mesh', { frustumCulled: false, material: mat }, h('planeGeometry', { args: [2, 2] }));
  }

  /* Only drop the CSS fallback once WebGL is really drawing; bring it back if
     rendering throws or the GPU context is lost. */
  const fallback = () => host.classList.remove('is-live');
  createRoot(host, { onUncaughtError: fallback }).render(
    h(
      Fiber.Canvas,
      {
        style: { position: 'absolute', inset: 0 },
        dpr: [1, 1.5],
        gl: { antialias: false, alpha: false, powerPreference: 'low-power' },
        frameloop: 'always',
        onCreated: ({ gl }) => {
          host.classList.add('is-live');
          gl.domElement.addEventListener('webglcontextlost', fallback);
          gl.domElement.addEventListener('webglcontextrestored', () => host.classList.add('is-live'));
        },
      },
      h(Field)
    )
  );
}
