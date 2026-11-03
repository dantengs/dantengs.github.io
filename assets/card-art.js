export const IMAGE_WIDTH = 1200;
export const IMAGE_HEIGHT = 760;
export const CARD_WIDTH = 7.5;
export const CARD_HEIGHT = 4.75;
export function transition(angle) {
  const scatter = Math.sin(angle) ** 2;
  return { scatter: scatter < 1e-12 ? 0 : scatter, blend: (1 - Math.cos(angle)) / 2 };
}
export function seededRandom(seed) {
  return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
}

function text(ctx, value, x, y, size, color, align = 'left', italic = false) {
  ctx.fillStyle = color;
  ctx.font = `${italic ? 'italic ' : ''}${size}px 'Cambria Math', 'Times New Roman', serif`;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function equation(ctx, color) {
  const start = 254, baseline = 566;
  text(ctx, '∑', start, baseline + 7, 112, color);
  text(ctx, '𝒪', start + 35, baseline + 49, 36, color, 'center');
  text(ctx, 'λ', start + 105, baseline, 85, color, 'left', true);
  text(ctx, '2', start + 153, baseline - 49, 38, color);
  text(ctx, 'φφ𝒪', start + 146, baseline + 30, 38, color, 'left', true);
  text(ctx, 'F', start + 267, baseline, 85, color, 'left', true);
  text(ctx, 'Δ,ℓ', start + 316, baseline + 30, 38, color);
  text(ctx, '(u, v) = 0', start + 410, baseline, 78, color, 'left', true);
}
export function drawArtwork(palette, island) {
  const front = document.createElement('canvas'), back = document.createElement('canvas');
  front.width = back.width = IMAGE_WIDTH; front.height = back.height = IMAGE_HEIGHT;
  const f = front.getContext('2d');
  text(f, 'Crossing symmetry', 88, 104, 55, palette.ink);
  f.strokeStyle = palette.ink; f.lineWidth = 6; f.lineCap = 'round'; f.lineJoin = 'round';
  f.beginPath();
  f.moveTo(125, 185); f.lineTo(250, 280); f.lineTo(125, 375);
  f.moveTo(520, 185); f.lineTo(395, 280); f.lineTo(520, 375);
  f.moveTo(250, 280); f.lineTo(395, 280);
  f.moveTo(705, 185); f.lineTo(905, 235); f.lineTo(1105, 185);
  f.moveTo(705, 375); f.lineTo(905, 325); f.lineTo(1105, 375);
  f.moveTo(905, 235); f.lineTo(905, 325); f.stroke();
  f.fillStyle = palette.ink;
  for (const [x,y] of [[250,280],[395,280],[905,235],[905,325]]) { f.beginPath(); f.arc(x,y,6,0,Math.PI*2); f.fill(); }
  text(f, '=', 615, 300, 72, palette.ink, 'center');
  text(f, 's : (12)(34)', 323, 437, 29, palette.muted, 'center');
  text(f, 't : (14)(23)', 905, 437, 29, palette.muted, 'center');
  equation(f, palette.ink);

  const b = back.getContext('2d');
  text(b, '3D Ising island', 88, 104, 55, palette.ink);
  text(b, 'Λ = 43', 1106, 104, 32, palette.muted, 'right');
  const plot = { left: 288, top: 170, width: 720, height: 365 };
  const { xMin, xMax, yMin, yMax } = island.bounds;
  const px = x => plot.left + (x - xMin) / (xMax - xMin) * plot.width;
  const py = y => plot.top + plot.height - (y - yMin) / (yMax - yMin) * plot.height;
  b.strokeStyle = palette.muted; b.lineWidth = 3;
  b.beginPath(); b.moveTo(plot.left,plot.top-5); b.lineTo(plot.left,plot.top+plot.height); b.lineTo(plot.left+plot.width+8,plot.top+plot.height); b.stroke();
  for (const x of [.518148, .518149, .518150]) {
    b.beginPath(); b.moveTo(px(x),py(yMin)); b.lineTo(px(x),py(yMin)+10); b.stroke();
    text(b, x.toFixed(6), px(x), py(yMin)+53, 32, palette.muted, 'center');
  }
  for (const y of [1.41261,1.412625,1.41264]) {
    b.beginPath(); b.moveTo(plot.left-10,py(y)); b.lineTo(plot.left,py(y)); b.stroke();
    text(b, y.toFixed(y === 1.412625 ? 6 : 5), plot.left-24, py(y)+11, 32, palette.muted, 'right');
  }
  text(b, 'Δ', 1024, 581, 49, palette.ink); text(b, 'σ', 1059, 597, 30, palette.ink, 'left', true);
  b.save(); b.translate(88,350); b.rotate(-Math.PI/2); text(b, 'Δ', -25, 0, 49, palette.ink); text(b, 'ε', 10, 16, 30, palette.ink, 'left', true); b.restore();
  b.beginPath(); island.boundary.forEach(([x,y],i) => i ? b.lineTo(px(x),py(y)) : b.moveTo(px(x),py(y))); b.closePath();
  b.fillStyle = palette.accent; b.globalAlpha = .19; b.fill(); b.globalAlpha = 1;
  b.strokeStyle = palette.accent; b.lineWidth = 5; b.stroke();
  text(b, 'Mixed-correlator bootstrap', 600, 658, 30, palette.muted, 'center');
  return { front, back };
}

export function sampleArtwork(canvas, count, seed) {
  const data = canvas.getContext('2d').getImageData(0,0,IMAGE_WIDTH,IMAGE_HEIGHT).data;
  const pixels = [];
  for (let y=0;y<IMAGE_HEIGHT;y+=2) for(let x=0;x<IMAGE_WIDTH;x+=2) if(data[(y*IMAGE_WIDTH+x)*4+3]>35) pixels.push(y*IMAGE_WIDTH+x);
  const random = seededRandom(seed);
  for(let i=pixels.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [pixels[i],pixels[j]]=[pixels[j],pixels[i]]; }
  const positions = new Float32Array(count*3), colors = new Float32Array(count*3);
  const linear = v => { v/=255; return v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4; };
  for(let i=0;i<count;i++) {
    const pixel=pixels[i%pixels.length], x=pixel%IMAGE_WIDTH, y=Math.floor(pixel/IMAGE_WIDTH), j=i*3;
    positions[j]=(x/IMAGE_WIDTH-.5)*CARD_WIDTH; positions[j+1]=(.5-y/IMAGE_HEIGHT)*CARD_HEIGHT;
    colors[j]=linear(data[pixel*4]); colors[j+1]=linear(data[pixel*4+1]); colors[j+2]=linear(data[pixel*4+2]);
  }
  return { positions, colors };
}
