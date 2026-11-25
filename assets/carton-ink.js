// Render a proof on kraft. Production output uses each original asset as a PDF luminosity mask.
const CartonInk=(()=>{
 const blue=[27,65,137],black=[0,0,0],cache=new WeakMap(),pt=72/25.4;
 function tint(img,w,h,ink,hex){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
  const pixels=ctx.getImageData(0,0,w,h),d=pixels.data,rgb=ink==='black'?black:(hex&&/^#[0-9a-f]{6}$/i.test(hex)?hex.slice(1).match(/../g).map(x=>parseInt(x,16)):blue);
  for(let i=0;i<d.length;i+=4){
   const light=(.30*d[i]+.59*d[i+1]+.11*d[i+2])/255;
   d[i+3]=Math.round(d[i+3]*(1-light));d[i]=rgb[0];d[i+1]=rgb[1];d[i+2]=rgb[2];
  }
  ctx.putImageData(pixels,0,0);return {canvas,url:canvas.toDataURL('image/png')};
 }
 function preview(asset,ink,hex){
  const entries=cache.get(asset)||{};cache.set(asset,entries);
  const key=ink+(hex||'');if(!entries[key]){
   const img=asset.img,scale=Math.min(2048/Math.max(img.naturalWidth,img.naturalHeight),asset.vector?6:1);
   entries[key]=tint(img,Math.max(1,Math.round(img.naturalWidth*scale)),Math.max(1,Math.round(img.naturalHeight*scale)),ink,hex);
  }
  return entries[key];
 }
 async function svg(asset,width,ink,hex){
  let img=asset.img;
  if(asset.native){img=new Image();img.src=await CartonPDF.svgBitmap(asset,width);await img.decode();}
  const scale=Math.min(asset.native?1:width*600/25.4/img.naturalWidth,8192/Math.max(img.naturalWidth,img.naturalHeight),Math.sqrt(16000000/(img.naturalWidth*img.naturalHeight)));
  return tint(img,Math.max(1,Math.round(img.naturalWidth*scale)),Math.max(1,Math.round(img.naturalHeight*scale)),ink,hex).url;
 }
 async function source(asset,w,h){
  if(asset.native)return asset.native;
  const pdf=new jspdf.jsPDF({unit:'pt',format:[w,h],orientation:w>=h?'landscape':'portrait',compress:true});
  if(asset.vector){
   const el=asset.vector.cloneNode(true);el.style.cssText='position:absolute;left:-99999px;top:0';
   el.setAttribute('width',w);el.setAttribute('height',h);document.body.append(el);
   try{await pdf.svg(el,{x:0,y:0,width:w,height:h});}finally{el.remove();}
  }else{
   let url=asset.url;
   if(/^data:image\/svg/i.test(url)){
    const scale=Math.min(600/72,8192/Math.max(w,h),Math.sqrt(16000000/(w*h)));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w*scale));c.height=Math.max(1,Math.ceil(h*scale));c.getContext('2d').drawImage(asset.img,0,0,c.width,c.height);url=c.toDataURL();
   }
   pdf.addImage(url,0,0,w,h);
  }
  return {bytes:pdf.output('arraybuffer')};
 }
 async function pdf(svg,width,height,items,assets,ink){
  const placed=[...svg.querySelectorAll('image')].map(im=>({asset:assets[items[Number(im.getAttribute('data-item'))].asset],rect:['x','y','width','height'].map(k=>Number(im.getAttribute(k))*pt)}));
  await CartonPDF.load();
  const doc=await PDFLib.PDFDocument.create(),ctx=doc.context,page=doc.addPage([width*pt,height*pt]),key=PDFLib.PDFName.of;
  const states=ctx.obj({}),resources=ctx.obj({ExtGState:states});
  const invert=ctx.register(ctx.obj({FunctionType:2,Domain:[0,1],Range:[0,1],C0:[1],C1:[0],N:1}));
  if(ink==='blue'){
   const alternate=ctx.register(ctx.obj({FunctionType:2,Domain:[0,1],C0:[1,1,1],C1:blue.map(n=>n/255),N:1}));
   resources.set(key('ColorSpace'),ctx.obj({Ink:['Separation','Carton Blue','DeviceRGB',alternate]}));
  }
  const commands=[];
  for(const [i,{asset,rect:[x,top,w,h]}] of placed.entries()){
   const data=await source(asset,w,h),src=await PDFLib.PDFDocument.load(data.bytes),art=await doc.embedPage(src.getPage(0),data.bbox);
   const form=ctx.flateStream('q 1 g 0 0 '+w+' '+h+' re f '+(w/art.width)+' 0 0 '+(h/art.height)+' 0 0 cm /Art Do Q',{
    Type:'XObject',Subtype:'Form',BBox:[0,0,w,h],Group:{S:'Transparency',CS:'DeviceGray',I:true},Resources:{XObject:{Art:art.ref}}
   });
   states.set(key('Ink'+i),ctx.register(ctx.obj({Type:'ExtGState',SMask:{S:'Luminosity',G:ctx.register(form),BC:[1],TR:invert}})));
   commands.push('q 1 0 0 1 '+x+' '+(height*pt-top-h)+' cm /Ink'+i+' gs '+(ink==='blue'?'/Ink cs 1 scn':'0 0 0 1 k')+' 0 0 '+w+' '+h+' re f Q');
  }
  page.node.set(key('Resources'),resources);page.node.set(key('Contents'),ctx.register(ctx.flateStream(commands.join('\n'))));
  return doc.save();
 }
 return {preview,svg,pdf};
})();
