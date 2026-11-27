// Extract one elongated, connected product on a plain background. The working
// coordinates follow its principal axis; all detail tolerances are applied at print size.
const PenOutline = (() => {
  const mid = a => a.sort((x,y)=>x-y)[Math.floor(a.length/2)];
  const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
  function analyse(image) {
    const factor=Math.min(1,1400/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');
    const w=canvas.width=Math.max(1,Math.round(image.width*factor)),h=canvas.height=Math.max(1,Math.round(image.height*factor));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='white';ctx.fillRect(0,0,w,h);ctx.drawImage(image,0,0,w,h);
    const rgb=ctx.getImageData(0,0,w,h).data,edge=[];
    for(let i=0;i<64;i++){const x=Math.round((w-1)*i/63),y=Math.round((h-1)*i/63);edge.push(x,(h-1)*w+x,y*w,y*w+w-1);}
    const bg=[0,1,2].map(c=>mid(edge.map(p=>rgb[4*p+c])));
    const contrast=p=>Math.max(Math.abs(rgb[4*p]-bg[0]),Math.abs(rgb[4*p+1]-bg[1]),Math.abs(rgb[4*p+2]-bg[2]));
    if(edge.filter(p=>contrast(p)<32).length<edge.length*.76)throw Error('พื้นหลังไม่เรียบพอ ลองภาพด้านข้างบนพื้นสีเดียวหรือ PNG พื้นใส');
    const mask=new Uint8Array(w*h),queue=new Int32Array(w*h);
    const threshold=Math.max(19,mid(edge.map(contrast))*2.5);
    for(let p=0;p<mask.length;p++)mask[p]=Number(contrast(p)>threshold);
    function add(p,n){if(mask[p]!==1)return n;mask[p]=2;queue[n]=p;return n+1;}
    let best=new Int32Array(0),runner=0;
    for(let p=0;p<mask.length;p++)if(mask[p]===1){
      let n=add(p,0);
      for(let i=0;i<n;i++){
        const a=queue[i],x=a%w;if(x)n=add(a-1,n);if(x<w-1)n=add(a+1,n);
        if(a>=w)n=add(a-w,n);if(a+w<w*h)n=add(a+w,n);
      }
      if(n>best.length){runner=best.length;best=queue.slice(0,n);}else runner=Math.max(runner,n);
    }
    if(best.length<100||runner>best.length*.22)throw Error('แยกปากกาหนึ่งด้ามได้ไม่ชัด ลองภาพสินค้าทีละด้ามที่เห็นหัวและท้ายครบ');
    let mx=0,my=0,xx=0,xy=0,yy=0;
    for(const p of best){mx+=p%w;my+=Math.floor(p/w);}mx/=best.length;my/=best.length;
    for(const p of best){const x=p%w-mx,y=Math.floor(p/w)-my;xx+=x*x;xy+=x*y;yy+=y*y;}
    const a=.5*Math.atan2(2*xy,xx-yy),cs=Math.cos(a),sn=Math.sin(a);
    let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
    mask.fill(0);
    for(const p of best){mask[p]=1;const u=p%w-mx,v=Math.floor(p/w)-my,x=u*cs+v*sn,y=-u*sn+v*cs;xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
    const W=Math.ceil(xmax-xmin)+1,H=Math.ceil(ymax-ymin)+1;
    if(W<45||W/H<2.7||best.length/(W*H)<.24)throw Error('ยังไม่พบทรงปากกาด้านข้างที่ชัดพอ กรุณาลองภาพใกล้ขึ้นหรือเปลี่ยนพื้นหลัง');
    const proof=document.createElement('canvas');proof.width=W;proof.height=H;
    const g=proof.getContext('2d',{willReadFrequently:true});g.setTransform(cs,-sn,sn,cs,-mx*cs-my*sn-xmin,mx*sn-my*cs-ymin);g.drawImage(canvas,0,0);
    const pixels=g.getImageData(0,0,W,H).data;
    const top=[],bottom=[];
    for(let x=0;x<W;x++){
      let t=H,b=-1;
      for(let y=0;y<H;y++){const u=x+xmin,v=y+ymin,sx=Math.round(mx+cs*u-sn*v),sy=Math.round(my+sn*u+cs*v);if(sx>=0&&sx<w&&sy>=0&&sy<h&&mask[sy*w+sx]){t=Math.min(t,y);b=y;}}
      top.push(t);bottom.push(b);
    }
    for(let x=0;x<W;x++)if(bottom[x]<0){let k=x;while(k<W&&bottom[k]<0)k++;const neighbor=x?x-1:Math.min(k,W-1);top[x]=top[neighbor];bottom[x]=bottom[neighbor];}
    return {W,H,top,bottom,pixels,proof};
  }
  function simplify(line,tol){
    const end=line.length-1;if(end<2)return line;
    const keep=new Set([0,end]),stack=[[0,end]];
    while(stack.length){
      const [i,j]=stack.pop(),a=line[i],b=line[j],dx=b[0]-a[0],dy=b[1]-a[1];let max=tol,cut=0;
      for(let k=i+1;k<j;k++){const p=line[k],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));const d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d>max){max=d;cut=k;}}
      if(cut){keep.add(cut);stack.push([i,cut],[cut,j]);}
    }
    return [...keep].sort((a,b)=>a-b).map(i=>line[i]);
  }
  const num=n=>+n.toFixed(3),pt=p=>p.map(num).join(' ');
  function curve(points,closed,radius){
    if(!closed){
      let d='M'+pt(points[0]);for(let i=1;i+1<points.length;i++){const p=points[i],b=points[i+1];d+='Q'+pt(p)+' '+pt([(p[0]+b[0])/2,(p[1]+b[1])/2]);}return d+'L'+pt(points.at(-1));
    }
    let s='';
    for(let i=0;i<points.length;i++){
      const p=points[i],a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];
      const inset=q=>{const t=Math.min(.27,radius/(dist(p,q)||1));return [p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])];};
      s+=(i?'L':'M')+pt(inset(a))+'Q'+pt(p)+' '+pt(inset(b));
    }return s+'Z';
  }
  function draw(data,length,stroke,gap,ink){
    const {W,H,top,bottom,pixels}=data;
    if(!(length>=10&&length<=600&&stroke>=.1&&stroke<=2&&gap>=.1&&gap<=3))throw Error('ตรวจขนาดพิมพ์ 10–600 มม. เส้น 0.1–2 มม. และช่องไฟ 0.1–3 มม.');
    const scale=(length-stroke)/W,clear=(gap+stroke)/scale;
    if(H*scale<3*stroke)throw Error('ขนาดพิมพ์เล็กเกินความหนาเส้นที่เลือก');
    const tol=Math.max(1.35,stroke*.55/scale),smooth=(v,x)=>mid(v.slice(Math.max(0,x-2),Math.min(v.length,x+3)));
    const topLine=top.map((_,x)=>[x,smooth(top,x)]),bottomLine=bottom.map((_,x)=>[x,smooth(bottom,x)+1]);
    topLine[W-1][0]=bottomLine[W-1][0]=W;
    const outer=simplify(topLine,tol).concat(simplify(bottomLine,tol).reverse());
    const paths=[curve(outer,true,Math.max(1,tol*1.3))];
    const idx=(x,y)=>4*(Math.max(0,Math.min(H-1,Math.round(y)))*W+Math.max(0,Math.min(W-1,Math.round(x))));
    const delta=(i,j)=>Math.hypot(pixels[i]-pixels[j],pixels[i+1]-pixels[j+1],pixels[i+2]-pixels[j+2])/Math.sqrt(3);
    // A joint should cross most of the pen, unlike lettering or isolated glare.
    const levels=[.15,.3,.5,.7,.85],seams=[];
    const step=Math.max(1,Math.round(W*.0035)),slant=Math.min(12,Math.ceil(H*.18));
    for(let x=step+slant;x<W-step-slant;x++){
      if(bottom[x]-top[x]<clear*2)continue;
      let best=0,tilt=0;
      for(let t=-slant;t<=slant;t+=Math.max(1,Math.floor(slant/4))){
        const scores=levels.map(q=>{const u=Math.round(x+(q-.5)*2*t),y=top[u]+q*(bottom[u]-top[u]);return delta(idx(u-step,y),idx(u+step,y));}).sort((a,b)=>a-b);
        const score=.5*(scores[1]+scores[2])-Math.abs(t)*.65;if(score>best){best=score;tilt=t;}
      }
      if(best>22)seams.push({x,score:best,tilt});
    }
    const accepted=[];
    const seamLimit=Math.max(2,Math.min(6,Math.floor(length/(18*(stroke+gap)))));
    for(const s of seams.sort((a,b)=>b.score-a.score)){
      if(accepted.every(o=>Math.abs(o.x-s.x)>Math.max(clear*1.3,step*2.8,W*.021))){accepted.push(s);if(accepted.length===seamLimit)break;}
    }
    // A one-sided outward step is evidence for the free end of an overlapping clip.
    // Follow its underside through the photograph; use the actual silhouette for its outer edge.
    let ledge=null;
    for(const direction of [-1,1])for(const side of [-1,1]){
      const wall=side===-1?top:bottom,opposite=side===-1?bottom:top,span=Math.max(3,Math.round(W*.009));
      for(let k=Math.floor(.34*W);k<W*.77;k++){
        const x=direction===1?k:W-1-k,near=x-direction*span,far=x+direction*span;
        const jump=(wall[far]-wall[near])*side,other=Math.abs(opposite[far]-opposite[near]);
        if(jump<Math.max(3,H*.085)||other>jump*.52)continue;
        const score=jump-other;
        if(!ledge||score>ledge.score)ledge={direction,side,x,near,far,score,wall};
      }
    }
    let clip=[];
    if(ledge){
      const {direction,side,x,far,near,wall}=ledge,seed=wall[near],line=[];
      let py=seed,lastGood=0,good=0;
      for(let u=far;u>1&&u<W-2;u+=direction){
        if((wall[u]-seed)*side<-1)break;
        const thick=bottom[u]-top[u],amin=Math.max(2,Math.ceil(clear),Math.round(thick*.23)),amax=Math.floor(thick*.45);
        let win=-Infinity,next=py,edgeScore=0;
        for(let d=amin;d<=amax;d++){
          const y=wall[u]-side*d;
          const evidence=delta(idx(u,y-2),idx(u,y+2));
          const score=evidence-Math.abs(y-py)*8-Math.abs(d-thick*.24)*.65;
          if(score>win){win=score;next=y;edgeScore=evidence;}
        }
        if(win===-Infinity)break;
        py+=Math.max(-1,Math.min(1,next-py));line.push([u,py]);
        if(edgeScore>16){good++;lastGood=line.length;}
        if(line.length-lastGood>W*.044)break;
      }
      if(lastGood>W*.075&&good>lastGood*.47){
        const clean=line.slice(0,lastGood).map(([u,y],i)=>[u,mid(line.slice(Math.max(0,i-4),Math.min(lastGood,i+5)).map(p=>p[1]))]);
        clip=simplify([[near,wall[near]],...clean],tol*1.5);
      }
    }
    for(const {x,tilt} of accepted){
      const l=x-tilt,r=x+tilt;let t=top[l],b=bottom[r]+1;
      for(let k=1;k<clip.length;k++){
        const a=clip[k-1],z=clip[k];if((a[0]-x)*(z[0]-x)>0||a[0]===z[0])continue;
        const y=a[1]+(x-a[0])*(z[1]-a[1])/(z[0]-a[0]);if(ledge.side===-1)t=y;else b=y;
      }
      if(b-t>clear)paths.push(curve([[l,t],[r,b]],false));
    }
    if(clip.length)paths.push(curve(clip,false));
    // Follow sustained paired colour boundaries in the end sections. Short text strokes,
    // central refill lines and broad smooth reflection bands are suppressed.
    let active=[];
    const tracks=[],minRun=Math.max(12,W*.075),stride=Math.max(1,Math.floor(W/550));
    for(let x=0;x<W;x+=stride){
      if(x>W*.44&&x<W*.56)continue;
      active=active.filter(t=>x-t.lastX<=stride*4);
      const edges=[];
      for(let y=Math.ceil(top[x]+Math.max(clear,2));y<bottom[x]-Math.max(clear,2);y++){
        const d=delta(idx(x,y-1),idx(x,y+1));
        if(d>=28&&d>=delta(idx(x,y-2),idx(x,y))&&d>=delta(idx(x,y),idx(x,y+2)))edges.push({y,d});
      }
      const used=new Set();
      for(const e of edges.sort((a,b)=>b.d-a.d)){
        if([...used].some(t=>Math.abs(t.lastY-e.y)<2))continue;
        let match=null,nearest=Infinity;
        for(let k=active.length-1;k>=0;k--){const t=active[k];if(used.has(t)||x-t.lastX>stride*4)continue;const d=Math.abs(t.lastY-e.y);if(d<nearest&&d<=Math.max(2,stride*1.8)){match=t;nearest=d;}}
        if(!match){match={line:[],strength:0};tracks.push(match);active.push(match);}
        match.line.push([x,e.y]);match.lastX=x;match.lastY=e.y;match.strength+=e.d;used.add(match);
      }
    }
    const long=tracks.filter(t=>t.lastX-t.line[0][0]>=minRun&&t.line.length*stride>=(t.lastX-t.line[0][0])*.65);
    let pair=null,bestScore=0;
    for(let i=0;i<long.length;i++)for(let j=i+1;j<long.length;j++){
      const a=long[i],b=long[j],start=Math.max(a.line[0][0],b.line[0][0]),end=Math.min(a.lastX,b.lastX);
      if(end-start<minRun||end-start>W*.43||accepted.some(s=>s.x>start+step&&s.x<end-step))continue;
      const ay=mid(a.line.map(p=>p[1])),by=mid(b.line.map(p=>p[1])),width=Math.abs(ay-by);
      if(width<clear||width>H*.5)continue;
      const score=(end-start)*Math.min(a.strength/a.line.length,b.strength/b.line.length);
      if(score>bestScore){pair={a,b,start,end};bestScore=score;}
    }
    if(!ledge&&pair){
      const trim=t=>simplify(t.line.filter(p=>p[0]>=pair.start&&p[0]<=pair.end),tol);
      const a=trim(pair.a),b=trim(pair.b);if(a.length>1&&b.length>1)paths.push(curve(a.concat(b.reverse()),true,tol));
    }
    const height=H*scale+stroke,pad=stroke/(2*scale),color=ink==='blue'?'#193b79':'#171717';
    const view=[-pad,-pad,length/scale,height/scale].map(num).join(' ');
    const lines=paths.map(d=>'<path d="'+d+'"/>').join('');
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+num(length)+'mm" height="'+num(height)+'mm" viewBox="'+view+'"><g fill="none" stroke="'+color+'" stroke-width="'+num(stroke/scale)+'" stroke-linejoin="round" stroke-linecap="round">'+lines+'</g></svg>';
    return {svg,paths,scale,pad,height,color};
  }
  return {analyse,draw};
})();
