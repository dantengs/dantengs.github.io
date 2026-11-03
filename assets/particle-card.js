import{CARD_WIDTH,CARD_HEIGHT,drawArtwork,sampleArtwork,seededRandom,transition}from'./card-art.js?v=hd2';
const TAU=Math.PI*2,DEG=Math.PI/180;
function mount(root){
  const stage=root.querySelector('#flip-stage'),slider=root.querySelector('#flip-angle'),sharp=root.querySelector('#flip-sharp'),sharpImage=root.querySelector('#flip-image');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),scheme=matchMedia('(prefers-color-scheme: dark)'),coarse=matchMedia('(pointer: coarse)');
  const count=coarse.matches?5000:10000;
  let angle=0,phase=0,auto=!reduced.matches,hold=2.5,hover=false,visible=false,initialized=false,preparing=false,lost=false;
  let drag=null,frame=0,last=0,paletteVersion=0,artUrls=null,currentFace='front';
  let THREE,renderer,scene,camera,card,dots,frontPlane,backPlane,paper,outline,front,back,cloud,seeds,positions,colors;
  const dark=()=>document.documentElement.dataset.theme==='dark'||(!document.documentElement.dataset.theme&&scheme.matches);
  sharpImage.src=new URL(`./crossing-front-${dark()?'dark':'light'}.svg`,import.meta.url).href;
  function ui(){let degrees=((angle/DEG)%360+360)%360;if(degrees<.001&&angle>0)degrees=360;slider.value=String(Math.round(degrees));slider.setAttribute('aria-valuetext',Math.round(degrees)+'°');const pose=transition(angle);root.dataset.face=pose.scatter>.35?'scatter':pose.blend>.5?'back':'front';root.dataset.held=String(hover);}
  function request(){if(!frame&&initialized&&visible&&!document.hidden&&!lost)frame=requestAnimationFrame(render);}
  function stop(){cancelAnimationFrame(frame);frame=0;last=0;}
  function manual(){auto=false;hold=0;}
  function resize(){
    if(!initialized)return;
    const width=stage.clientWidth,height=stage.clientHeight,fov=camera.fov*DEG;
    camera.aspect=width/height;camera.position.z=(width<480?1.08:1.2)*Math.max(CARD_HEIGHT/(2*Math.tan(fov/2)),CARD_WIDTH/(2*Math.tan(fov/2)*camera.aspect));camera.updateProjectionMatrix();
    if(scene.fog){scene.fog.near=camera.position.z+.5;scene.fog.far=camera.position.z+4.5;}
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(width,height,false);request();
  }
  async function palette(){
    if(!initialized)return;
    const version=++paletteVersion,style=getComputedStyle(document.documentElement),mode=dark()?'dark':'light';
    const width=Math.min(renderer.capabilities.maxTextureSize,3072,Math.max(2048,Math.ceil(stage.clientWidth*Math.min(devicePixelRatio||1,2)*1.7/256)*256));
    const artwork=await drawArtwork(mode,width);
    if(version!==paletteVersion)return;
    front=sampleArtwork(artwork.frontMask,count,12345);back=sampleArtwork(artwork.backMask,count,67890);artUrls=artwork.urls;
    for(let i=0;i<count;i++){front.positions[i*3+2]=.045;back.positions[i*3]*=-1;back.positions[i*3+2]=-.045;}
    for(const[plane,image]of[[frontPlane,artwork.front],[backPlane,artwork.back]]){plane.material.map?.dispose();const texture=new THREE.CanvasTexture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());plane.material.map=texture;plane.material.needsUpdate=true;}
    paper.material.color.set(style.getPropertyValue('--surface').trim());outline.material.color.set(style.getPropertyValue('--rule').trim());scene.fog=new THREE.Fog(style.getPropertyValue('--bg').trim(),camera.position.z+.5,camera.position.z+4.5);
    sharpImage.src=artUrls[currentFace];request();
  }
  function updateParticles(){
    const{scatter,blend}=transition(angle),formed=1-scatter;
    for(let i=0;i<count;i++){const j=i*3,seed=seeds[i];for(let k=0;k<3;k++){const shape=front.positions[j+k]*(1-blend)+back.positions[j+k]*blend;positions[j+k]=formed*shape+scatter*(cloud[j+k]+Math.sin(phase*.45+seed+k*2.1)*.065);colors[j+k]=front.colors[j+k]*(1-blend)+back.colors[j+k]*blend;}}
    dots.geometry.attributes.position.needsUpdate=true;dots.geometry.attributes.color.needsUpdate=true;
    const fade=Math.max(0,Math.min(1,(scatter-.004)/.036));
    dots.material.size=(1+scatter*1.25)*2*camera.position.z/Math.max(1,stage.clientHeight);dots.material.opacity=fade*(.74-scatter*.12);
    paper.material.opacity=formed*formed;outline.material.opacity=.9*formed*formed+.03;
    frontPlane.material.opacity=backPlane.material.opacity=formed**4;
    card.rotation.set(0,angle,0);
  }
  function updateSharp(){
    const opacity=Math.max(0,Math.min(1,(Math.abs(Math.cos(angle))-.999)/.001));
    sharp.style.opacity=String(opacity);
    const face=Math.cos(angle)>=0?'front':'back';
    if(face!==currentFace){currentFace=face;if(artUrls)sharpImage.src=artUrls[face];}
    sharpImage.alt=face==='front'?'Crossing symmetry: sum over O of lambda phi phi O squared F Delta ell(u,v) equals zero':'3D Ising island, mixed-correlator bootstrap, Kos et al. (2016), Figure 1, Lambda 43';
    if(opacity===0)return;
    const z=face==='front'?.018:-.018;
    const corners=[[-CARD_WIDTH/2,-CARD_HEIGHT/2,z],[CARD_WIDTH/2,-CARD_HEIGHT/2,z],[CARD_WIDTH/2,CARD_HEIGHT/2,z],[-CARD_WIDTH/2,CARD_HEIGHT/2,z]].map(p=>new THREE.Vector3(...p).applyMatrix4(card.matrixWorld).project(camera));
    const xs=corners.map(p=>(p.x+1)*stage.clientWidth/2),ys=corners.map(p=>(1-p.y)*stage.clientHeight/2);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    Object.assign(sharp.style,{left:(left+right)/2+'px',top:(top+bottom)/2+'px',width:right-left+'px',height:bottom-top+'px',borderRadius:(right-left)*.14/CARD_WIDTH+'px'});
  }
  function render(time){
    frame=0;if(!initialized||!front||!visible||lost||document.hidden)return;
    if(last&&time-last<1000/30){request();return;}
    const dt=last?Math.min((time-last)/1000,.1):0;last=time;const moving=!hover&&!drag;
    if(moving){if(!reduced.matches)phase+=dt;if(auto){if(hold>0)hold-=dt;else{const next=(Math.floor((angle+1e-8)/Math.PI)+1)*Math.PI;angle+=dt*.48;if(angle>=next){angle=next;hold=2.5;}}}}
    updateParticles();ui();renderer.render(scene,camera);updateSharp();root.dataset.state='ready';
    if(moving&&(auto||(!reduced.matches&&transition(angle).scatter>.001)))request();
  }
  function fallback(){stop();root.dataset.state='fallback';sharp.style.opacity='1';sharpImage.src=new URL(`./crossing-front-${dark()?'dark':'light'}.svg`,import.meta.url).href;slider.disabled=true;}
  async function prepare(){
    if(preparing)return;preparing=true;
    try{
      THREE=await import('./vendor/three/three.module.js');
      renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
      const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('role','application');canvas.setAttribute('aria-label','Rotate the equation and Ising island card. Left and right arrows adjust rotation; Home shows the equation, End shows the island. / 可旋转的方程与 Ising island 卡片');stage.prepend(canvas);
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(32,1,.1,50);card=new THREE.Group();scene.add(card);
      const w=CARD_WIDTH/2,h=CARD_HEIGHT/2,r=.14,shape=new THREE.Shape();shape.moveTo(-w+r,-h);shape.lineTo(w-r,-h);shape.quadraticCurveTo(w,-h,w,-h+r);shape.lineTo(w,h-r);shape.quadraticCurveTo(w,h,w-r,h);shape.lineTo(-w+r,h);shape.quadraticCurveTo(-w,h,-w,h-r);shape.lineTo(-w,-h+r);shape.quadraticCurveTo(-w,-h,-w+r,-h);
      paper=new THREE.Mesh(new THREE.ShapeGeometry(shape,12),new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false}));paper.renderOrder=0;card.add(paper);
      outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(16)),new THREE.LineBasicMaterial({transparent:true,depthWrite:false}));outline.position.z=.006;outline.renderOrder=3;card.add(outline);
      frontPlane=new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH,CARD_HEIGHT),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false}));frontPlane.position.z=.018;frontPlane.renderOrder=1;card.add(frontPlane);
      backPlane=new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH,CARD_HEIGHT),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false}));backPlane.rotation.y=Math.PI;backPlane.position.z=-.018;backPlane.renderOrder=1;card.add(backPlane);
      positions=new Float32Array(count*3);colors=new Float32Array(count*3);cloud=new Float32Array(count*3);seeds=new Float32Array(count);const random=seededRandom(24681357);
      for(let i=0;i<count;i++){const z=random()*2-1,phi=random()*TAU,rad=Math.cbrt(random()),xy=Math.sqrt(1-z*z),j=i*3;cloud[j]=xy*Math.cos(phi)*rad*CARD_WIDTH*.39;cloud[j+1]=z*rad*CARD_HEIGHT*.4;cloud[j+2]=xy*Math.sin(phi)*rad*CARD_WIDTH*.49;seeds[i]=random()*TAU;}
      const dot=document.createElement('canvas');dot.width=dot.height=24;const ctx=dot.getContext('2d'),g=ctx.createRadialGradient(12,12,0,12,12,12);g.addColorStop(0,'#fff');g.addColorStop(.35,'#fff');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(0,0,24,24);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));dots=new THREE.Points(geometry,new THREE.PointsMaterial({map:new THREE.CanvasTexture(dot),size:1,sizeAttenuation:true,vertexColors:true,transparent:true,depthWrite:false,alphaTest:.015}));dots.frustumCulled=false;dots.renderOrder=2;card.add(dots);
      initialized=true;resize();await palette();slider.disabled=false;new ResizeObserver(resize).observe(stage);ui();
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;fallback();});canvas.addEventListener('webglcontextrestored',()=>{lost=false;slider.disabled=false;resize();request();});
      canvas.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch'){hover=true;ui();request();}});canvas.addEventListener('pointerleave',()=>{hover=false;ui();last=0;request();});
      canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;manual();drag={id:event.pointerId,x:event.clientX,y:event.clientY,angle,active:event.pointerType!=='touch'};if(drag.active)canvas.setPointerCapture(event.pointerId);});
      canvas.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.active){if(Math.abs(dx)<7||Math.abs(dx)<=Math.abs(dy))return;drag.active=true;canvas.setPointerCapture(event.pointerId);}if(event.cancelable)event.preventDefault();angle=drag.angle+dx/stage.clientWidth*TAU;ui();request();});
      const release=()=>{drag=null;request();};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
      canvas.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End',' '].includes(event.key))return;event.preventDefault();if(event.key===' '){auto=!auto;hold=0;}else{manual();if(event.key==='ArrowLeft')angle-=5*DEG;if(event.key==='ArrowRight')angle+=5*DEG;if(event.key==='Home')angle=0;if(event.key==='End')angle=Math.PI;}ui();request();});hover=canvas.matches(':hover')&&!coarse.matches;ui();request();
    }catch(error){fallback();console.warn('The card is showing its vector front.',error);}
  }
  slider.addEventListener('input',()=>{const next=Number(slider.value);manual();angle=next*DEG;ui();request();});
  const refresh=()=>{if(!initialized||root.dataset.state==='fallback'){sharpImage.src=new URL('./crossing-front-'+(dark()?'dark':'light')+'.svg',import.meta.url).href;return;}palette().catch(error=>console.warn('Card theme could not refresh.',error));};new MutationObserver(refresh).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});scheme.addEventListener('change',refresh);reduced.addEventListener('change',()=>{if(reduced.matches){auto=false;request();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else request();});window.addEventListener('pagehide',stop);window.addEventListener('pageshow',request);
  if('IntersectionObserver'in window){const loader=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){prepare();loader.disconnect();}},{rootMargin:'200px'});loader.observe(stage);new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)request();else stop();},{threshold:.03}).observe(stage);}else{visible=true;prepare();}
}
if(typeof document!=='undefined'){const root=document.getElementById('conformal-lab');if(root)mount(root);}
