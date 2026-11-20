const StudioPrint = (() => {
  const dpi=600, xlink='http://www.w3.org/1999/xlink';
  function pixels(mm){return Math.max(1,Math.round(mm*dpi/25.4));}
  function canvas(w,h) {
    if(w>16384||h>16384||w*h>48000000)throw Error('ภาพที่ 600 dpi ใหญ่เกินพื้นที่หน่วยความจำสำหรับส่งออกรูปภาพ');
    const c=document.createElement('canvas');c.width=w;c.height=h;return c;
  }
  function embed(node,url) {
    node.removeAttribute('href');
    node.setAttributeNS(xlink,'xlink:href',url);
  }
  function physicalSize(node) {
    let matrix=new DOMMatrix();
    for(let el=node;el?.localName!=='svg';el=el.parentElement) {
      const transform=el.transform?.baseVal.consolidate();
      if(transform)matrix=DOMMatrix.fromMatrix(transform.matrix).multiply(matrix);
    }
    return [Math.hypot(matrix.a,matrix.b)*Number(node.getAttribute('width')),
      Math.hypot(matrix.c,matrix.d)*Number(node.getAttribute('height'))];
  }
  function replaceInk(node,shape,ink) {
    const doc=node.ownerDocument,group=doc.createElementNS(NS,'g');
    const x=Number(node.getAttribute('x')),y=Number(node.getAttribute('y'));
    const sx=Number(node.getAttribute('width'))/shape.w,sy=Number(node.getAttribute('height'))/shape.h;
    group.setAttribute('transform','translate('+x+' '+y+') scale('+sx+' '+sy+')');
    if(shape.paper){
      const rect=doc.createElementNS(NS,'rect');
      rect.setAttribute('width',shape.w);rect.setAttribute('height',shape.h);rect.setAttribute('fill',shape.paper);group.append(rect);
    }
    if(shape.d){
      const path=doc.createElementNS(NS,'path');
      path.setAttribute('fill',ink);path.setAttribute('fill-rule','evenodd');path.setAttribute('d',shape.d);group.append(path);
    }
    node.replaceWith(group);
  }
  function session() {
    const images=new Map(), traces=new Map(), resampled=new Map();
    function remember(map,key,make) {
      if(!map.has(key)){
        if(map.size>=128)map.delete(map.keys().next().value);
        map.set(key,make());
      }
      return map.get(key);
    }
    let lowest=Infinity;
    async function prepare(source, format) {
      const doc=new DOMParser().parseFromString(source,'image/svg+xml');
      if(doc.querySelector('parsererror'))throw Error('สร้างโครงสร้าง SVG ไม่สำเร็จ');
      for(const node of doc.querySelectorAll('image')) {
        const url=node.getAttributeNS(xlink,'href')||node.getAttribute('href');
        if(!bitmap(url))throw Error('ภาพประกอบต้องฝังอยู่ใน Template');
        const img=await remember(images,url,()=>imgFrom(url));
        const group=node.closest('[data-outline-ink]');
        if(group) {
          const ink=group.getAttribute('fill'),paper=group.getAttribute('data-paper'),opaque=group.hasAttribute('data-opaque');
          const key=[ink,paper,opaque,url].join('|');
          const shape=remember(traces,key,()=>StudioInkOutline.trace(img,ink,paper,opaque));
          replaceInk(node,shape,ink);
          continue;
        }
        const [w,h]=physicalSize(node);
        if(!(w>0&&h>0))throw Error('ตรวจขนาดภาพประกอบบนฉลาก');
        const native=Math.min(img.naturalWidth*25.4/w,img.naturalHeight*25.4/h);
        lowest=Math.min(lowest,native);
        const pw=format==='pdf'?Math.max(img.naturalWidth,Math.ceil(w*dpi/25.4)):img.naturalWidth;
        const ph=format==='pdf'?Math.max(img.naturalHeight,Math.ceil(h*dpi/25.4)):img.naturalHeight;
        const convert=url.startsWith('data:image/webp;')||pw!==img.naturalWidth||ph!==img.naturalHeight;
        if(convert) {
          const result=remember(resampled,pw+'x'+ph+'|'+url,()=>{
            const c=canvas(pw,ph),ctx=c.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,pw,ph);
            return c.toDataURL('image/png');
          });
          embed(node,result);
        }else embed(node,url);
      }
      return doc.documentElement;
    }
    function detail(){return lowest<599.5?' · ภาพต้นทางต่ำสุด '+Math.round(lowest)+' ppi ที่ขนาดพิมพ์จริง':'';}
    return {prepare,detail};
  }
  function density(bytes,format) {
    if(format==='jpg') {
      const jfif=new Uint8Array([255,224,0,16,74,70,73,70,0,1,1,1,dpi>>8,dpi&255,dpi>>8,dpi&255,0,0]);
      if(bytes[2]===255&&bytes[3]===224&&String.fromCharCode(...bytes.slice(6,11))==='JFIF\0'){
        bytes.set(jfif.subarray(11,16),13);return [bytes];
      }
      return [bytes.subarray(0,2),jfif,bytes.subarray(2)];
    }
    const phys=new Uint8Array(21),v=new DataView(phys.buffer),ppm=Math.round(dpi/.0254);
    v.setUint32(0,9);phys.set([112,72,89,115],4);v.setUint32(8,ppm);v.setUint32(12,ppm);phys[16]=1;
    let crc=0xffffffff;
    for(const n of phys.subarray(4,17)){crc^=n;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    v.setUint32(17,(crc^0xffffffff)>>>0);
    const parts=[bytes.subarray(0,33),phys],view=new DataView(bytes.buffer);
    for(let p=33;p<bytes.length;) {
      const end=p+12+view.getUint32(p);
      if(String.fromCharCode(...bytes.subarray(p+4,p+8))!=='pHYs')parts.push(bytes.subarray(p,end));
      p=end;
    }
    return parts;
  }
  async function raster(root,w,h,format) {
    const c=canvas(pixels(w),pixels(h));
    root.setAttribute('width',c.width);root.setAttribute('height',c.height);
    const url=URL.createObjectURL(new Blob([serial(root)],{type:'image/svg+xml'}));
    const mime=format==='jpg'?'image/jpeg':'image/png';
    try {
      const ctx=c.getContext('2d'),img=await imgFrom(url);
      if(format==='jpg'){ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);}
      ctx.drawImage(img,0,0,c.width,c.height);
      const body=await new Promise((ok,no)=>c.toBlob(blob=>blob?ok(blob):no(Error('สร้างไฟล์ภาพไม่สำเร็จ')),mime,.98));
      if(body.type!==mime)throw Error('เบราว์เซอร์ไม่รองรับไฟล์ภาพชนิดนี้');
      return new Blob(density(new Uint8Array(await body.arrayBuffer()),format),{type:mime});
    }finally{URL.revokeObjectURL(url);}
  }
  function serial(root){return new XMLSerializer().serializeToString(root);}
  return {session,raster,serial};
})();
