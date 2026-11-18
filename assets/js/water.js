/* Water: a field of grey dots that flows like a surface, with a small school
   of pixel-art violet fish. Dots part around the pointer; fish swim away from it.
   Canvas 2D, no library.

   Markup:  <canvas class="water" data-water aria-hidden="true"></canvas>
   Optional data-water-cover="selector": pause while the matching elements
   hide the whole canvas (the home Work panel on narrow screens).

   API:     window.Water.setDepth(0..1)  0 = surface, 1 = deep (dimmer, slower)
*/
(function () {
  'use strict';

  var canvas = document.querySelector('canvas[data-water]');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var root = document.documentElement;
  var mq = function (q) {
    return window.matchMedia ? window.matchMedia(q) : { matches: false };
  };
  var reduce = mq('(prefers-reduced-motion: reduce)');
  var coarse = mq('(pointer: coarse)');
  var darkScheme = mq('(prefers-color-scheme: dark)');

  var TAU = Math.PI * 2;
  var SEGMENTS = 7;
  /* Body profile from nose to tail, as a share of the fish's size. */
  var PROFILE = [0.5, 0.78, 0.7, 0.56, 0.42, 0.3, 0.2];
  /* Fish are drawn as pixel art: rendered PX times smaller, then scaled up unsmoothed. */
  var PX = 3;
  var fishCanvas = document.createElement('canvas');
  var fctx = fishCanvas.getContext('2d');

  var w = 0;
  var h = 0;
  var dpr = 1;
  var gap = 28;
  var count = 0;
  var hx, hy, ox, oy, vx, vy, bucket;
  var fish = [];
  var ripples = [];
  /* Seconds until the school may be broken up again. */
  var scatterCooldown = 0;
  var pointer = { x: 0, y: 0, active: false };
  var colours = { dot: '#bcbcbc', fish: '#57068c', white: '#f2f2f2' };
  var depth = 0;
  var time = 0;
  var last = 0;
  var raf = 0;
  var onScreen = true;
  var userPaused = false;
  var rectCache = null;
  var covered = false;
  /* One or more stacked elements; together they count as one cover. */
  var cover = null;
  var coverSelector = canvas.getAttribute('data-water-cover');
  if (coverSelector) {
    try {
      cover = document.querySelectorAll(coverSelector);
      if (!cover.length) cover = null;
    } catch (e) {
      cover = null;
    }
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function readColours() {
    var style = getComputedStyle(root);
    var dot = style.getPropertyValue('--water-dot').trim();
    var accent = style.getPropertyValue('--accent').trim();
    if (dot) colours.dot = dot;
    if (accent) colours.fish = accent;
    var white = style.getPropertyValue('--fish-white').trim();
    if (white) colours.white = white;
  }

  /* Lay out the dots and the fish for the current canvas size. */
  function build() {
    var rect = canvas.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    var small = coarse.matches || window.innerWidth < 700;
    var targetDots = small ? 600 : 1600;
    gap = Math.max(small ? 20 : 22, Math.sqrt((w * h) / targetDots));

    var cols = Math.ceil(w / gap) + 1;
    var rows = Math.ceil(h / gap) + 1;
    count = cols * rows;
    hx = new Float32Array(count);
    hy = new Float32Array(count);
    ox = new Float32Array(count);
    oy = new Float32Array(count);
    vx = new Float32Array(count);
    vy = new Float32Array(count);
    bucket = new Uint8Array(count);

    var i = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        hx[i] = c * gap + (Math.random() - 0.5) * gap * 0.7;
        hy[i] = r * gap + (Math.random() - 0.5) * gap * 0.7;
        i++;
      }
    }

    var maxFish = small ? 5 : 10;
    var fullArea = small ? 390 * 800 : 1280 * 800;
    var n = clamp(Math.round((maxFish * w * h) / fullArea), small ? 2 : 3, maxFish);
    fish = [];
    for (var f = 0; f < n; f++) fish.push(makeFish(small, f % 3 === 2));
    ripples = [];
  }

  /* Koi-style markings: 1-4 blotches in the opposite colour to the body.
     seg = which body dot (head 0 to tail 6), u = sideways offset as a share
     of that dot's radius, r = blotch radius as a share of that dot's radius. */
  function makeBlotches() {
    var list = [];
    var n = 1 + Math.floor(Math.random() * 4);
    for (var b = 0; b < n; b++) {
      list.push({
        seg: 1 + Math.floor(Math.random() * 4),
        u: (Math.random() - 0.5) * 0.7,
        along: (Math.random() - 0.5) * 0.8,
        r: 0.35 + Math.random() * 0.4
      });
    }
    return list;
  }

  function makeFish(small, white) {
    var angle = Math.random() * TAU;
    var size = (small ? 6.9 : 8.1) + Math.random() * 3.3;
    var f = {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: Math.cos(angle) * 40,
      vy: Math.sin(angle) * 40,
      size: size,
      /* Head-to-tail length, used to tell when the whole fish is off screen. */
      length: size * 0.9 * (SEGMENTS - 1) + size,
      white: white,
      scatter: 0,
      blotches: makeBlotches(),
      bx: new Float32Array(SEGMENTS),
      by: new Float32Array(SEGMENTS),
      bnx: new Float32Array(SEGMENTS),
      bny: new Float32Array(SEGMENTS),
      scatterAngle: 0,
      heading: Math.random() * TAU,
      swim: Math.random() * TAU,
      panic: 0,
      sx: new Float32Array(SEGMENTS),
      sy: new Float32Array(SEGMENTS)
    };
    for (var s = 0; s < SEGMENTS; s++) {
      f.sx[s] = f.x - Math.cos(angle) * s * size * 0.9;
      f.sy[s] = f.y - Math.sin(angle) * s * size * 0.9;
    }
    return f;
  }

  /* The surface: two crossed travelling waves. Returns the height (-1..1)
     and writes the sideways pull into flow[]. */
  var flow = [0, 0];
  function surface(x, y, t) {
    var a = Math.sin(x * 0.0062 + t * 0.55 + Math.sin(y * 0.0041 + t * 0.23) * 1.6);
    var b = Math.cos(y * 0.0074 - t * 0.43 + Math.sin(x * 0.0052 - t * 0.19) * 1.4);
    flow[0] = a;
    flow[1] = b * 0.7;
    return (a + b) * 0.5;
  }

  function updateDots(dt) {
    var amp = gap * 0.42;
    var px = pointer.x;
    var py = pointer.y;
    var hasPointer = pointer.active;
    var R = 130;
    var R2 = R * R;
    var wake = 44;
    var wake2 = wake * wake;
    var nf = fish.length;
    var nr = ripples.length;

    for (var i = 0; i < count; i++) {
      var height = surface(hx[i], hy[i], time);
      var ax = (flow[0] * amp - ox[i]) * 28 - vx[i] * 7;
      var ay = (flow[1] * amp - oy[i]) * 28 - vy[i] * 7;
      var x = hx[i] + ox[i];
      var y = hy[i] + oy[i];
      var dx, dy, d2, d, q;

      if (hasPointer) {
        dx = x - px;
        dy = y - py;
        d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > 0.01) {
          d = Math.sqrt(d2);
          q = 1 - d / R;
          ax += (dx / d) * q * q * 1500;
          ay += (dy / d) * q * q * 1500;
        }
      }

      for (var k = 0; k < nf; k++) {
        dx = x - fish[k].x;
        dy = y - fish[k].y;
        d2 = dx * dx + dy * dy;
        if (d2 < wake2 && d2 > 0.01) {
          d = Math.sqrt(d2);
          q = 1 - d / wake;
          ax += (dx / d) * q * q * 520;
          ay += (dy / d) * q * q * 520;
        }
      }

      for (var r = 0; r < nr; r++) {
        var rp = ripples[r];
        dx = x - rp.x;
        dy = y - rp.y;
        d = Math.sqrt(dx * dx + dy * dy);
        q = 1 - Math.abs(d - rp.age * 260) / 36;
        if (q > 0 && d > 0.01) {
          var push = q * (1 - rp.age / 1.4) * 1100;
          ax += (dx / d) * push;
          ay += (dy / d) * push;
        }
      }

      vx[i] += ax * dt;
      vy[i] += ay * dt;
      ox[i] += vx[i] * dt;
      oy[i] += vy[i] * dt;
      bucket[i] = height > 0.35 ? 2 : height > -0.3 ? 1 : 0;
    }
  }

  /* Re-entry. A fish that has left the screen comes back at a random point
     on one of the four edges. Each edge keeps a running count, and the next
     fish always uses one of the least-used edges, so the counts never differ
     by more than one. Fish that leave together therefore come back on
     different sides instead of as the same group. */
  var edgeUses = [0, 0, 0, 0]; /* top, right, bottom, left */

  function pickEdge() {
    var least = Math.min.apply(null, edgeUses);
    var open = [];
    for (var e = 0; e < 4; e++) if (edgeUses[e] === least) open.push(e);
    var edge = open[Math.floor(Math.random() * open.length)];
    edgeUses[edge]++;
    return edge;
  }

  function reenter(f) {
    var edge = pickEdge();
    var along = 0.1 + Math.random() * 0.8;
    var inward = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][edge];
    var angle = inward + (Math.random() - 0.5) * 1.2;
    var pad = 10;
    f.x = edge === 1 ? w + pad : edge === 3 ? -pad : along * w;
    f.y = edge === 0 ? -pad : edge === 2 ? h + pad : along * h;
    f.vx = Math.cos(angle) * 44;
    f.vy = Math.sin(angle) * 44;
    f.heading = angle;
    f.scatter = 0;
    f.panic = 0;
    /* Lay the body out behind the head, off screen, so it swims in whole. */
    for (var s = 0; s < SEGMENTS; s++) {
      f.sx[s] = f.x - Math.cos(angle) * s * f.size * 0.9;
      f.sy[s] = f.y - Math.sin(angle) * s * f.size * 0.9;
    }
  }

  function updateFish(dt, pace) {
    var n = fish.length;
    var cruise = 44;
    var k;

    /* Don't let the whole school bunch up: when every fish is inside a small
       area, each one peels off in its own direction for a few seconds. */
    scatterCooldown = Math.max(0, scatterCooldown - dt);
    if (n >= 3 && scatterCooldown === 0) {
      var gx = 0;
      var gy = 0;
      for (k = 0; k < n; k++) {
        gx += fish[k].x;
        gy += fish[k].y;
      }
      gx /= n;
      gy /= n;
      var spread = 0;
      for (k = 0; k < n; k++) {
        var ex = fish[k].x - gx;
        var ey = fish[k].y - gy;
        spread = Math.max(spread, Math.sqrt(ex * ex + ey * ey));
      }
      if (spread < Math.min(w, h) * 0.22) {
        /* Spread the exits evenly around the circle, then jitter them, so no
           two fish leave the same way. */
        var turn = Math.random() * TAU;
        for (k = 0; k < n; k++) {
          var away = Math.atan2(fish[k].y - gy, fish[k].x - gx);
          var even = turn + (k / n) * TAU;
          fish[k].scatterAngle = even * 0.6 + away * 0.4 + (Math.random() - 0.5) * 0.6;
          fish[k].scatter = 2.2 + Math.random() * 1.2;
        }
        scatterCooldown = 6;
      }
    }
    for (var i = 0; i < n; i++) {
      var f = fish[i];
      var ax = 0;
      var ay = 0;
      var near = 0;
      var avx = 0;
      var avy = 0;
      var cx = 0;
      var cy = 0;
      var dx, dy, d2, d;

      for (var j = 0; j < n; j++) {
        if (j === i) continue;
        var o = fish[j];
        dx = o.x - f.x;
        dy = o.y - f.y;
        d2 = dx * dx + dy * dy;
        if (d2 < 140 * 140) {
          near++;
          avx += o.vx;
          avy += o.vy;
          cx += o.x;
          cy += o.y;
          if (d2 < 54 * 54 && d2 > 0.01) {
            /* Separation: move apart, harder the closer they are. */
            d = Math.sqrt(d2);
            ax -= (dx / d) * (54 - d) * 6;
            ay -= (dy / d) * (54 - d) * 6;
          }
        }
      }
      if (near && f.scatter <= 0) {
        /* Alignment and a light cohesion, so fish drift near each other
           without packing into one tight ball. */
        ax += (avx / near - f.vx) * 0.5 + (cx / near - f.x) * 0.08;
        ay += (avy / near - f.vy) * 0.5 + (cy / near - f.y) * 0.08;
      }

      /* Scattering: swim firmly towards this fish's own exit direction. */
      if (f.scatter > 0) {
        f.scatter -= dt;
        f.heading = f.scatterAngle;
        ax += Math.cos(f.scatterAngle) * 120;
        ay += Math.sin(f.scatterAngle) * 120;
      }

      /* The water moves the fish too: the surface current nudges their
         course, and a ripple ring passing over them pushes them outward. */
      surface(f.x, f.y, time);
      ax += flow[0] * 26;
      ay += flow[1] * 26;
      for (k = 0; k < ripples.length; k++) {
        var rp = ripples[k];
        dx = f.x - rp.x;
        dy = f.y - rp.y;
        d = Math.sqrt(dx * dx + dy * dy);
        var ring = 1 - Math.abs(d - rp.age * 260) / 50;
        if (ring > 0 && d > 0.01) {
          var shove = ring * (1 - rp.age / 1.4) * 900;
          ax += (dx / d) * shove;
          ay += (dy / d) * shove;
          f.panic = Math.max(f.panic, ring * 0.5);
        }
      }

      /* Wander: a heading that drifts at random. */
      f.heading += (Math.random() - 0.5) * 3.2 * dt;
      ax += Math.cos(f.heading) * 22;
      ay += Math.sin(f.heading) * 22;

      /* Flee the pointer. */
      if (pointer.active) {
        dx = f.x - pointer.x;
        dy = f.y - pointer.y;
        d2 = dx * dx + dy * dy;
        if (d2 < 180 * 180 && d2 > 0.01) {
          d = Math.sqrt(d2);
          var fear = 1 - d / 180;
          ax += (dx / d) * fear * 1400;
          ay += (dy / d) * fear * 1400;
          f.panic = Math.max(f.panic, 0.35 + fear * 0.65);
        }
      }

      /* Fish may swim fully out of view. Once the whole body is past an edge,
         the fish comes back in somewhere else (see reenter). */
      var out = f.length + 20;
      if (f.x < -out || f.x > w + out || f.y < -out || f.y > h + out) {
        reenter(f);
        continue;
      }

      f.vx += ax * dt;
      f.vy += ay * dt;

      var speed = Math.sqrt(f.vx * f.vx + f.vy * f.vy) || 0.001;
      var top = cruise + f.panic * 190;
      var floor = cruise * 0.55;
      var limited = clamp(speed, floor, top);
      f.vx = (f.vx / speed) * limited;
      f.vy = (f.vy / speed) * limited;
      f.panic = Math.max(0, f.panic - dt * 0.7);

      surface(f.x, f.y, time);
      f.x += (f.vx + flow[0] * 12) * dt * pace;
      f.y += (f.vy + flow[1] * 12) * dt * pace;
      f.swim += dt * pace * (3 + limited * 0.09);

      /* The body follows the head, one fixed-length link at a time. */
      var link = f.size * 0.9;
      f.sx[0] = f.x;
      f.sy[0] = f.y;
      for (var s = 1; s < SEGMENTS; s++) {
        dx = f.sx[s] - f.sx[s - 1];
        dy = f.sy[s] - f.sy[s - 1];
        d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        f.sx[s] = f.sx[s - 1] + (dx / d) * link;
        f.sy[s] = f.sy[s - 1] + (dy / d) * link;
      }
    }
  }

  /* Water style: 'dots' (default) or 'lines' (short curved strokes that turn
     with the waves). Set data-water-style on the canvas, or preview with
     ?water=lines in the URL. */
  var waterStyle = canvas.getAttribute('data-water-style') || 'dots';
  try {
    var asked = new URLSearchParams(location.search).get('water');
    if (asked === 'lines' || asked === 'dots') waterStyle = asked;
  } catch (e) {
    /* Old browser: keep the default. */
  }

  /* Each point becomes a short stroke lying along the local current, bent
     by the wave height, so the field reads as moving water. */
  function drawLines(alpha) {
    var half = gap * 0.32;
    ctx.lineCap = 'round';
    ctx.strokeStyle = colours.dot;
    for (var b = 0; b < 3; b++) {
      ctx.lineWidth = (dpr < 1.5 ? 1.2 : 1.05) + b * 0.25;
      ctx.globalAlpha = alpha * (0.5 + b * 0.25);
      ctx.beginPath();
      for (var i = 0; i < count; i++) {
        if (bucket[i] !== b) continue;
        var x = hx[i] + ox[i];
        var y = hy[i] + oy[i];
        var height = surface(hx[i], hy[i], time);
        /* Direction: the current, plus how the point is being pushed right now
           (cursor, fish wakes, ripples), so disturbances twist the strokes. */
        var dx = flow[0] + vx[i] * 0.02;
        var dy = flow[1] + vy[i] * 0.02;
        var dl = Math.sqrt(dx * dx + dy * dy) || 0.001;
        dx /= dl;
        dy /= dl;
        var bend = height * half * 0.9;
        ctx.moveTo(x - dx * half, y - dy * half);
        ctx.quadraticCurveTo(x - dy * bend, y + dx * bend, x + dx * half, y + dy * half);
      }
      ctx.stroke();
    }
  }

  function drawDots(alpha) {
    var base = dpr < 1.5 ? 1.25 : 1.1;
    for (var b = 0; b < 3; b++) {
      var radius = base + b * 0.28;
      ctx.globalAlpha = alpha * (0.5 + b * 0.25);
      ctx.beginPath();
      for (var i = 0; i < count; i++) {
        if (bucket[i] !== b) continue;
        var x = hx[i] + ox[i];
        var y = hy[i] + oy[i];
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, TAU);
      }
      ctx.fill();
    }
  }

  /* Each fish is a tapered chain of dots in the accent colour, drawn into a
     canvas PX times smaller and scaled up without smoothing, so it reads as
     pixel art. */
  /* Add one fish to the current path: a tapered chain of dots, two small
     side fins that paddle, and a small forked tail fin. */
  function traceFish(g, f) {
    var size = f.size;
    var px = 0, py = 0, nx = 0, ny = 0;
    var finX = 0, finY = 0, finNX = 0, finNY = 0, finFX = 0, finFY = 0;
    for (var s = 0; s < SEGMENTS; s++) {
      var x = f.sx[s];
      var y = f.sy[s];
      var fx, fy, d;
      if (s > 0) {
        /* Tail beat: sway each link sideways, more towards the tail. */
        fx = f.sx[s - 1] - x;
        fy = f.sy[s - 1] - y;
        d = Math.sqrt(fx * fx + fy * fy) || 0.001;
        fx /= d;
        fy /= d;
        var sway = Math.sin(f.swim - s * 0.85) * s * size * 0.075;
        x += -fy * sway;
        y += fx * sway;
      } else {
        fx = f.sx[0] - f.sx[1];
        fy = f.sy[0] - f.sy[1];
        d = Math.sqrt(fx * fx + fy * fy) || 0.001;
        fx /= d;
        fy /= d;
      }
      var radius = size * PROFILE[s];
      g.moveTo(x + radius, y);
      g.arc(x, y, radius, 0, TAU);
      f.bx[s] = x;
      f.by[s] = y;
      f.bnx[s] = fx;
      f.bny[s] = fy;
      if (s === 1) {
        finX = x; finY = y; finFX = fx; finFY = fy; finNX = -fy; finNY = fx;
      }
      px = x; py = y; nx = fx; ny = fy;
    }

    /* Side fins: just behind the head, angled back, paddling gently. */
    var paddle = Math.sin(f.swim * 0.8) * 0.35;
    for (var side = -1; side <= 1; side += 2) {
      var a = Math.atan2(finNY * side - finFY * 0.9, finNX * side - finFX * 0.9) + paddle * side;
      var root = size * PROFILE[1] * 0.8;
      var cx = finX + finNX * side * root + Math.cos(a) * size * 0.4;
      var cy = finY + finNY * side * root + Math.sin(a) * size * 0.4;
      g.moveTo(cx + Math.cos(a) * size * 0.45, cy + Math.sin(a) * size * 0.45);
      g.ellipse(cx, cy, size * 0.45, size * 0.2, a, 0, TAU);
    }

    /* Tail fin: two short lobes forking back from the last dot. */
    var back = Math.atan2(-ny, -nx) + Math.sin(f.swim - SEGMENTS * 0.85) * 0.3;
    for (var lobe = -1; lobe <= 1; lobe += 2) {
      var t = back + lobe * 0.45;
      var tx = px + Math.cos(t) * size * 0.4;
      var ty = py + Math.sin(t) * size * 0.4;
      g.moveTo(tx + Math.cos(t) * size * 0.5, ty + Math.sin(t) * size * 0.5);
      g.ellipse(tx, ty, size * 0.5, size * 0.2, t, 0, TAU);
    }
  }

  /* Fish are drawn into a canvas PX times smaller and scaled up without
     smoothing, so they read as pixel art. Violet fish first, then white. */
  function drawFish(alpha) {
    var fw = Math.ceil(w / PX);
    var fh = Math.ceil(h / PX);
    if (fishCanvas.width !== fw || fishCanvas.height !== fh) {
      fishCanvas.width = fw;
      fishCanvas.height = fh;
    }
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, fw, fh);
    fctx.setTransform(1 / PX, 0, 0, 1 / PX, 0, 0);
    for (var pass = 0; pass < 2; pass++) {
      var white = pass === 1;
      fctx.fillStyle = white ? colours.white : colours.fish;
      fctx.beginPath();
      for (var i = 0; i < fish.length; i++) {
        if (fish[i].white === white) traceFish(fctx, fish[i]);
      }
      fctx.fill();
    }
    for (pass = 0; pass < 2; pass++) {
      white = pass === 1;
      fctx.fillStyle = white ? colours.fish : colours.white;
      fctx.beginPath();
      for (i = 0; i < fish.length; i++) {
        var f = fish[i];
        if (f.white !== white) continue;
        for (var k = 0; k < f.blotches.length; k++) {
          var bl = f.blotches[k];
          var rad = f.size * PROFILE[bl.seg];
          /* fx/fy points forward along the body; (-fy, fx) is sideways. */
          var fx = f.bnx[bl.seg];
          var fy = f.bny[bl.seg];
          var cx = f.bx[bl.seg] + fx * bl.along * rad - fy * bl.u * rad;
          var cy = f.by[bl.seg] + fy * bl.along * rad + fx * bl.u * rad;
          var br = rad * bl.r;
          fctx.moveTo(cx + br, cy);
          fctx.arc(cx, cy, br, 0, TAU);
        }
      }
      fctx.fill();
    }
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = alpha;
    ctx.drawImage(fishCanvas, 0, 0, fw * PX, fh * PX);
  }


  function draw(withFish) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colours.dot;
    if (waterStyle === 'lines') drawLines(1 - depth * 0.55);
    else drawDots(1 - depth * 0.55);
    if (withFish) drawFish(0.92 - depth * 0.45);
    ctx.globalAlpha = 1;
  }

  /* Reduced motion or the visitor's pause: still dots, no fish. */
  function wantsStill() {
    return reduce.matches || userPaused;
  }

  /* Redraw while the loop is stopped, without leaving fish frozen mid-swim. */
  function redrawStopped() {
    if (wantsStill()) drawStill();
    else draw(true);
  }

  /* Reduced motion: one still frame of dots, no fish. */
  function drawStill() {
    for (var i = 0; i < count; i++) {
      var height = surface(hx[i], hy[i], 0);
      ox[i] = flow[0] * gap * 0.42;
      oy[i] = flow[1] * gap * 0.42;
      vx[i] = 0;
      vy[i] = 0;
      bucket[i] = height > 0.35 ? 2 : height > -0.3 ? 1 : 0;
    }
    draw(false);
  }

  function frame(now) {
    raf = 0;
    if (!shouldRun()) return;
    var dt = Math.min((now - last) / 1000, 1 / 30);
    if (dt < 0) dt = 0;
    last = now;

    var pace = 1 - depth * 0.65;
    time += dt * pace;
    for (var r = ripples.length - 1; r >= 0; r--) {
      ripples[r].age += dt;
      if (ripples[r].age > 1.4) ripples.splice(r, 1);
    }
    updateFish(dt, pace);
    updateDots(dt);
    draw(true);
    raf = requestAnimationFrame(frame);
  }

  function shouldRun() {
    return onScreen && !covered && !userPaused && !document.hidden && !reduce.matches;
  }

  /* Start or stop the loop to match the current conditions. */
  function sync() {
    if (shouldRun()) {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    } else {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (wantsStill()) drawStill();
    }
  }

  /* Pointer and touch. Listening on window keeps links and text clickable. */
  /* Once the visitor has scrolled down into the work, the cursor no longer
     disturbs the water, so nothing competes with the reading. */
  function calm() {
    return depth > 0.5;
  }

  function movePointer(clientX, clientY) {
    if (calm()) {
      pointer.active = false;
      return;
    }
    /* Measure once, then reuse until the page scrolls or resizes. */
    var rect = rectCache || (rectCache = canvas.getBoundingClientRect());
    pointer.x = clientX - rect.left;
    pointer.y = clientY - rect.top;
    pointer.active = true;
  }

  function dropPointer() {
    pointer.active = false;
  }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    movePointer(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    movePointer(e.clientX, e.clientY);
    if (pointer.active && ripples.length < 4 && !reduce.matches) {
      ripples.push({ x: pointer.x, y: pointer.y, age: 0 });
    }
  }, { passive: true });

  /* Touch: pointer events stop once the browser starts scrolling, passive
     touch events don't, so a dragging finger keeps acting like a cursor. */
  window.addEventListener('touchmove', function (e) {
    var t = e.touches[0];
    if (t) movePointer(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', dropPointer, { passive: true });
  window.addEventListener('touchcancel', dropPointer, { passive: true });
  window.addEventListener('pointerup', function (e) {
    if (e.pointerType !== 'mouse') dropPointer();
  }, { passive: true });
  root.addEventListener('mouseleave', dropPointer);
  window.addEventListener('blur', dropPointer);

  function forgetRect() {
    rectCache = null;
  }
  window.addEventListener('scroll', forgetRect, { passive: true });
  window.addEventListener('resize', forgetRect);

  /* Pausing. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(canvas);
  }

  document.addEventListener('visibilitychange', sync);

  var coverQueued = false;
  function checkCover() {
    coverQueued = false;
    if (!cover) return;
    var first = cover[0].getBoundingClientRect();
    var lastRect = cover[cover.length - 1].getBoundingClientRect();
    var b = canvas.getBoundingClientRect();
    var next = first.top <= Math.max(b.top, 0) &&
      lastRect.bottom >= Math.min(b.bottom, window.innerHeight) - 1 &&
      first.left <= b.left && first.right >= b.right;
    if (next !== covered) {
      covered = next;
      sync();
    }
  }
  function queueCover() {
    if (coverQueued) return;
    coverQueued = true;
    requestAnimationFrame(checkCover);
  }
  if (cover) {
    window.addEventListener('scroll', queueCover, { passive: true });
    window.addEventListener('resize', queueCover);
  }

  /* Resizing. */
  var resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var rect = canvas.getBoundingClientRect();
      var sameSize = Math.abs(rect.width - w) < 1 && Math.abs(rect.height - h) < 1;
      if (sameSize && Math.min(window.devicePixelRatio || 1, 2) === dpr) return;
      build();
      if (!raf) drawStill();
      queueCover();
    }, 150);
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(canvas);
  else window.addEventListener('resize', onResize);

  /* Moving the window to a screen with a different pixel density changes
     devicePixelRatio without resizing anything, so watch for it directly. */
  function watchDensity() {
    var query = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    if (!query.addEventListener) return;
    query.addEventListener('change', function () {
      onResize();
      watchDensity();
    }, { once: true });
  }
  watchDensity();

  /* Colours follow the theme toggle and the system setting. */
  function repaint() {
    readColours();
    if (!raf) redrawStopped();
  }
  if ('MutationObserver' in window) {
    new MutationObserver(repaint).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function listen(query, fn) {
    if (query.addEventListener) query.addEventListener('change', fn);
  }
  listen(darkScheme, repaint);
  listen(reduce, sync);

  /* A visible pause control, for anyone who finds the movement distracting.
     The choice is remembered for later visits. */
  var toggle = document.querySelector('[data-water-toggle]');
  function paintToggle() {
    if (!toggle) return;
    toggle.hidden = reduce.matches;
    toggle.textContent = userPaused ? 'Play water' : 'Pause water';
    toggle.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
  }
  try {
    userPaused = localStorage.getItem('water') === 'paused';
  } catch (e) {
    userPaused = false;
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      userPaused = !userPaused;
      try {
        localStorage.setItem('water', userPaused ? 'paused' : 'playing');
      } catch (e) {
        /* Storage blocked: the choice lasts for this page only. */
      }
      paintToggle();
      sync();
    });
  }
  listen(reduce, paintToggle);
  paintToggle();

  window.Water = {
    setDepth: function (value) {
      depth = clamp(+value || 0, 0, 1);
      if (calm()) pointer.active = false;
      if (!raf && count) redrawStopped();
    }
  };

  readColours();
  build();
  checkCover();
  if (reduce.matches || userPaused) drawStill();
  sync();
})();
