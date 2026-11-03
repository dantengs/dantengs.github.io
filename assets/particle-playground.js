const PAIRS = { s: [1, 0, 3, 2], t: [3, 2, 1, 0] };
export const partner = (channel, source) => PAIRS[channel][source];
export function quadraticPoint(a, b, c, t, out = [0, 0, 0]) {
  const q = 1 - t;
  for (let k = 0; k < 3; k++) out[k] = q * q * a[k] + 2 * q * t * b[k] + t * t * c[k];
  return out;
}

function mount(root) {
  const stage = root.querySelector('#playground-stage');
  const portButtons = [...root.querySelectorAll('[data-port]')];
  const buttons = [...root.querySelectorAll('button')];
  const startButton = root.querySelector('#playground-start');
  const pauseButton = root.querySelector('#playground-pause');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const defaults = [[-.7, .58], [-.7, -.58], [.7, -.58], [.7, .58]];
  let layout = defaults.map(p => p.slice());
  let mode = 'free', channel = 's', selected = 0;
  let active = false, paused = false, ready = false, visible = false, preparing = false, lost = false;
  let blend = 0, blendTarget = 0, dirty = true, halfX = 4.5;
  const halfY = 3.1;
  let score = 0, hits = 0, combo = 0, target = 2, generation = 0, won = false, emitted = 0;
  let frame = 0, lastTime = 0, drag = null, paint = null, suppressClickUntil = 0;
  let THREE, renderer, scene, camera, canvas, particleGeometry, trailGeometry;
  let particlePositions, particleColors, trailPositions, trailColors, portMeshes, targetRing, edgeMeshes;
  let colors, gold, rings, points, joints;
  const pool = Array.from({ length: coarse.matches ? 320 : 600 }, () => ({ active: false }));
  let cursor = 0, ringCursor = 0;
  const temp = [0, 0, 0], previous = [0, 0, 0];

  function text(id, en, zh) {
    const el = root.querySelector(id);
    el.querySelector('.en').textContent = en;
    el.querySelector('.zh').textContent = zh;
  }
  const status = (en, zh) => text('#playground-status', en, zh);
  function hud() {
    root.dataset.mode = mode; root.dataset.channel = channel;
    root.querySelector('#playground-free').setAttribute('aria-pressed', String(mode === 'free'));
    root.querySelector('#playground-challenge').setAttribute('aria-pressed', String(mode === 'challenge'));
    root.querySelector('#playground-goal').hidden = mode !== 'challenge';
    text('#playground-score-label', mode === 'challenge' ? 'Score' : 'Sparks', mode === 'challenge' ? '得分' : '火花');
    root.querySelector('#playground-score').value = String(mode === 'challenge' ? score : emitted);
    root.querySelector('#playground-target').value = String(target + 1);
    root.querySelector('#playground-hits').value = `${hits} / 8`;
    text('#playground-channel', `${channel.toUpperCase()} channel`, `${channel.toUpperCase()} 通道`);
    const comboEl = root.querySelector('#playground-combo');
    comboEl.hidden = mode !== 'challenge' || combo < 2;
    comboEl.textContent = won ? '✦ 8 / 8 — ROUND COMPLETE ✦' : `COMBO × ${combo}`;
    portButtons.forEach((button, i) => {
      button.classList.toggle('is-selected', selected === i);
      button.classList.toggle('is-target', mode === 'challenge' && !won && target === i);
    });
    if (targetRing) targetRing.visible = mode === 'challenge' && !won;
  }
  function pauseLabel() {
    pauseButton.setAttribute('aria-pressed', String(paused));
    text('#playground-pause', paused ? 'Resume' : 'Pause', paused ? '继续' : '暂停');
  }
  function request() { if (!frame && ready && visible && !document.hidden && !lost) frame = requestAnimationFrame(draw); }
  function stop() { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
  function activate() {
    active = true; root.dataset.active = 'true'; startButton.hidden = true;
    if (paused) lastTime = 0; paused = false; pauseLabel(); request();
  }
  function take(kind, color) {
    const p = pool[cursor++ % pool.length];
    Object.assign(p, { active: true, kind, color, life: 2, duration: 2, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    emitted++;
    return p;
  }
  function ripple(x, y, color) {
    const r = rings[ringCursor++ % rings.length];
    r.age = 0; r.mesh.visible = true; r.mesh.position.set(x, y, .35); r.mesh.material.color.setRGB(...color);
  }
  function burst(x, y, count = 65, color = null) {
    if (!ready) return;
    count = Math.round(count * (reduced.matches ? .45 : 1));
    for (let i = 0; i < count; i++) {
      const p = take('free', color || colors[Math.floor(Math.random() * 4)]);
      const angle = Math.random() * Math.PI * 2, speed = .5 + Math.random() * 2.9;
      p.x = x; p.y = y; p.z = .2;
      p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed; p.vz = (Math.random() - .5) * .6;
      p.duration = p.life = 1.1 + Math.random() * 1.8;
    }
    ripple(x, y, color || colors[selected]); hud(); request();
  }
  function pathPoint(source, t, out) {
    const start = points[source], joint = joints[source];
    const a = points[partner('s', source)], b = points[partner('t', source)];
    const end = [a[0] * (1 - blend) + b[0] * blend, a[1] * (1 - blend) + b[1] * blend, 0];
    if (t < .5) return quadraticPoint(start, [(start[0] + joint[0]) / 2, (start[1] + joint[1]) / 2, .45], joint, t * 2, out);
    return quadraticPoint(joint, [(end[0] + joint[0]) / 2, (end[1] + joint[1]) / 2, .45], end, t * 2 - 1, out);
  }
  function launch(source = selected, scorable = true) {
    if (!ready) return;
    activate(); selected = source;
    const n = reduced.matches ? 4 : 8;
    for (let i = 0; i < n; i++) {
      const p = take('route', colors[source]);
      p.source = source; p.t = -i * .055; p.generation = generation; p.scorable = scorable && i === 0;
      p.x = points[source][0]; p.y = points[source][1];
    }
    ripple(...points[source].slice(0, 2), colors[source]);
    if (mode === 'free') status('Try dragging a portal while the light is moving.', '试试在光粒子移动时拖动入口，线路会跟着改变。');
    hud(); request();
  }
  function collect(destination, version) {
    if (mode !== 'challenge' || won || version !== generation) return;
    if (destination !== target) {
      combo = 0; hud();
      status('That track leads elsewhere. Follow the gold star.', '这条线通向另一个入口，再试试金色目标对应的线路。');
      return;
    }
    hits++; combo++; score += 100 + combo * 25; generation++;
    if (hits === 8) {
      won = true;
      points.forEach(p => burst(p[0], p[1], 90, gold));
      status('All eight targets caught! Reset for another round.', '八个目标全部命中！点“重置”再来一局。');
    } else {
      target = (target + 1 + Math.floor(Math.random() * 3)) % 4;
      status(`Nice! Now send the light to portal ${target + 1}.`, `命中！接下来把光送到入口 ${target + 1}。`);
    }
    hud();
  }
  function switchChannel() {
    if (!ready) return;
    activate(); channel = channel === 's' ? 't' : 's'; blendTarget = channel === 's' ? 0 : 1;
    hud();
    const previousSelection = selected;
    for (let i = 0; i < 4; i++) launch(i, false);
    selected = previousSelection; hud();
    status(mode === 'challenge' ? `Tracks changed. The target is still ${target + 1}.` : 'New tracks! Launch again or drag the portals.', mode === 'challenge' ? `线路换好了，目标仍是入口 ${target + 1}。` : '线路换好了！再发射一波，或者拖动入口重新布阵。');
  }
  function reset() {
    if (!ready) return;
    activate(); layout = defaults.map(p => p.slice());
    channel = 's'; blend = blendTarget = 0; dirty = true;
    score = hits = combo = emitted = 0; target = 2; selected = 0; won = false; generation++;
    pool.forEach(p => { p.active = false; }); rings.forEach(r => { r.mesh.visible = false; });
    status(mode === 'challenge' ? 'Send the light to gold portal 3. Which entrance is paired with it?' : 'A clean board. Tap, drag, or hold to draw.', mode === 'challenge' ? '把光送进金色入口 3，试试与它配对的另一个入口。' : '棋盘清空了，点一下、拖一下，或者按住画面涂鸦。');
    hud(); request();
  }
  function changeMode(next) { mode = next; reset(); }

  function updateLayout() {
    points = layout.map(([x, y]) => [x * halfX, y * halfY, 0]);
    joints = layout.map((_, i) => {
      const sx = (i < 2 ? -1 : 1) * Math.min(.95, halfX * .34);
      const ty = (i === 0 || i === 3 ? 1 : -1) * .85;
      return [sx * (1 - blend), ty * blend, .08];
    });
    for (let i = 0; i < 4; i++) {
      const start = new THREE.Vector3(...points[i]), end = new THREE.Vector3(...joints[i]);
      const control = start.clone().add(end).multiplyScalar(.5); control.z = .45;
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      for (const [mesh, radius] of [[edgeMeshes[i][0], .012], [edgeMeshes[i][1], .047]]) {
        mesh.geometry.dispose(); mesh.geometry = new THREE.TubeGeometry(curve, 28, radius, 6, false);
      }
      portMeshes[i].position.set(...points[i]);
      portButtons[i].style.left = `${(layout[i][0] + 1) * 50}%`;
      portButtons[i].style.top = `${(1 - layout[i][1]) * 50}%`;
    }
    dirty = false;
  }
  function updateParticles(dt) {
    const damping = Math.exp(-1.25 * dt);
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i], j = i * 3, k = i * 6;
      let brightness = 0;
      if (p.active) {
        previous[0] = p.x; previous[1] = p.y; previous[2] = p.z;
        if (p.kind === 'route') {
          p.t += dt * .72;
          if (p.t > 1) {
            pathPoint(p.source, 1, temp);
            p.active = false;
            if (Math.abs(blend - blendTarget) < .01 && p.scorable) collect(partner(channel, p.source), p.generation);
            burst(temp[0], temp[1], 22, p.color);
          } else if (p.t >= 0) {
            pathPoint(p.source, p.t, temp); [p.x, p.y, p.z] = temp;
            brightness = Math.min(1, p.t * 18);
          }
        } else {
          p.life -= dt;
          if (p.life <= 0) p.active = false;
          else {
            if (paint) {
              const dx = paint.x - p.x, dy = paint.y - p.y, strength = Math.min(12, 2 / (dx * dx + dy * dy + .2));
              p.vx += dx * strength * dt; p.vy += dy * strength * dt;
            }
            p.vx *= damping; p.vy *= damping; p.vz *= damping;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            brightness = (p.life / p.duration) ** 1.25;
          }
        }
      }
      particlePositions[j] = p.x || 0; particlePositions[j + 1] = p.y || 0; particlePositions[j + 2] = p.z || 0;
      const dx = (p.x || 0) - previous[0], dy = (p.y || 0) - previous[1], dz = (p.z || 0) - previous[2];
      const trace = Math.min(2.5, .4 / (Math.hypot(dx, dy, dz) || 1));
      trailPositions[k] = (p.x || 0) - dx * trace; trailPositions[k + 1] = (p.y || 0) - dy * trace; trailPositions[k + 2] = (p.z || 0) - dz * trace;
      trailPositions[k + 3] = p.x || 0; trailPositions[k + 4] = p.y || 0; trailPositions[k + 5] = p.z || 0;
      for (let c = 0; c < 3; c++) {
        const value = (p.color?.[c] || 0) * brightness;
        particleColors[j + c] = value;
        trailColors[k + c] = 0; trailColors[k + 3 + c] = value * .65;
      }
    }
    particleGeometry.attributes.position.needsUpdate = particleGeometry.attributes.color.needsUpdate = true;
    trailGeometry.attributes.position.needsUpdate = trailGeometry.attributes.color.needsUpdate = true;
    for (const r of rings) if (r.mesh.visible) {
      r.age += dt;
      if (r.age > .85) r.mesh.visible = false;
      else { r.mesh.scale.setScalar(.4 + r.age * 2.1); r.mesh.material.opacity = (1 - r.age / .85) * .65; }
    }
  }
  function draw(time) {
    frame = 0;
    if (!ready || !visible || document.hidden || lost) return;
    if (lastTime && time - lastTime < 1000 / 30) { request(); return; }
    const dt = lastTime ? Math.min((time - lastTime) / 1000, .4) : 0;
    lastTime = time;
    if (!paused) {
      if (Math.abs(blend - blendTarget) > .001) { blend += (blendTarget - blend) * Math.min(1, dt * 11); dirty = true; }
      else if (blend !== blendTarget) { blend = blendTarget; dirty = true; }
      if (paint) burst(paint.x, paint.y, 5);
      if (dirty) updateLayout();
      let remaining = dt;
      do { const step = Math.min(remaining, 1 / 45); updateParticles(step); remaining -= step; } while (remaining > 1e-6);
    } else if (dirty) updateLayout();
    if (mode === 'challenge' && !won) {
      targetRing.position.set(points[target][0], points[target][1], .25);
      targetRing.scale.setScalar(reduced.matches || paused ? 1 : 1 + .07 * Math.sin(time * .004));
    }
    renderer.render(scene, camera);
    root.dataset.state = 'ready';
    if (!paused && (paint || Math.abs(blend - blendTarget) > .001 || pool.some(p => p.active) || rings.some(r => r.mesh.visible) || (mode === 'challenge' && !won && !reduced.matches))) request();
  }
  function resize() {
    if (!ready) return;
    const width = stage.clientWidth, height = stage.clientHeight;
    halfX = halfY * width / height;
    camera.left = -halfX; camera.right = halfX; camera.top = halfY; camera.bottom = -halfY; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse.matches ? 1.25 : 1.5));
    renderer.setSize(width, height, false); dirty = true; updateLayout(); request();
  }
  function world(event) {
    const rect = stage.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width * 2 * halfX - halfX, halfY - (event.clientY - rect.top) / rect.height * 2 * halfY];
  }
  function fallback() {
    stop(); root.dataset.state = 'fallback'; root.querySelector('#playground-message').hidden = false;
    buttons.forEach(b => { b.disabled = true; });
  }
  async function prepare() {
    if (preparing) return;
    preparing = true;
    try {
      THREE = await import('./vendor/three/three.module.js');
      renderer = new THREE.WebGLRenderer({ alpha: false, antialias: !coarse.matches, powerPreference: 'low-power' });
      renderer.setClearColor('#0b1223', 1); renderer.outputColorSpace = THREE.SRGBColorSpace;
      canvas = renderer.domElement; canvas.tabIndex = 0; canvas.setAttribute('role', 'application');
      canvas.setAttribute('aria-label', 'Interactive particle board / 粒子互动棋盘'); canvas.setAttribute('aria-describedby', 'playground-hint'); stage.prepend(canvas);
      camera = new THREE.OrthographicCamera(-4.5, 4.5, halfY, -halfY, .1, 30); camera.position.z = 8;
      scene = new THREE.Scene();
      colors = ['#7ea9ff', '#5de4cb', '#f49b92', '#c5a2ff'].map(hex => new THREE.Color(hex).toArray()); gold = new THREE.Color('#ffdb7b').toArray();
      const grid = new THREE.GridHelper(24, 48, '#29405f', '#29405f'); grid.rotation.x = Math.PI / 2; grid.position.z = -1; grid.material.transparent = true; grid.material.opacity = .2; scene.add(grid);
      portMeshes = colors.map(color => { const mesh = new THREE.Mesh(new THREE.TorusGeometry(.4, .012, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), transparent: true, opacity: .6 })); scene.add(mesh); return mesh; });
      targetRing = new THREE.Mesh(new THREE.TorusGeometry(.53, .014, 6, 48), new THREE.MeshBasicMaterial({ color: '#ffdb7b', transparent: true, opacity: .8 })); scene.add(targetRing);
      edgeMeshes = colors.map(color => [1, 0].map(core => { const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), transparent: true, opacity: core ? .7 : .12, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(mesh); return mesh; }));
      rings = Array.from({ length: 16 }, () => { const mesh = new THREE.Mesh(new THREE.TorusGeometry(.35, .009, 5, 48), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); mesh.visible = false; scene.add(mesh); return { mesh, age: 1 }; });
      const textureCanvas = document.createElement('canvas'); textureCanvas.width = textureCanvas.height = 32;
      const ctx = textureCanvas.getContext('2d'), gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, '#fff'); gradient.addColorStop(.2, '#fff'); gradient.addColorStop(1, '#ffffff00'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32);
      particlePositions = new Float32Array(pool.length * 3); particleColors = new Float32Array(pool.length * 3);
      trailPositions = new Float32Array(pool.length * 6); trailColors = new Float32Array(pool.length * 6);
      particleGeometry = new THREE.BufferGeometry(); particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3)); particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
      const cloud = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, map: new THREE.CanvasTexture(textureCanvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); cloud.frustumCulled = false; scene.add(cloud);
      trailGeometry = new THREE.BufferGeometry(); trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3)); trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
      const trails = new THREE.LineSegments(trailGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); trails.frustumCulled = false; scene.add(trails);
      ready = true; buttons.forEach(b => { b.disabled = false; }); resize(); hud();
      new ResizeObserver(resize).observe(stage);
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; fallback(); });
      canvas.addEventListener('webglcontextrestored', () => { lost = false; buttons.forEach(b => { b.disabled = false; }); root.querySelector('#playground-message').hidden = true; resize(); request(); });
      canvas.addEventListener('click', event => { if (performance.now() < suppressClickUntil) return; activate(); const [x, y] = world(event); burst(x, y, 100); });
      stage.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const port = event.target.closest('[data-port]');
        if (port) { activate(); selected = Number(port.dataset.port); drag = { id: event.pointerId, index: selected, x: event.clientX, y: event.clientY, moved: false }; port.setPointerCapture(event.pointerId); hud(); }
        else if (event.target === canvas && active) { const [x, y] = world(event); paused = false; pauseLabel(); paint = { id: event.pointerId, x, y }; canvas.setPointerCapture(event.pointerId); burst(x, y, 65); }
      });
      stage.addEventListener('pointermove', event => {
        if (drag && drag.id === event.pointerId) {
          const [x, y] = world(event);
          if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) drag.moved = true;
          if (drag.moved) { layout[drag.index] = [Math.max(-.82, Math.min(.82, x / halfX)), Math.max(-.78, Math.min(.78, y / halfY))]; dirty = true; request(); }
        } else if (paint && paint.id === event.pointerId) { [paint.x, paint.y] = world(event); request(); }
      });
      const endPointer = event => { const source = drag && !drag.moved && event.type === 'pointerup' ? drag.index : null; if (paint || drag) suppressClickUntil = performance.now() + 250; drag = null; paint = null; if (source !== null) launch(source); request(); };
      stage.addEventListener('pointerup', endPointer); stage.addEventListener('pointercancel', endPointer);
      stage.addEventListener('keydown', event => {
        if (event.target !== canvas && !event.target.matches('[data-port]')) return;
        const key = event.key.toLowerCase();
        if (/^[1-4]$/.test(key)) { event.preventDefault(); launch(Number(key) - 1); }
        else if (key === 'c') { event.preventDefault(); switchChannel(); }
        else if (key === ' ' && event.target === canvas) { event.preventDefault(); launch(); }
        else if (key.startsWith('arrow')) { event.preventDefault(); activate(); const p = layout[selected]; if (key === 'arrowleft') p[0] -= .04; if (key === 'arrowright') p[0] += .04; if (key === 'arrowup') p[1] += .04; if (key === 'arrowdown') p[1] -= .04; p[0] = Math.max(-.82, Math.min(.82, p[0])); p[1] = Math.max(-.78, Math.min(.78, p[1])); dirty = true; request(); }
      });
      request();
    } catch (error) { fallback(); console.warn('Particle playground could not start.', error); }
  }
  portButtons.forEach((button, i) => button.addEventListener('click', event => { if (event.detail === 0) launch(i); }));
  root.querySelector('#playground-launch').addEventListener('click', () => launch());
  root.querySelector('#playground-switch').addEventListener('click', switchChannel);
  root.querySelector('#playground-reset').addEventListener('click', reset);
  root.querySelector('#playground-free').addEventListener('click', () => changeMode('free'));
  root.querySelector('#playground-challenge').addEventListener('click', () => changeMode('challenge'));
  pauseButton.addEventListener('click', () => { active = true; root.dataset.active = 'true'; startButton.hidden = true; paused = !paused; lastTime = 0; pauseLabel(); request(); });
  startButton.addEventListener('click', () => { activate(); burst(0, 0, 120); for (let i = 0; i < 4; i++) launch(i, false); status('Now drag a portal, or hold the background and move your pointer.', '现在拖动入口改线，或者按住空白处移动指针。'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else request(); });
  window.addEventListener('pagehide', stop); window.addEventListener('pageshow', request);
  if ('IntersectionObserver' in window) {
    const loader = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { prepare(); loader.disconnect(); } }, { rootMargin: '200px' }); loader.observe(stage);
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) request(); else stop(); }, { threshold: .03 }).observe(stage);
  } else { visible = true; prepare(); }
}

if (typeof document !== 'undefined') { const root = document.getElementById('conformal-lab'); if (root) mount(root); }
