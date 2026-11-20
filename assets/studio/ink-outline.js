// Trace the half-coverage contour of a single-colour source text patch. Subpixel
// edge crossings preserve counters and small Thai marks better than row rectangles.
const StudioInkOutline = (() => {
  function colour(value) {
    return [1,3,5].map(i => parseInt(value.slice(i,i+2),16));
  }
  function trace(img, ink, paper, opaquePaper) {
    const w=img.naturalWidth, h=img.naturalHeight, stride=w+2;
    if(w*h>4000000)throw Error('ช่องข้อความมีพิกเซลมากเกินไป เลือก Outline จากฟอนต์สำหรับช่องขนาดนี้');
    const canvas=document.createElement('canvas');
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,0,0);
    const rgba=ctx.getImageData(0,0,w,h).data;
    const fg=colour(ink);
    if(!paper) {
      // Older source patches removed the paper to transparent pixels. Recover
      // the paper for opaque capture from its perimeter colour.
      paper='#ffffff';
      if(opaquePaper) {
        const bg=SourceArt.paper(rgba,w,h);
        paper='#'+bg.map(n=>n.toString(16).padStart(2,'0')).join('');
      }
    }
    const bg=colour(paper),axis=fg.map((n,i)=>n-bg[i]);
    const length=axis.reduce((a,n)=>a+n*n,0)||1;
    const cov=new Float32Array(stride*(h+2));
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const i=4*(y*w+x);
      cov[(y+1)*stride+x+1]=Math.min(1,Math.max(0,
        axis.reduce((a,n,k)=>a+n*(rgba[i+k]-bg[k]),0)/length))*rgba[i+3]/255;
    }
    const edges=new Map(), points=new Map();
    function join(a,b) {
      for(const [from,to] of [[a,b],[b,a]]) {
        const list=edges.get(from);
        if(list)list.push(to);else edges.set(from,[to]);
      }
    }
    for(let y=0;y<=h;y++)for(let x=0;x<=w;x++) {
      const i=y*stride+x, indices=[i,i+1,i+stride+1,i+stride];
      const mask=indices.reduce((a,n,k)=>a|(Number(cov[n]>=.5)<<k),0);
      if(!mask||mask===15)continue;
      const hits=[];
      const ids=[2*i,2*(i+1)+1,2*(i+stride),2*i+1];
      for(let k=0;k<4;k++) {
        const a=indices[k],b=indices[(k+1)%4];
        if((cov[a]>=.5)===(cov[b]>=.5))continue;
        const id=ids[k];hits.push(id);
        if(!points.has(id)){
          const t=(.5-cov[a])/(cov[b]-cov[a]);
          const px=a%stride+(b%stride-a%stride)*t-.5;
          const py=Math.floor(a/stride)+(Math.floor(b/stride)-Math.floor(a/stride))*t-.5;
          points.set(id,[+px.toFixed(2),+py.toFixed(2)]);
        }
      }
      if(hits.length===4 && mask===5)hits.push(hits.shift());
      for(let k=0;k<hits.length;k+=2)join(hits[k],hits[k+1]);
    }
    const paths=[];
    while(edges.size) {
      const first=edges.keys().next().value;
      let cur=first,prev=-1;const contour=[];
      do {
        const links=edges.get(cur);
        if(!links)break;
        contour.push(points.get(cur));edges.delete(cur);
        const next=links[0]===prev?links[1]:links[0];
        prev=cur;cur=next;
      }while(cur!==first);
      if(contour.length<3)continue;
      paths.push('M'+contour.map(p=>p.join(' ')).join('L')+'Z');
    }
    return {d:paths.join(''),paper:opaquePaper?paper:null,w,h};
  }
  return {trace};
})();
