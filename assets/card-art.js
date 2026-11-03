export const IMAGE_WIDTH=1200, IMAGE_HEIGHT=760, CARD_WIDTH=7.5, CARD_HEIGHT=4.75;
export function transition(angle){const scatter=Math.sin(angle)**2;return{scatter:scatter<1e-12?0:scatter,blend:(1-Math.cos(angle))/2};}
export function seededRandom(seed){return()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};}

function image(url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}
function raster(img,width){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width*IMAGE_HEIGHT/IMAGE_WIDTH);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas;}
export async function drawArtwork(mode,width){
  const urls={front:new URL(`./crossing-front-${mode}.svg`,import.meta.url).href,back:new URL(`./ising-back-${mode}.svg`,import.meta.url).href};
  const [front,back]=await Promise.all([image(urls.front),image(urls.back)]);
  return{front:raster(front,width),back:raster(back,width),frontMask:raster(front,IMAGE_WIDTH),backMask:raster(back,IMAGE_WIDTH),urls};
}
export function sampleArtwork(canvas,count,seed){
  const data=canvas.getContext('2d').getImageData(0,0,IMAGE_WIDTH,IMAGE_HEIGHT).data,pixels=[];
  for(let y=0;y<IMAGE_HEIGHT;y+=2)for(let x=0;x<IMAGE_WIDTH;x+=2)if(data[(y*IMAGE_WIDTH+x)*4+3]>35)pixels.push(y*IMAGE_WIDTH+x);
  const random=seededRandom(seed);
  for(let i=pixels.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pixels[i],pixels[j]]=[pixels[j],pixels[i]];}
  const positions=new Float32Array(count*3),colors=new Float32Array(count*3);
  const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
  for(let i=0;i<count;i++){const pixel=pixels[i%pixels.length],x=pixel%IMAGE_WIDTH,y=Math.floor(pixel/IMAGE_WIDTH),j=i*3;positions[j]=(x/IMAGE_WIDTH-.5)*CARD_WIDTH;positions[j+1]=(.5-y/IMAGE_HEIGHT)*CARD_HEIGHT;for(let c=0;c<3;c++)colors[j+c]=linear(data[pixel*4+c]);}
  return{positions,colors};
}
