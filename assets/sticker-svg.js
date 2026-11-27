// Accept self-contained outlined graphics. A cut group shares its artboard with the print group.
const StickerSVG=(()=>{
 const ns='http://www.w3.org/2000/svg';
 const allowed=new Set(['svg','g','defs','title','desc','path','rect','circle','ellipse','polygon','polyline','line','linearGradient','radialGradient','stop','clipPath','image']);
 function parse(text){
  const doc=new DOMParser().parseFromString(text,'image/svg+xml'),root=doc.documentElement;
  if(root.localName!=='svg'||doc.querySelector('parsererror'))throw Error('เปิด SVG ไม่ได้');
  for(const el of [root,...root.querySelectorAll('*')]){
   if(el.namespaceURI!==ns||!allowed.has(el.localName))throw Error('SVG นี้ใช้ '+el.localName+' · กรุณาแปลงตัวอักษรเป็น Outline ใช้ Presentation Attributes หรือส่งเป็น PDF');
   for(const attr of el.attributes){
    if(attr.localName.startsWith('on')||attr.localName==='style'||/url\s*\(\s*[^#]/i.test(attr.value))throw Error('กรุณาบันทึก SVG แบบ Presentation Attributes หรือส่งเป็น PDF');
    if(attr.localName==='href'&&!(el.localName==='image'&&/^data:image\/(png|jpe?g);base64,/i.test(attr.value)))throw Error('กรุณาฝังภาพ PNG/JPG ลงใน SVG');
   }
  }
  return root;
 }
 async function pdf(root,size){
  const el=root.cloneNode(true);el.setAttribute('width',size.width);el.setAttribute('height',size.height);el.setAttribute('viewBox',size.viewBox.join(' '));
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-100000px;top:0;pointer-events:none';host.append(el);document.body.append(host);
  try{const pdf=new jspdf.jsPDF({unit:'mm',format:[size.width,size.height],orientation:size.width>=size.height?'landscape':'portrait',compress:true,floatPrecision:12});
   await pdf.svg(el,{x:0,y:0,width:size.width,height:size.height});return new Uint8Array(pdf.output('arraybuffer'));
  }finally{host.remove();}
 }
 async function cutOnly(root,size){
  const bytes=await pdf(root,size),{m}=await pdfPage(bytes,0);return contours(m,null);
 }
 async function read(file,onlyCut=false){
  const root=parse(await file.text()),size=StudioSourceImport.geometry(root,50);
  if(onlyCut)return {...size,cut:await cutOnly(root,size)};
  let cut=null;const group=[...root.querySelectorAll('g')].find(g=>/^die?[ _-]*cut$|^cutcontour$/i.test(g.id));
  if(group){
   const knife=root.cloneNode(true);const keep=knife.querySelector('[id="'+CSS.escape(group.id)+'"]');
   for(let node=keep;node!==knife;node=node.parentElement){for(const other of [...node.parentElement.children])if(other!==node&&other.localName!=='defs')other.remove();}
   cut=await cutOnly(knife,size);group.remove();
  }
  const art=await pdf(root,size),img=await renderPdf(art,900);
  return {art,img,width:size.width,height:size.height,cut,reason:size.reason,svg:new XMLSerializer().serializeToString(root),ppi:root.querySelector('image')?null:Infinity};
 }
 return {read};
})();
