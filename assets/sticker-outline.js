// Extract external boundaries from an alpha mask or a uniform surrounding colour.
// All coordinates returned to the layout engine are in the original image space.
const StickerOutline = (() => {
  function distance(point, a, b) {
    const dx=b[0]-a[0], dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
    return (point[0]-a[0]-t*dx)**2+(point[1]-a[1]-t*dy)**2;
  }
  function simplify(ring) {
    let far=1;
    for(let i=2;i<ring.length;i++)
      if(distance(ring[i],ring[0],ring[0])>distance(ring[far],ring[0],ring[0]))far=i;
    ring.push(ring[0]);
    const last=ring.length-1,keep=new Uint8Array(ring.length),work=[[0,far],[far,last]];
    keep[0]=keep[far]=1;
    while(work.length){
      const [a,b]=work.pop();let best=.8**2,split=-1;
      for(let i=a+1;i<b;i++){const d=distance(ring[i],ring[a],ring[b]);if(d>best){best=d;split=i;}}
      if(split>=0){keep[split]=1;work.push([a,split],[split,b]);}
    }
    return ring.filter((_,i)=>keep[i]);
  }
  function trace(img) {
    const scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement('canvas');
    const w=c.width=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=c.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,0,0,w,h);
    const rgba=ctx.getImageData(0,0,w,h).data;
    const stride=w+2,mask=new Uint8Array(stride*(h+2));
    let transparent=0;
    for(let p=3;p<rgba.length;p+=4)if(rgba[p]<64)transparent++;
    const alpha=transparent>=Math.max(1,w*h*.0002);
    let bg;
    if(!alpha){
      const samples=[];
      for(let i=0;i<64;i++){
        const x=Math.round(i*(w-1)/63),y=Math.round(i*(h-1)/63);
        for(const p of [x,(h-1)*w+x,y*w,y*w+w-1])samples.push(Array.from(rgba.subarray(4*p,4*p+3)));
      }
      bg=[0,1,2].map(k=>samples.map(rgb=>rgb[k]).sort((a,b)=>a-b)[128]);
      if(samples.filter(rgb=>rgb.every((v,k)=>Math.abs(v-bg[k])<=24)).length<samples.length*.72)
        throw Error('แยกขอบภาพจากพื้นหลังได้ไม่ชัด กรุณาใช้ PNG พื้นใส หรือวางไฟล์เส้นไดคัท SVG');
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=4*(y*w+x);
      const ink=alpha?rgba[i+3]>=128:Math.max(Math.abs(bg[0]-rgba[i]),Math.abs(bg[1]-rgba[i+1]),Math.abs(bg[2]-rgba[i+2]))>26;
      if(ink)mask[(y+1)*stride+x+1]=1;
    }
    // Flood only from outside. Transparent holes and printed details do not become knife paths.
    const q=new Int32Array(mask.length);
    let head=0,tail=1;mask[0]=2;
    function visit(p){if(mask[p]===0){mask[p]=2;q[tail++]=p;}}
    while(head<tail){
      const p=q[head++],x=p%stride;
      if(x)visit(p-1);if(x<stride-1)visit(p+1);
      if(p>=stride)visit(p-stride);if(p+stride<mask.length)visit(p+stride);
    }
    // Directed grid edges form closed rings; at diagonal contacts follow the tighter right turn.
    const edges=new Map(),delta=[1,stride,-1,-stride];
    function edge(p,d){edges.set(p,(edges.get(p)||0)|(1<<d));}
    for(let y=1;y<=h;y++)for(let x=1;x<=w;x++){
      const p=y*stride+x;
      if(mask[p]===2)continue;
      if(mask[p-stride]===2)edge(p,0);
      if(mask[p+1]===2)edge(p+1,1);
      if(mask[p+stride]===2)edge(p+stride+1,2);
      if(mask[p-1]===2)edge(p+stride,3);
      if(edges.size>110000)throw Error('ขอบภาพมีรายละเอียดถี่เกินไปสำหรับเส้นตัด กรุณาใช้เส้น SVG');
    }
    const paths=[];let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,rings=0,ignored=0;
    const sx=img.naturalWidth/w,sy=img.naturalHeight/h;
    while(edges.size){
      const first=edges.keys().next().value,ring=[];let p=first,d=0,twiceArea=0;
      do{
        const options=edges.get(p);
        if(!options)throw Error('พบเส้นขาดระหว่างอ่านขอบภาพ');
        const nextDir=[(d+1)%4,d,(d+3)%4,(d+2)%4].find(k=>options&(1<<k));
        const rest=options&~(1<<nextDir);
        if(rest)edges.set(p,rest);else edges.delete(p);
        const next=p+delta[nextDir];
        const x=p%stride-1,y=Math.floor(p/stride)-1;
        twiceArea+=x*(Math.floor(next/stride)-1)-y*(next%stride-1);
        ring.push([x,y]);p=next;d=nextDir;
      }while(p!==first);
      if(twiceArea<8){ignored++;continue;}
      const points=simplify(ring);
      if(points.length<3){ignored++;continue;}
      if(++rings>128||paths.length+points.length>12000)throw Error('พบชิ้นส่วนย่อยจำนวนมาก กรุณาใช้ไฟล์ SVG ที่กำหนดเส้นตัดแล้ว');
      for(const [i,point] of points.entries()){
        const x=point[0]*sx,y=point[1]*sy;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        paths.push([i?'L':'M',x,y]);
      }
      paths.push(['Z']);
    }
    if(!rings)throw Error('ไม่พบขอบชิ้นงานที่แยกจากพื้นหลัง ลองใช้ PNG พื้นใส หรือวางเส้น SVG');
    return {x:minX,y:minY,width:maxX-minX,height:maxY-minY,paths,rings,ignored,alpha};
  }
  return {trace};
})();
