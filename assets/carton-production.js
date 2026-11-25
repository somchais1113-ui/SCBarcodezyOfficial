/* V2.3.2 — explicit production colors. No RGB painting in production PDFs.
   Complex/native artwork is rasterized with explicit user acknowledgement;
   simple portable SVG is converted to PDF paths, with paint operators rewritten. */
const CartonProduction=(()=>{
 const pt=72/25.4,ns='http://www.w3.org/2000/svg',enc=new TextEncoder();
 const clamp=n=>Math.max(0,Math.min(1,n)), f=n=>String(Math.round(clamp(n)*100000)/100000);
 function cmyk(r,g,b){const k=1-Math.max(r,g,b);return k>=.999999?[0,0,0,1]:[(1-r-k)/(1-k),(1-g-k)/(1-k),(1-b-k)/(1-k),k];}
 function gray(r,g,b){return clamp(1-(.30*r+.59*g+.11*b));}
 function spotName(v){return String(v||'').trim();}
 function spotValid(v){return /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,59}$/.test(v)&&!['All','None','Cyan','Magenta','Yellow','Black','DeviceRGB','DeviceCMYK','DeviceGray'].includes(v);}
 function preflight(items,assets,mode,spot){
  const errors=[],notes=[];let raster=0,native=0,low=0,unready=0,limit=0,converted=0;
  for(const o of items){const a=assets[o.asset];if(!a?.img.complete||!a.img.naturalWidth){unready++;continue;}if(!a.vector){raster++;if(a.native)native++;else if(!/^data:image\/svg/i.test(a.url)&&a.img.naturalWidth*25.4/o.w<300)low++;const h=o.w/a.ratio;if(o.w*600/25.4>8192||h*600/25.4>8192||o.w*h*(600/25.4)**2>16000000)limit++;}if(!a.standard&&!a.barcode)converted++;}
  if(unready)errors.push('รอภาพโหลดครบ '+unready+' ชิ้น');
  if(mode==='blue'&&(!spotValid(spot.name)||!/^#[\da-f]{6}$/i.test(spot.color)))errors.push('ชื่อ Spot ต้องเป็นชื่อหมึกภาษาอังกฤษ/ตัวเลขที่ไม่ใช่ชื่อเพลทระบบ');
  if(!items.length)errors.push('ไม่มี Artwork');
  notes.push(mode==='original'?'DeviceCMYK · แปลงสี RGB เชิงคณิตศาสตร์ ไม่ใช่ ICC':mode==='black'?'DeviceCMYK · ใช้ช่อง K เท่านั้น':'Named Spot · '+spot.name+' · CMYK alternate');
  notes.push('Vector '+(items.length-raster-unready)+' / Raster '+raster+' · เส้นแบบคลี่แยกจากเพลท');
  if(raster)notes.push('Raster: เป้าหมาย 600 ppi ตามขนาดวาง (ไม่ได้เพิ่มรายละเอียดต้นฉบับ)');if(native)notes.push('PDF นำเข้า '+native+' ชิ้นจะถูกเรนเดอร์เป็นภาพและไม่คง Spot/Vector ต้นฉบับ');if(low)notes.push('ความละเอียดต้นฉบับต่ำกว่า 300 ppi: '+low+' ชิ้น');if(limit)notes.push('จำกัดหน่วยความจำภาพ: '+limit+' ชิ้นอาจต่ำกว่า 600 ppi');
  if(converted&&mode!=='original')notes.push('สีต้นฉบับถูกแปลงเป็นความเข้มของหมึกเดียว');
  return {errors,ack:mode==='original'||raster>0||converted>0,message:[...errors,...notes].join('\n')};
 }
 function paint(rgb,config,stroke,plate){
  const c=cmyk(...rgb),t=gray(...rgb),suffix=stroke?'K':'k';
  if(plate!==null)return `0 0 0 ${f(c[plate])} ${suffix}`;
  if(config.mode==='original')return c.map(f).join(' ')+' '+suffix;
  if(config.mode==='black')return `0 0 0 ${f(t)} ${suffix}`;
  return `/SCInk ${stroke?'CS':'cs'} ${f(t)} ${stroke?'SCN':'scn'}`;
 }
 function vectorOps(raw,config,plate){
  // Only operations emitted by jsPDF for the portable SVG whitelist are allowed.
  const allowed=new Set('q Q cm w J j M d m l c v y h re S s f F f* B B* b b* n W W* gs'.split(' '));
  const ops=CartonPDF.operations(raw);let fill=false,stroke=false;
  const result=[];for(const {op,args} of ops){
   if(['rg','RG','g','G','k','K'].includes(op)){
    const a=args.map(Number);if(a.some(v=>!Number.isFinite(v)))throw Error('Invalid color');let rgb;
    if(op.toLowerCase()==='rg')rgb=a;else if(op.toLowerCase()==='g')rgb=[a[0],a[0],a[0]];else rgb=[(1-a[0])*(1-a[3]),(1-a[1])*(1-a[3]),(1-a[2])*(1-a[3])];
    if(rgb.length!==3)throw Error('Invalid color operands');const isStroke=op===op.toUpperCase();if(isStroke)stroke=true;else fill=true;result.push(paint(rgb,config,isStroke,plate));
   }else if(allowed.has(op))result.push(args.join(' ')+' '+op);else throw Error('Unsupported vector PDF operator '+op);
  }
  // Initial PDF paint state must also use the production space, not default DeviceGray.
  return [paint([0,0,0],config,false,plate),paint([0,0,0],config,true,plate),...result].join('\n');
 }
 function makeSpot(ctx,config){const hex=config.color.slice(1).match(/../g).map(n=>parseInt(n,16)/255),alt=cmyk(...hex);const fn=ctx.register(ctx.obj({FunctionType:2,Domain:[0,1],Range:[0,1,0,1,0,1,0,1],C0:[0,0,0,0],C1:alt,N:1}));return ctx.obj(['Separation',PDFLib.PDFName.of(spotName(config.name)),'DeviceCMYK',fn]);}
 async function vectorSource(asset,w,h){
  const el=asset.vector.cloneNode(true);el.style.cssText='position:absolute;left:-99999px;top:0';el.setAttribute('width',w);el.setAttribute('height',h);document.body.append(el);
  try{const pdf=new jspdf.jsPDF({unit:'pt',format:[w,h],orientation:w>=h?'landscape':'portrait',compress:true});await pdf.svg(el,{x:0,y:0,width:w,height:h});return pdf.output('arraybuffer');}finally{el.remove();}
 }
 async function vectorForm(doc,bytes,config,plate){
  const src=await PDFLib.PDFDocument.load(bytes),pg=src.getPage(0),ctx=src.context,k=PDFLib.PDFName.of,content=pg.node.Contents(),streams=content instanceof PDFLib.PDFArray?content.asArray().map(r=>ctx.lookup(r)):[content];
  const raw=streams.map(CartonPDF.decoded).join('\n'),out=vectorOps(raw,config,plate);
  const resources=pg.node.Resources();if(resources?.lookup(k('XObject'))?.keys().length)throw Error('Nested vector resources not supported');
  if(resources?.lookup(k('Pattern'))?.keys().length||resources?.lookup(k('Shading'))?.keys().length)throw Error('Pattern not supported');
  if(config.mode==='blue'&&plate===null){resources.set(k('ColorSpace'),ctx.obj({SCInk:makeSpot(ctx,config)}));}
  pg.node.set(k('Contents'),ctx.register(ctx.flateStream(out)));
  return doc.embedPage(pg);
 }
 async function rgba(asset,w,h){
  let img=asset.img;if(asset.native){img=new Image();img.src=await CartonPDF.svgBitmap(asset,w);await img.decode();}else if(!img.complete)await img.decode();
  const scale=Math.min(600/25.4,8192/Math.max(w,h),Math.sqrt(16000000/(w*h))),W=Math.max(1,Math.round(w*scale)),H=Math.max(1,Math.round(h*scale));
  const c=document.createElement('canvas');c.width=W;c.height=H;const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(img,0,0,W,H);const data=cx.getImageData(0,0,W,H).data;c.width=c.height=1;return {W,H,data};
 }
 function rasterImage(doc,pixels,config,plate){
  const {W,H,data}=pixels,ctx=doc.context,mono=config.mode!=='original'&&plate===null,spot=config.mode==='blue'&&plate===null,channels=spot?1:4,N=W*H,colors=new Uint8Array(N*channels),alpha=new Uint8Array(N);let transparent=false;
  for(let i=0;i<N;i++){const j=i*4,r=data[j]/255,g=data[j+1]/255,b=data[j+2]/255,c=cmyk(r,g,b),t=gray(r,g,b);let a=data[j+3];
   if(mono&&t<=.00001)a=0;alpha[i]=a;transparent||=a!==255;
   if(spot)colors[i]=Math.round(t*255);else if(mono||plate!==null)colors[i*4+3]=Math.round((plate===null?t:c[plate])*255);else for(let k=0;k<4;k++)colors[i*4+k]=Math.round(c[k]*255);
  }
  const dict={Type:'XObject',Subtype:'Image',Width:W,Height:H,BitsPerComponent:8,ColorSpace:spot?makeSpot(ctx,config):'DeviceCMYK'};
  if(transparent)dict.SMask=ctx.register(ctx.flateStream(alpha,{Type:'XObject',Subtype:'Image',Width:W,Height:H,BitsPerComponent:8,ColorSpace:'DeviceGray'}));
  return ctx.register(ctx.flateStream(colors,dict));
 }
 async function prepare(placements){const result=[];for(const p of placements){if(p.asset.vector){try{const bytes=await vectorSource(p.asset,p.w*pt,p.h*pt); // Verify that the generated SVG converter only produced supported vector operators.
    const check=await PDFLib.PDFDocument.load(bytes),page=check.getPage(0),ctx=check.context,c=page.node.Contents(),streams=c instanceof PDFLib.PDFArray?c.asArray().map(r=>ctx.lookup(r)):[c];vectorOps(streams.map(CartonPDF.decoded).join('\n'),{mode:'black'},null);
    result.push({...p,bytes});continue;
   }catch(e){throw Error('Vector '+p.asset.name+' ไม่สามารถแปลงแบบรักษาเส้นได้: '+e.message+' · กรุณาบันทึกเป็น SVG path แบบง่ายหรือ PNG แล้วนำเข้าใหม่');}}
   result.push({...p,pixels:await rgba(p.asset,p.w,p.h)});
  }return result;}
 async function build(geo,prepared,config,plate=null,lines=false){
  const doc=await PDFLib.PDFDocument.create(),ctx=doc.context,page=doc.addPage([geo.width*pt,geo.height*pt]),key=PDFLib.PDFName.of;
  doc.setTitle(lines===true?'Carton complete artwork proof':lines==='only'?'Carton dieline':plate===null?'Carton printing artwork':'Carton plate '+['C','M','Y','K'][plate]);
  // drawPage maintains a resource dictionary; custom image streams are installed using newXObject.
  if(lines!=='only')for(const p of prepared){const x=p.x*pt,y=(geo.height-p.y-p.h)*pt,w=p.w*pt,h=p.h*pt;
   if(p.bytes){const form=await vectorForm(doc,p.bytes,config,plate);page.drawPage(form,{x,y,width:w,height:h});}
   else{const ref=rasterImage(doc,p.pixels,config,plate),name=page.node.newXObject('SCImage',ref);page.pushOperators(PDFLib.pushGraphicsState(),PDFLib.concatTransformationMatrix(w,0,0,h,x,y),PDFLib.drawObject(name),PDFLib.popGraphicsState());}
  }
  if(lines){const c=PDFLib.cmyk(0,.85,.45,0),b=PDFLib.cmyk(.9,.5,0,0);page.drawSvgPath(geo.cut,{x:0,y:geo.height*pt,scale:pt,borderColor:c,borderWidth:.25*pt});page.drawSvgPath(geo.fold,{x:0,y:geo.height*pt,scale:pt,borderColor:b,borderWidth:.25*pt,borderDashArray:[4*pt,2*pt]});}
  return doc.save();
 }
 async function exportFiles(geo,placements,config,zip,message){
  await CartonPDF.load();const prepared=await prepare(placements),print=await build(geo,prepared,config);if(!zip)return print;
  const files=[{name:'01_Complete_Artwork_PROOF.pdf',data:await build(geo,prepared,config,null,true)},{name:'02_Printing_Plate.pdf',data:print},{name:'03_Dieline.pdf',data:await build(geo,[],config,null,'only')}];
  if(config.mode==='original')for(let i=0;i<4;i++)files.push({name:`04_Plate_${['C','M','Y','K'][i]}_K100_PROOF.pdf`,data:await build(geo,prepared,config,i)});
  const note=`SC Barcodezy V2.3.2\n${message}\n\nAll PDFs share identical page size ${geo.width} × ${geo.height} mm.\n02_Printing_Plate.pdf is the composite printing master (DeviceCMYK or named Separation). 01 is a layout proof and 03 is structural only, NOT printing plates. CMYK channel proofs are grayscale-positive K-channel representations, not RIP-verified separations; generate final plates from composite in RIP. No ICC output intent or PDF/X certification. RGB conversion uses a mathematical model; confirm ink values, overprint/knockout, raster detail and country/stacking data with supplier. Native PDF/complex SVG artwork is rendered into raster images to guarantee output color space; alpha masks are DeviceGray, not printing inks.\n`;
  files.push({name:'00_Preflight.txt',data:enc.encode(note)});return makeZip(files);
 }
 return {preflight,export:exportFiles};
})();
