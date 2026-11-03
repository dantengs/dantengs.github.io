import { CARD_WIDTH, CARD_HEIGHT, drawArtwork, sampleArtwork, seededRandom, transition } from './card-art.js';
const TAU = Math.PI * 2, DEG = Math.PI / 180;

function mount(root) {
  const stage = root.querySelector('#flip-stage');
  const slider = root.querySelector('#flip-angle');
  const autoButton = root.querySelector('#flip-auto');
  const controls = [...root.querySelectorAll('button,input')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const coarse = matchMedia('(pointer: coarse)');
  const count = coarse.matches ? 5000 : 10000;
  let angle = 0, tilt = 0, phase = 0, auto = !reduced.matches, hold = 2.5;
  let hover = false, visible = false, initialized = false, preparing = false, lost = false;
  let drag = null, tween = null, frame = 0, last = 0;
  let THREE, renderer, scene, camera, card, dots, frontPlane, backPlane, paper, outline, island;
  let front, back, cloud, seeds, positions, colors;
  controls.forEach(control => { control.disabled = true; });

  function ui() {
    let degrees = ((angle / DEG) % 360 + 360) % 360;
    if (degrees < .001 && angle > 0) degrees = 360;
    slider.value = String(Math.round(degrees));
    root.querySelector('#flip-angle-value').value = Math.round(degrees) + '°';
    const pose = transition(angle);
    root.querySelector('#flip-front').setAttribute('aria-pressed', String(pose.blend < .03));
    root.querySelector('#flip-back').setAttribute('aria-pressed', String(pose.blend > .97));
    root.querySelector('#flip-scatter').setAttribute('aria-pressed', String(pose.scatter > .85));
    autoButton.setAttribute('aria-pressed', String(auto));
    root.querySelector('#flip-hover').hidden = !hover;
    const state = root.querySelector('#flip-state');
    const face = pose.scatter > .35 ? 'scatter' : pose.blend > .5 ? 'back' : 'front';
    state.querySelector('.en').textContent = face === 'scatter' ? 'Particles, unbound' : face === 'back' ? 'Ising island' : 'Crossing equation';
    state.querySelector('.zh').textContent = face === 'scatter' ? '粒子散开' : face === 'back' ? 'Ising island' : 'Crossing equation';
    root.dataset.face = face;
  }
  function request() { if (!frame && initialized && visible && !document.hidden && !lost) frame = requestAnimationFrame(render); }
  function stop() { cancelAnimationFrame(frame); frame = 0; last = 0; }
  function manual() { auto = false; tween = null; hold = 0; ui(); }
  function select(degrees) {
    manual();
    const wanted = degrees * DEG;
    const delta = ((wanted - angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
    tween = { from: angle, to: angle + delta, elapsed: 0 };
    request();
  }
  function resize() {
    if (!initialized) return;
    const width = stage.clientWidth, height = stage.clientHeight;
    const fov = camera.fov * DEG;
    camera.aspect = width / height;
    camera.position.z = (width < 480 ? 1.08 : 1.2) * Math.max(CARD_HEIGHT / (2 * Math.tan(fov / 2)), CARD_WIDTH / (2 * Math.tan(fov / 2) * camera.aspect));
    camera.updateProjectionMatrix();
    if(scene.fog){scene.fog.near=camera.position.z+.5;scene.fog.far=camera.position.z+4.5;}
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse.matches ? 1.25 : 1.6));
    renderer.setSize(width, height, false);
    request();
  }
  function palette() {
    if (!initialized) return;
    const style = getComputedStyle(document.documentElement);
    const p = Object.fromEntries(['ink','muted','accent','surface','rule','bg'].map(key => [key,style.getPropertyValue('--'+key).trim()]));
    const artwork = drawArtwork(p,island);
    const nextFront = sampleArtwork(artwork.front,count,12345);
    const nextBack = sampleArtwork(artwork.back,count,67890);
    front = nextFront; back = nextBack;
    for(let i=0;i<count;i++) { front.positions[i*3+2]=.045; back.positions[i*3]*=-1; back.positions[i*3+2]=-.045; }
    for(const [plane,image] of [[frontPlane,artwork.front],[backPlane,artwork.back]]) {
      plane.material.map?.dispose();
      const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4,renderer.capabilities.getMaxAnisotropy());
      plane.material.map = texture; plane.material.needsUpdate = true;
    }
    paper.material.color.set(p.surface); outline.material.color.set(p.rule);
    scene.fog=new THREE.Fog(p.bg,camera.position.z+.5,camera.position.z+4.5);
    request();
  }
  function updateParticles() {
    const {scatter,blend} = transition(angle), formed = 1-scatter;
    for(let i=0;i<count;i++) {
      const j=i*3, seed=seeds[i];
      for(let k=0;k<3;k++) {
        const shape=front.positions[j+k]*(1-blend)+back.positions[j+k]*blend;
        const drift=Math.sin(phase*.45+seed+k*2.1)*.065;
        positions[j+k]=formed*shape+scatter*(cloud[j+k]+drift);
        colors[j+k]=(front.colors[j+k]*(1-blend)+back.colors[j+k]*blend)*(.94+.06*Math.sin(seed+phase));
      }
    }
    dots.geometry.attributes.position.needsUpdate = true;
    dots.geometry.attributes.color.needsUpdate = true;
    dots.material.size = (1.0+scatter*1.25)*2*camera.position.z/Math.max(1,stage.clientHeight);
    dots.material.opacity = .74-scatter*.12;
    paper.material.opacity = .97*formed*formed;
    outline.material.opacity = .9*formed*formed+.03;
    const artOpacity=.96*formed**4;
    frontPlane.material.opacity=artOpacity;
    backPlane.material.opacity=artOpacity;
    card.rotation.set(tilt,angle,0);
  }
  function render(time) {
    frame=0;
    if(!initialized||!visible||lost||document.hidden) return;
    if(last && time-last < 1000/30) { request(); return; }
    const dt=last ? Math.min((time-last)/1000,.1) : 0;
    last=time;
    const moving=!hover&&!drag;
    if(moving) {
      if(!reduced.matches) phase+=dt;
      if(tween) {
        tween.elapsed+=dt;
        const t=Math.min(1,tween.elapsed/1.1), eased=t*t*(3-2*t);
        angle=tween.from+(tween.to-tween.from)*eased;
        if(t===1) tween=null;
      } else if(auto) {
        if(hold>0) hold-=dt;
        else {
          const next=(Math.floor((angle+1e-8)/Math.PI)+1)*Math.PI;
          angle+=dt*.48;
          if(angle>=next) { angle=next; hold=2.5; }
        }
      }
    }
    updateParticles(); ui(); renderer.render(scene,camera); root.dataset.state='ready';
    if(moving&&(tween||auto||(!reduced.matches&&transition(angle).scatter>.001))) request();
  }
  function fallback() {
    stop(); root.dataset.state='fallback'; root.querySelector('#flip-message').hidden=false;
    controls.forEach(control=>{control.disabled=true;});
  }
  async function prepare() {
    if(preparing) return;
    preparing=true;
    try {
      const [library,data] = await Promise.all([import('./vendor/three/three.module.js'),fetch(new URL('./ising-island.json',import.meta.url)).then(response=>{if(!response.ok)throw new Error('Island outline unavailable');return response.json();})]);
      THREE=library; island=data;
      renderer=new THREE.WebGLRenderer({alpha:true,antialias:!coarse.matches,powerPreference:'low-power'});
      renderer.setClearColor(0,0); renderer.outputColorSpace=THREE.SRGBColorSpace;
      const canvas=renderer.domElement; canvas.tabIndex=0; canvas.setAttribute('role','application');
      canvas.setAttribute('aria-label','Rotatable particle card: sum over O of lambda phi phi O squared F Delta ell(u,v) equals zero, and Ising island / 可旋转的方程与 Ising island 粒子卡片');
      canvas.setAttribute('aria-describedby','flip-instructions'); stage.prepend(canvas);
      scene=new THREE.Scene(); camera=new THREE.PerspectiveCamera(32,1,.1,50);
      card=new THREE.Group(); scene.add(card);
      const w=CARD_WIDTH/2,h=CARD_HEIGHT/2,r=.14,shape=new THREE.Shape();
      shape.moveTo(-w+r,-h);shape.lineTo(w-r,-h);shape.quadraticCurveTo(w,-h,w,-h+r);shape.lineTo(w,h-r);shape.quadraticCurveTo(w,h,w-r,h);shape.lineTo(-w+r,h);shape.quadraticCurveTo(-w,h,-w,h-r);shape.lineTo(-w,-h+r);shape.quadraticCurveTo(-w,-h,-w+r,-h);
      paper=new THREE.Mesh(new THREE.ShapeGeometry(shape,12),new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false})); paper.renderOrder=0;card.add(paper);
      outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(16)),new THREE.LineBasicMaterial({transparent:true,depthWrite:false}));outline.position.z=.006;outline.renderOrder=3;card.add(outline);
      frontPlane=new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH,CARD_HEIGHT),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false}));frontPlane.position.z=.018;frontPlane.renderOrder=1;card.add(frontPlane);
      backPlane=new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH,CARD_HEIGHT),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false}));backPlane.rotation.y=Math.PI;backPlane.position.z=-.018;backPlane.renderOrder=1;card.add(backPlane);
      positions=new Float32Array(count*3);colors=new Float32Array(count*3);cloud=new Float32Array(count*3);seeds=new Float32Array(count);
      const random=seededRandom(24681357);
      for(let i=0;i<count;i++) {
        const z=random()*2-1,phi=random()*TAU,rad=Math.cbrt(random()),xy=Math.sqrt(1-z*z),j=i*3;
        cloud[j]=xy*Math.cos(phi)*rad*CARD_WIDTH*.39;
        cloud[j+1]=z*rad*CARD_HEIGHT*.4;
        cloud[j+2]=xy*Math.sin(phi)*rad*CARD_WIDTH*.49;
        seeds[i]=random()*TAU;
      }
      const dot=document.createElement('canvas');dot.width=dot.height=24;
      const ctx=dot.getContext('2d'),gradient=ctx.createRadialGradient(12,12,0,12,12,12);
      gradient.addColorStop(0,'#fff');gradient.addColorStop(.35,'#fff');gradient.addColorStop(1,'#ffffff00');ctx.fillStyle=gradient;ctx.fillRect(0,0,24,24);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));
      dots=new THREE.Points(geometry,new THREE.PointsMaterial({map:new THREE.CanvasTexture(dot),size:1.3,sizeAttenuation:true,vertexColors:true,transparent:true,depthWrite:false,alphaTest:.015}));dots.frustumCulled=false;dots.renderOrder=2;card.add(dots);
      initialized=true;controls.forEach(control=>{control.disabled=false;});palette();resize();ui();
      new ResizeObserver(resize).observe(stage);
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;fallback();});
      canvas.addEventListener('webglcontextrestored',()=>{lost=false;root.querySelector('#flip-message').hidden=true;controls.forEach(control=>{control.disabled=false;});resize();request();});
      canvas.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch'){hover=true;ui();request();}});
      canvas.addEventListener('pointerleave',()=>{hover=false;ui();last=0;request();});
      canvas.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;
        manual();drag={id:event.pointerId,x:event.clientX,y:event.clientY,angle,tilt,touch:event.pointerType==='touch',active:event.pointerType!=='touch'};
        if(drag.active)canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener('pointermove',event=>{
        if(!drag||drag.id!==event.pointerId)return;
        const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
        if(!drag.active){if(Math.abs(dx)<7||Math.abs(dx)<=Math.abs(dy))return;drag.active=true;canvas.setPointerCapture(event.pointerId);}
        if(event.cancelable)event.preventDefault();
        angle=drag.angle+dx/stage.clientWidth*TAU;tilt=Math.max(-.45,Math.min(.45,drag.tilt+dy*.003));ui();request();
      });
      const release=()=>{drag=null;request();};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
      canvas.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End',' '].includes(event.key))return;
        event.preventDefault();
        if(event.key===' '){auto=!auto;tween=null;hold=0;}
        else{manual();if(event.key==='ArrowLeft')angle-=5*DEG;if(event.key==='ArrowRight')angle+=5*DEG;if(event.key==='ArrowUp')tilt=Math.max(-.45,tilt-.05);if(event.key==='ArrowDown')tilt=Math.min(.45,tilt+.05);if(event.key==='Home'){angle=0;tilt=0;}if(event.key==='End'){angle=Math.PI;tilt=0;}}
        ui();request();
      });
      request();
    } catch(error) { fallback();console.warn('Particle card is showing its static front.',error); }
  }
  slider.addEventListener('input',()=>{const next=Number(slider.value);manual();angle=next*DEG;ui();request();});
  root.querySelector('#flip-front').addEventListener('click',()=>select(0));
  root.querySelector('#flip-scatter').addEventListener('click',()=>select(90));
  root.querySelector('#flip-back').addEventListener('click',()=>select(180));
  autoButton.addEventListener('click',()=>{auto=!auto;tween=null;hold=0;last=0;ui();request();});
  new MutationObserver(palette).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});scheme.addEventListener('change',palette);
  reduced.addEventListener('change',()=>{if(reduced.matches){auto=false;tween=null;ui();request();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else request();});window.addEventListener('pagehide',stop);window.addEventListener('pageshow',request);
  if('IntersectionObserver'in window){
    const loader=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){prepare();loader.disconnect();}},{rootMargin:'200px'});loader.observe(stage);
    new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)request();else stop();},{threshold:.03}).observe(stage);
  }else{visible=true;prepare();}
}
if(typeof document!=='undefined'){const root=document.getElementById('conformal-lab');if(root)mount(root);}
