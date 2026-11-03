// A real affine Möbius map, w = scale * z + shift, lifted to the unit sphere.
// The homogeneous expression is well behaved at the north pole (z = infinity).
export function transformSphere(x, y, z, scale, shift, out = [0, 0, 0]) {
  const q = 1 - z;
  const top = scale * scale * (1 + z) + 2 * scale * shift * x + shift * shift * q;
  const denominator = q + top;
  out[0] = 2 * (scale * x + shift * q) / denominator;
  out[1] = 2 * scale * y / denominator;
  out[2] = (top - q) / denominator;
  return out;
}

export function crossRatio(points) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const numerator = mul(sub(points[0], points[1]), sub(points[2], points[3]));
  const denominator = mul(sub(points[0], points[2]), sub(points[1], points[3]));
  const norm = denominator[0] ** 2 + denominator[1] ** 2;
  return [
    (numerator[0] * denominator[0] + numerator[1] * denominator[1]) / norm,
    (numerator[1] * denominator[0] - numerator[0] * denominator[1]) / norm
  ];
}

function mountLab(lab) {
  const stage = lab.querySelector('#conformal-stage');
  const scaleInput = lab.querySelector('#conformal-scale');
  const shiftInput = lab.querySelector('#conformal-shift');
  const playButton = lab.querySelector('#conformal-play');
  const resetButton = lab.querySelector('#conformal-reset');
  const controls = [scaleInput, shiftInput, playButton, resetButton];
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const darkPreference = matchMedia('(prefers-color-scheme: dark)');
  const coarsePointer = matchMedia('(pointer: coarse)');
  const points = [[-1.1, .3], [-.25, -.8], [.85, .45], [1.25, -.55]];
  const initialView = { pitch: .24, yaw: -.46 };
  let scale = 1, shift = 0;
  let pitch = initialView.pitch, yaw = initialView.yaw;
  let autoRotate = !motionPreference.matches;
  let visible = false, initialized = false, preparing = false, lost = false;
  let frameId = 0, lastDraw = 0, drag = null;
  let THREE, renderer, scene, camera, globe, gridGeometry, gridMaterial, shellMaterial, markerMaterial;
  let baseGrid, gridPositions, markerMeshes, markerRings;
  const scratch = [0, 0, 0];

  function updateReadout() {
    lab.querySelector('#conformal-scale-value').value = scale.toFixed(2) + '×';
    lab.querySelector('#conformal-shift-value').value = shift.toFixed(2);
    const ratio = crossRatio(points.map(([x, y]) => [scale * x + shift, scale * y]));
    lab.querySelector('#conformal-ratio').value = ratio[0].toFixed(4) + (ratio[1] < 0 ? ' − ' : ' + ') + Math.abs(ratio[1]).toFixed(4) + 'i';
  }

  function updatePlayButton() {
    playButton.setAttribute('aria-pressed', String(autoRotate));
    playButton.querySelector('.en').textContent = autoRotate ? 'Pause rotation' : 'Auto-rotate';
    playButton.querySelector('.zh').textContent = autoRotate ? '暂停旋转' : '自动旋转';
  }

  function requestRender() {
    if (!frameId && initialized && visible && !lost && !document.hidden) frameId = requestAnimationFrame(render);
  }

  function stopRender() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    lastDraw = 0;
  }

  function render(time) {
    frameId = 0;
    if (!initialized || !visible || lost || document.hidden) return;
    // At most 30 GPU draws per second; an inactive/paused scene draws only on changes.
    if (autoRotate && lastDraw && time - lastDraw < 1000 / 30) { requestRender(); return; }
    const dt = lastDraw ? Math.min((time - lastDraw) / 1000, .06) : 0;
    lastDraw = time;
    if (autoRotate && !drag?.active) yaw += dt * .16;
    globe.rotation.set(pitch, yaw, 0);
    renderer.render(scene, camera);
    if (lab.dataset.state !== 'ready') lab.dataset.state = 'ready';
    if (autoRotate) requestRender();
  }

  function palette() {
    if (!initialized) return;
    const style = getComputedStyle(document.documentElement);
    gridMaterial.color.set(style.getPropertyValue('--accent').trim());
    shellMaterial.color.set(style.getPropertyValue('--accent-soft').trim());
    const ink = new THREE.Color(style.getPropertyValue('--ink').trim());
    markerMaterial.color.set(ink.getHSL({}).l > .5 ? '#edb06b' : '#a75928');
    requestRender();
  }

  function resize() {
    if (!initialized) return;
    const width = stage.clientWidth, height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarsePointer.matches ? 1.25 : 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  }

  function moveGrid() {
    if (!initialized) return;
    for (let i = 0; i < baseGrid.length; i += 3) {
      transformSphere(baseGrid[i], baseGrid[i + 1], baseGrid[i + 2], scale, shift, scratch);
      gridPositions[i] = scratch[0] * 1.012;
      gridPositions[i + 1] = scratch[1] * 1.012;
      gridPositions[i + 2] = scratch[2] * 1.012;
    }
    gridGeometry.attributes.position.needsUpdate = true;
    points.forEach(([x, y], i) => {
      const norm = 1 + x * x + y * y;
      transformSphere(2 * x / norm, 2 * y / norm, (norm - 2) / norm, scale, shift, scratch);
      markerMeshes[i].position.set(...scratch).multiplyScalar(1.035);
      markerRings[i].position.copy(markerMeshes[i].position);
      markerRings[i].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...scratch).normalize());
    });
    requestRender();
  }

  function reset() {
    scale = 1; shift = 0;
    pitch = initialView.pitch; yaw = initialView.yaw;
    scaleInput.value = '1'; shiftInput.value = '0';
    updateReadout(); moveGrid();
  }

  function fallback() {
    stopRender();
    lab.dataset.state = 'fallback';
    lab.querySelector('#conformal-message').hidden = false;
    controls.forEach(control => { control.disabled = true; });
    if (renderer) renderer.domElement.hidden = true;
  }

  async function prepare() {
    if (preparing) return;
    preparing = true;
    lab.dataset.state = 'loading';
    try {
      THREE = await import('./vendor/three/three.module.js');
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !coarsePointer.matches, powerPreference: 'low-power' });
      renderer.setClearColor(0, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      const canvas = renderer.domElement;
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Interactive Riemann sphere / 可旋转的黎曼球面');
      canvas.setAttribute('aria-describedby', 'conformal-hint');
      stage.appendChild(canvas);
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(36, 1, .1, 30);
      camera.position.set(0, 0, 4.8);
      globe = new THREE.Group();
      globe.scale.setScalar(1.08);
      scene.add(globe);
      scene.add(new THREE.HemisphereLight(0xdce9ff, 0x1b2845, 2.1));
      const light = new THREE.DirectionalLight(0xffffff, 2.5);
      light.position.set(-3, 4, 5);
      scene.add(light);
      shellMaterial = new THREE.MeshStandardMaterial({ roughness: .65, metalness: .08 });
      globe.add(new THREE.Mesh(new THREE.SphereGeometry(1, coarsePointer.matches ? 32 : 48, 32), shellMaterial));

      const base = [];
      const point = (theta, phi) => [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
      const segment = (a, b) => base.push(...a, ...b);
      const steps = 96;
      for (let j = 1; j < 12; j++) for (let i = 0; i < steps; i++) {
        segment(point(Math.PI * j / 12, 2 * Math.PI * i / steps), point(Math.PI * j / 12, 2 * Math.PI * (i + 1) / steps));
      }
      for (let j = 0; j < 16; j++) for (let i = 0; i < steps; i++) {
        segment(point(Math.PI * i / steps, 2 * Math.PI * j / 16), point(Math.PI * (i + 1) / steps, 2 * Math.PI * j / 16));
      }
      baseGrid = new Float64Array(base);
      gridPositions = new Float32Array(base.length);
      gridGeometry = new THREE.BufferGeometry();
      gridGeometry.setAttribute('position', new THREE.BufferAttribute(gridPositions, 3).setUsage(THREE.DynamicDrawUsage));
      gridGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.02);
      gridMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: .72 });
      globe.add(new THREE.LineSegments(gridGeometry, gridMaterial));
      markerMaterial = new THREE.MeshStandardMaterial({ roughness: .3, metalness: .1 });
      const markerShape = new THREE.SphereGeometry(.035, 16, 10);
      const ringShape = new THREE.TorusGeometry(.067, .004, 5, 32);
      markerMeshes = points.map(() => { const mesh = new THREE.Mesh(markerShape, markerMaterial); globe.add(mesh); return mesh; });
      markerRings = points.map(() => { const mesh = new THREE.Mesh(ringShape, markerMaterial); globe.add(mesh); return mesh; });

      initialized = true;
      controls.forEach(control => { control.disabled = false; });
      updatePlayButton(); moveGrid(); palette(); resize();
      new ResizeObserver(resize).observe(stage);
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; fallback(); });
      canvas.addEventListener('webglcontextrestored', () => {
        lost = false;
        canvas.hidden = false;
        lab.querySelector('#conformal-message').hidden = true;
        controls.forEach(control => { control.disabled = false; });
        palette(); resize(); requestRender();
      });
      canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, active: event.pointerType !== 'touch' };
        if (drag.active) canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id) return;
        if (!drag.active) {
          const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
          if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
          drag.active = true;
          canvas.setPointerCapture(event.pointerId);
        }
        if (event.cancelable) event.preventDefault();
        yaw += (event.clientX - drag.x) * .008;
        pitch = Math.max(-1.2, Math.min(1.2, pitch + (event.clientY - drag.y) * .008));
        drag.x = event.clientX; drag.y = event.clientY;
        requestRender();
      });
      const endDrag = () => { drag = null; requestRender(); };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('lostpointercapture', endDrag);
      canvas.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Home'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === ' ') { autoRotate = !autoRotate; updatePlayButton(); }
        else if (event.key === 'Home') reset();
        else {
          autoRotate = false; updatePlayButton();
          if (event.key === 'ArrowLeft') yaw -= .15;
          if (event.key === 'ArrowRight') yaw += .15;
          if (event.key === 'ArrowUp') pitch = Math.max(-1.2, pitch - .15);
          if (event.key === 'ArrowDown') pitch = Math.min(1.2, pitch + .15);
        }
        requestRender();
      });
      requestRender();
    } catch (error) {
      fallback();
      console.warn('Conformal geometry is showing its static preview.', error);
    }
  }

  scaleInput.addEventListener('input', () => { scale = Number(scaleInput.value); updateReadout(); moveGrid(); });
  shiftInput.addEventListener('input', () => { shift = Number(shiftInput.value); updateReadout(); moveGrid(); });
  playButton.addEventListener('click', () => { autoRotate = !autoRotate; updatePlayButton(); requestRender(); });
  resetButton.addEventListener('click', reset);
  new MutationObserver(palette).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  darkPreference.addEventListener('change', palette);
  motionPreference.addEventListener('change', () => {
    if (motionPreference.matches) { autoRotate = false; updatePlayButton(); requestRender(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopRender(); else requestRender(); });
  window.addEventListener('pagehide', stopRender);
  window.addEventListener('pageshow', requestRender);
  updateReadout();
  if ('IntersectionObserver' in window) {
    const preload = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { prepare(); preload.disconnect(); }
    }, { rootMargin: '240px' });
    preload.observe(lab);
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) requestRender(); else stopRender();
    }, { threshold: .05 }).observe(stage);
  } else { visible = true; prepare(); }
}

if (typeof document !== 'undefined') {
  const lab = document.getElementById('conformal-lab');
  if (lab) mountLab(lab);
}
