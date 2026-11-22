'use strict';
const $=id=>document.getElementById(id),K=72/25.4,NS='http://www.w3.org/2000/svg',sheetMM=1000;
let source=null,master=null,job=null,pageIndex=0,revision=0,readingCut=null,exporting=false,frame;
const n=id=>id==='qty'?Number($(id).value.replace(/,/g,'')):$(id).valueAsNumber,fmt=x=>Number(x.toFixed(3)),say=text=>$('status').textContent=text;
function field(group,id,label,value,min,max,step='any'){
 const l=document.createElement('label'),e=document.createElement('input');l.textContent=label;e.type='number';Object.assign(e,{id,value,min,max,step,required:true});l.append(e);$(group).append(l);
}
for(const [id,label,v,min,max] of [['w','กว้างหลังตัด (มม.)',50,1,1000],['h','สูงหลังตัด (มม.)',30,1,1000],['radius','รัศมีมุม (มม.)',3,0,500],['bleed','ตัดตกรอบดวง (มม.)',2,0,50]])field('masterFields',id,label,v,min,max);
field('layoutFields','qty','จำนวนที่สั่ง',1200,1,1000000,'1');field('layoutFields','gap','ช่องไฟเส้นตัด (มม.)',4,0,100);
for(const [id,label] of [['left','ซ้าย'],['right','ขวา'],['top','บน'],['bottom','ล่าง']])field('margins',id,'ขอบ'+label+' (มม.)',10,0,999);
$('qty').type='text';$('qty').inputMode='numeric';$('qty').value='1,200';
const machine=['left','right','top','bottom','spot'];
try{const prefs=JSON.parse(localStorage.getItem('sc-sticker-machine')||'{}');for(const id of machine)if(prefs[id]!=null)$(id).value=prefs[id];}catch{}
$('profile').onclick=()=>{if(!job)return;try{localStorage.setItem('sc-sticker-machine',JSON.stringify(Object.fromEntries(machine.map(k=>[k,$(k).value]))));say('บันทึกระยะขอบและชื่อ Spot แล้ว');}catch{say('เบราว์เซอร์บันทึกค่าเครื่องไม่ได้');}};
function getImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('เปิดภาพไม่ได้'));img.src=url;});}
function transformed(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]].map(v=>v/K);}
function contours(model,id){
 const paths=[],seen=new Set();
 function walk(tree,initial){
  if(!tree.ops)return;
  let matrix=initial,stack=[],lines=[],closed=true,last=null;
  for(const c of tree.ops){
   const op=c.op,v=c.args.map(Number),p=(x,y)=>transformed(matrix,x,y),pair=(i)=>p(v[i],v[i+1]);
   if(op==='q')stack.push(matrix);if(op==='Q')matrix=stack.pop()||initial;
   if(op==='cm')matrix=pdfjsLib.Util.transform(matrix,v);
   if(c.child){const source=tree.forms.get(c.args[0]).source,local=source.dict.lookup(PDFLib.PDFName.of('Matrix'))?.asArray().map(x=>x.asNumber())||[1,0,0,1,0,0];walk(c.child,pdfjsLib.Util.transform(matrix,local));}
   if(op==='m'){if(lines.length&&!closed)lines.push(['OPEN']);lines.push(['M',...pair(0)]);closed=false;last=pair(0);}
   if(op==='l'){last=pair(0);lines.push(['L',...last]);}
   if(op==='c'||op==='v'||op==='y'){
    const a=op==='v'?last:pair(0),b=op==='v'?pair(0):pair(2),end=op==='c'?pair(4):pair(2);lines.push(['C',...a,...b,...end]);last=end;
   }
   if(op==='re'){const [x,y,w,h]=v;if(lines.length&&!closed)lines.push(['OPEN']);lines.push(['M',...p(x,y)],['L',...p(x+w,y)],['L',...p(x+w,y+h)],['L',...p(x,y+h)],['Z']);closed=true;}
   if(op==='h'||['s','b','b*'].includes(op)){lines.push(['Z']);closed=true;}
   if(c.entry&&(id===null||c.entry.tags.includes(id))){
    if(!['S','s'].includes(op)||!closed||!lines.length||lines.some(l=>l[0]==='OPEN'))throw Error('เลเยอร์ไดคัทต้องมีเฉพาะเส้น Stroke ที่ปิดครบทุกวง');
    const signature=JSON.stringify(lines);if(seen.has(signature))throw Error('พบเส้นตัดซ้ำในเลเยอร์ที่เลือก');seen.add(signature);paths.push(...lines);
   }
   if(c.path||op==='n'){lines=[];closed=true;last=null;}
  }
 }
 walk(model,model.view.transform);if(!paths.length)throw Error('ไม่พบเส้นไดคัทปิดในเลเยอร์นี้');
 const svg=document.createElementNS(NS,'svg'),path=document.createElementNS(NS,'path');svg.style.cssText='position:absolute;visibility:hidden';path.setAttribute('d',svgD(paths));svg.append(path);document.body.append(svg);
 try{const {x,y,width,height}=path.getBBox();if(!(width>0&&height>0))throw Error('เส้นตัดไม่มีพื้นที่');return {x,y,width,height,paths};}finally{svg.remove();}
}
function svgD(path){return path.map(([op,...v])=>op+v.map(fmt).join(' ')).join(' ');}
// Some suppliers preserve the cutter plate as a Separation but omit Acrobat layers.
function addCutSpotLayers(model){
 const spots=new Map(),key=s=>PDFLib.PDFName.of(s);
 const expected=new Set(['CutContour', $('spot').value.trim()]);
 function walk(tree,inherited){
  if(!tree.ops)return;
  let stroke=inherited;const stack=[];
  for(const cmd of tree.ops){
   if(cmd.op==='q')stack.push(stroke);
   if(cmd.op==='Q')stroke=stack.pop();
   if(['G','RG','K'].includes(cmd.op))stroke=null;
   if(cmd.op==='CS'){
    stroke=null;const spaces=tree.resources?.lookup(key('ColorSpace')),name=cmd.args[0]?.slice(1);
    const def=name&&spaces?.lookup(key(name));
    if(def instanceof PDFLib.PDFArray&&String(def.get(0))==='/Separation')stroke=def.lookup(1).decodeText();
   }
   if(cmd.child)walk(cmd.child,stroke);
   if(expected.has(stroke)&&cmd.entry&&['S','s','B','B*','b','b*'].includes(cmd.op)){
    if(!spots.has(stroke))spots.set(stroke,{id:'spot'+spots.size,label:'Spot · '+stroke});
    cmd.entry.tags.push(spots.get(stroke).id);
   }
  }
 }
 walk(model,null);model.layers.push(...spots.values());
}
async function pdfPage(bytes,index){
 const doc=await PDFLib.PDFDocument.load(bytes),task=pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,BinaryDataFactory:CartonPDF.Resources});
 try{const pdf=await task.promise,pg=await pdf.getPage(index+1),m=CartonPDF.analyze(doc,doc.getPage(index));m.view=pg.getViewport({scale:1});m.pdfView=pg.view;return {m,count:doc.getPageCount()};}finally{await task.destroy();}
}
async function renderPdf(bytes,maxSide){
 const task=pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,BinaryDataFactory:CartonPDF.Resources});
 try{const pg=await (await task.promise).getPage(1),view=pg.getViewport({scale:1}),scale=Math.min(maxSide/Math.max(view.width,view.height),16),viewport=pg.getViewport({scale});
 const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(viewport.width));c.height=Math.max(1,Math.ceil(viewport.height));
 await pg.render({canvas:c,canvasContext:c.getContext('2d',{alpha:true}),viewport,background:'rgba(0,0,0,0)'}).promise;return c;}finally{await task.destroy();}
}
function invalidate(){$('cutFile').disabled=true;job=null;master=null;update();}
async function preparePDF(token,changePage){
 if(changePage){
  const {m,count}=await pdfPage(source.bytes,Number($('page').value||0));if(token!==revision)return;
  addCutSpotLayers(m);source.model=m;const selected=$('page').value||'0';$('page').replaceChildren(...Array.from({length:count},(_,i)=>new Option('หน้า '+(i+1),String(i))));$('page').value=selected;
  $('cutLayer').replaceChildren(new Option('ไม่มี · ไฟล์กราฟิกอย่างเดียว',''),...m.layers.map(l=>new Option(l.label,l.id)));
  $('artLayer').replaceChildren(new Option('ทุกเลเยอร์ ยกเว้นเส้นตัดที่เลือก',''),...m.layers.map(l=>new Option(l.label,l.id)));
  $('artLayer').value=m.layers.find(l=>/^art[ _-]*work$/i.test(l.label))?.id||'';
  $('cutLayer').value=m.layers.find(l=>/cutcontour|die[\s_-]*cut|ไดคัท/i.test(l.label))?.id||m.layers.find(l=>l.id.startsWith('spot'))?.id||'';
 }
 const m=source.model,id=$('cutLayer').value,cut=id?contours(m,id):null;
 const printID=$('artLayer').value;
 if(id&&printID===id)throw Error('เลือกเลเยอร์กราฟิกคนละเลเยอร์กับเส้นตัด');
 const entries=m.entries.filter(e=>(!id||!e.tags.includes(id))&&(!printID||e.tags.includes(printID)));if(!entries.length)throw Error('หน้านี้ไม่มีกราฟิกพิมพ์นอกเลเยอร์เส้นตัด');
 const art=await CartonPDF.component(m,new Set(entries.map(e=>e.id))),img=await renderPdf(art,900);if(token!==revision)return;
 const width=m.view.width/K,height=m.view.height/K;
 master={art,img,width,height,cut,embeddedCut:!!cut,ppi:Math.min(...entries.map(e=>e.ppi).filter(Number.isFinite))};
 $('shape').options[3].disabled=!cut;$('shape').value=cut?'pdf':'rect';$('shape').disabled=!!cut;
 $('w').value=fmt(cut?.width||width);$('h').value=fmt(cut?.height||height);
 if(!cut)$('bleed').value=0;
 update();
}
function failure(e,token){if(token!==revision)return;invalidate();say(e.message);}
async function openFile(file,bytes=null){
 const token=++revision;source=null;pageIndex=0;invalidate();$('cutInfo').textContent='';$('filename').textContent=file.name;say('กำลังอ่านต้นแบบ…');$('pdfOptions').hidden=true;
 try{
  await CartonPDF.load();bytes=bytes||new Uint8Array(await file.arrayBuffer());if(token!==revision)return;
  if(/\.ai$/i.test(file.name)&&!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-'))throw Error('กรุณาบันทึก AI โดยเปิด Create PDF Compatible File หรือส่งออก PDF ที่เก็บเลเยอร์');
  if(/\.(ai|pdf)$/i.test(file.name)||file.type==='application/pdf'){
   source={bytes};$('page').replaceChildren();$('pdfOptions').hidden=false;await preparePDF(token,true);
  }else if(/\.svg$/i.test(file.name)){
   const svg=await StickerSVG.read(file);if(token!==revision)return;master=svg;const cut=svg.cut;master.embeddedCut=!!cut;
   $('shape').disabled=!!cut;$('shape').options[3].disabled=!cut;$('shape').value=cut?'pdf':'rect';$('w').value=fmt(cut?.width||svg.width);$('h').value=fmt(cut?.height||svg.height);if(!cut)$('bleed').value=0;update();
  }else{
   if(!/\.(png|jpe?g)$/i.test(file.name))throw Error('รองรับ PDF, SVG, PNG และ JPG');
   const url=URL.createObjectURL(file);let img;try{img=await getImage(url);}finally{URL.revokeObjectURL(url);}if(token!==revision)return;
   const jpg=bytes[0]===255&&bytes[1]===216;
   const png=[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
   if(!jpg&&!png)throw Error('ข้อมูลภาพต้องเป็น JPG หรือ PNG');
   source=null;master={bytes,img,width:img.naturalWidth,height:img.naturalHeight,jpg,orientation:jpg?JpegOrientation.fromBytes(bytes):1};
   $('w').value=50;$('h').value=fmt(50*master.height/master.width);$('shape').disabled=false;$('shape').value='rect';$('shape').options[3].disabled=true;update();
  }
  if(token===revision)say('');
 }catch(e){failure(e,token);}
}
$('cutFile').onchange=async e=>{
 const file=e.target.files[0],owner=master;if(!file||!owner)return;e.target.value='';
 const token=++revision;readingCut=token;$('cutInfo').textContent='กำลังอ่านเส้นไดคัท…';update();
 try{
  const svg=await StickerSVG.read(file,true);if(token!==revision||owner!==master)return;
  const sx=owner.width/svg.width,sy=owner.height/svg.height;
  if(Math.abs(sx/sy-1)>.002)throw Error('สัดส่วนอาร์ตบอร์ดเส้นตัดต่างจากกราฟิก กรุณาส่งออกด้วยอาร์ตบอร์ดเดียวกัน');
  const c=svg.cut;owner.cut={x:c.x*sx,y:c.y*sy,width:c.width*sx,height:c.height*sy,paths:c.paths.map(([op,...v])=>[op,...v.map((a,i)=>a*(i%2?sy:sx))])};
  $('w').value=fmt(c.width);$('h').value=fmt(c.height);$('shape').options[3].disabled=false;$('shape').value='pdf';$('shape').disabled=true;$('cutInfo').textContent=file.name+' · '+svg.reason;
 }catch(err){if(token===revision)$('cutInfo').textContent=err.message+' · ยังใช้แนวตัดเดิม';}
 finally{if(readingCut===token){readingCut=null;update();}}
};
for(const id of ['page','cutLayer','artLayer'])$(id).onchange=async()=>{const token=++revision;invalidate();try{await preparePDF(token,id==='page');if(token===revision)say('');}catch(e){failure(e,token);}};
$('file').onchange=e=>{if(e.target.files[0])openFile(e.target.files[0]);e.target.value='';};
$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('over');};$('drop').ondragleave=()=>$('drop').classList.remove('over');
$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('over');if(e.dataTransfer.files[0])openFile(e.dataTransfer.files[0]);};
function geometry(){
 const w=n('w'),h=n('h'),bleed=n('bleed'),cut=master.cut;
 if(cut){
  const sx=w/cut.width,sy=h/cut.height;
  if(Math.min(cut.x*sx,cut.y*sy,(master.width-cut.x-cut.width)*sx,(master.height-cut.y-cut.height)*sy)+.015<bleed)throw Error('ขอบหน้าต้นฉบับ PDF มีพื้นที่ตัดตกน้อยกว่าค่าที่กำหนด');
  return {path:cut.paths.map(([op,...v])=>[op,...v.map((a,i)=>i%2?(a-cut.y)*sy:(a-cut.x)*sx)]),art:[-cut.x*sx,-cut.y*sy,master.width*sx,master.height*sy]};
 }
 const ellipse=$('shape').value==='ellipse',round=$('shape').value==='round',r=round?n('radius'):0;
 if(r>Math.min(w,h)/2)throw Error('รัศมีมุมต้องไม่เกินครึ่งด้านสั้น');
 const rx=ellipse?w/2:r,ry=ellipse?h/2:r,k=.55228474983;
 const path=rx&&ry?[['M',rx,0],['L',w-rx,0],['C',w-rx+k*rx,0,w,ry-k*ry,w,ry],['L',w,h-ry],['C',w,h-ry+k*ry,w-rx+k*rx,h,w-rx,h],['L',rx,h],['C',rx-k*rx,h,0,h-ry+k*ry,0,h-ry],['L',0,ry],['C',0,ry-k*ry,rx-k*rx,0,rx,0],['Z']]:[['M',0,0],['L',w,0],['L',w,h],['L',0,h],['Z']];
 const scale=Math.max((w+2*bleed)/master.width,(h+2*bleed)/master.height),aw=master.width*scale,ah=master.height*scale;
 return {path,art:[(w-aw)/2,(h-ah)/2,aw,ah]};
}
function layout(){
 if(!master)throw Error('');
 if([...document.querySelectorAll('input[type=number]')].some(e=>!e.disabled&&(!e.value||!e.validity.valid)))throw Error('ตรวจจำนวน ขนาด และระยะขอบให้ครบ');
 const w=n('w'),h=n('h'),gap=n('gap'),b=n('bleed'),qty=n('qty'),spot=$('spot').value.trim();
 if(!/^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test($('qty').value)||qty>1000000)throw Error('กรอกจำนวนเต็มตั้งแต่ 1 ถึง 1,000,000 ดวง');
 if(!/^[\x20-\x7e]+$/.test(spot)||/[\x00-\x1f]/.test(spot)||/^(?:All|None|Cyan|Magenta|Yellow|Black)$/i.test(spot))throw Error('ระบุชื่อ Spot สำหรับเครื่องตัด');
 if(gap+1e-6<2*b)throw Error('ช่องไฟต้องไม่น้อยกว่าตัดตกสองด้าน ('+fmt(2*b)+' มม.)');
 const aw=sheetMM-n('left')-n('right')-2*b,ah=sheetMM-n('top')-n('bottom')-2*b;
 function grid(rot){const dx=rot?h:w,dy=rot?w:h,cols=Math.max(0,Math.floor((aw+gap+1e-7)/(dx+gap))),rows=Math.max(0,Math.floor((ah+gap+1e-7)/(dy+gap)));return {rot,dx,dy,cols,rows,cap:cols*rows};}
 const upright=grid(false),side=grid(true),mode=$('rotate').value,chosen=mode==='90'||mode==='auto'&&side.cap>upright.cap?side:upright;
 if(!chosen.cap)throw Error('พื้นที่หลังหักระยะขอบและตัดตกไม่พอวางหนึ่งดวง');
 return {...chosen,...geometry(),w,h,b,gap,qty,spot,left:n('left')+b,top:n('top')+b,pages:Math.ceil(qty/chosen.cap)};
}
const count=(j,i)=>Math.min(j.cap,j.qty-i*j.cap);
function update(){
 $('radius').disabled=$('shape').value!=='round';
 try{job=layout();$('warning').textContent='';}catch(e){job=null;$('warning').textContent=e.message;}
 $('cutFile').disabled=!master||!!master.embeddedCut;const j=job;pageIndex=j?Math.min(pageIndex,j.pages-1):0;
 $('prev').disabled=!j||!pageIndex;$('next').disabled=!j||pageIndex>=j.pages-1;
 for(const id of ['pdf','zip','svg','jpg'])$(id).disabled=!j||exporting||readingCut===revision;
 $('summary').textContent=j?j.cols+' คอลัมน์ × '+j.rows+' แถว · '+j.cap.toLocaleString()+' ดวง/แผ่น · '+j.qty.toLocaleString()+' ดวง รวม '+j.pages.toLocaleString()+' แผ่น':'';
 $('pageInfo').value=j?'แผ่น '+(pageIndex+1)+' / '+j.pages+' · '+count(j,pageIndex)+' ดวง':'';
 const ppi=j&&(master.art?(master.ppi??NaN)*master.width/j.art[2]:master.img.naturalWidth*25.4/j.art[2]);
 $('quality').textContent=j?(Number.isFinite(ppi)?'ภาพที่ขนาดวางจริงประมาณ '+Math.round(ppi)+' ppi'+(ppi<300?' · ตรวจความคมต้นฉบับก่อนพิมพ์':''):master.reason||'PDF · เก็บเส้นและทรัพยากรต้นฉบับ'):'';
 cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{paint($('sheet'),job,pageIndex,$('showCut').checked);if($('detailView').open)drawUnit($('unit'),job);});
}
function drawUnit(canvas,j){
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
 if(!j)return;
 const scale=Math.min((canvas.width-30)/(j.w+2*j.b),(canvas.height-30)/(j.h+2*j.b));
 ctx.save();ctx.translate((canvas.width-j.w*scale)/2,(canvas.height-j.h*scale)/2);ctx.scale(scale,scale);ctx.beginPath();ctx.rect(-j.b,-j.b,j.w+2*j.b,j.h+2*j.b);ctx.clip();ctx.drawImage(master.img,...j.art);if($('showCut').checked){ctx.lineWidth=1.8/scale;ctx.strokeStyle='#e40775';ctx.stroke(new Path2D(svgD(j.path)));}ctx.restore();
}
function paint(canvas,j,page,cut){
 const ctx=canvas.getContext('2d'),scale=canvas.width/sheetMM;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);if(!j)return;
 // Render one transparent tile at proof resolution, then repeat it as a pattern.
 const tile=document.createElement('canvas'),pw=j.dx+j.gap,ph=j.dy+j.gap;
 tile.width=Math.max(1,Math.ceil(pw*scale));tile.height=Math.max(1,Math.ceil(ph*scale));
 const t=tile.getContext('2d');t.scale(tile.width/pw,tile.height/ph);t.translate(j.b,j.b);
 if(j.rot){t.translate(j.h,0);t.rotate(Math.PI/2);}t.beginPath();t.rect(-j.b,-j.b,j.w+2*j.b,j.h+2*j.b);t.clip();
 t.drawImage(master.img,...j.art);if(cut){t.strokeStyle='#d51276';t.lineWidth=Math.max(.18,.85/scale);t.stroke(new Path2D(svgD(j.path)));}
 ctx.save();ctx.scale(scale,scale);ctx.translate(j.left-j.b,j.top-j.b);const pattern=ctx.createPattern(tile,'repeat');pattern.setTransform(new DOMMatrix().scale(pw/tile.width,ph/tile.height));ctx.fillStyle=pattern;
 const total=count(j,page),full=Math.floor(total/j.cols),tail=total%j.cols;
 ctx.fillRect(0,0,j.cols*pw,full*ph);if(tail)ctx.fillRect(0,full*ph,tail*pw,ph);ctx.restore();
}
for(const e of document.querySelectorAll('input[type=number],#qty,#spot,#rotate,#shape,#showCut'))e.addEventListener('input',()=>{if(master?.cut&&(e.id==='w'||e.id==='h')&&e.validity.valid){const ratio=master.cut.width/master.cut.height;if(e.id==='w')$('h').value=fmt(n('w')/ratio);else $('w').value=fmt(n('h')*ratio);}update();});
$('prev').onclick=()=>{pageIndex--;update();};$('next').onclick=()=>{pageIndex++;update();};
function rowsOn(j,total){
 const rows=[];for(let start=0;start<total;start+=j.cols)rows.push(Math.min(j.cols,total-start));return rows;
}
function rowStamp(j,col){const x=col*(j.dx+j.gap);return j.rot?[0,1,-1,0,x+j.h,0]:[1,0,0,1,x,0];}
const numbers=a=>a.map(v=>v.toFixed(7).replace(/\.?0+$/,'')||'0').join(' ');
// All outputs use the same placement matrices and page counts. Each document
// only embeds the resources that are needed to draw its selected layers.
async function production(j, mode = 'combined') {
  const {PDFDocument, PDFName, PDFString, PDFObjectCopier} = PDFLib;
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const key = name => PDFName.of(name);
  const register = object => ctx.register(ctx.obj(object));
  const layers = [];
  const properties = {};

  function form(program, bounds, resources) {
    return ctx.register(ctx.flateStream(program, {
      Type: 'XObject', Subtype: 'Form', BBox: bounds, Resources: resources
    }));
  }

  function addLayer(name, label, unit) {
    const ref = register({Type: 'OCG', Name: PDFString.of(label)});
    properties[name] = ref;
    layers.push({name, ref, unit});
  }

  if (mode !== 'cut') {
    let asset;
    let sourceWidth = 1;
    let sourceHeight = 1;
    if (master.art) {
      const original = source?.model?.doc;
      const intents = original?.catalog.get(key('OutputIntents'));
      if (intents) doc.catalog.set(key('OutputIntents'), PDFObjectCopier.for(original.context, ctx).copy(intents));
      const artDoc = await PDFDocument.load(master.art);
      asset = await doc.embedPage(artDoc.getPage(0));
      sourceWidth = asset.width;
      sourceHeight = asset.height;
    } else {
      asset = master.jpg ? await doc.embedJpg(master.bytes) : await doc.embedPng(master.bytes);
    }
    const [x,y,w,h] = j.art;
    const transform = numbers([w / sourceWidth, 0, 0, -h / sourceHeight, x, y + h]);
    // Inputs are PDF bottom-left coordinates; apply the camera transform before placement.
    const exifMatrix = {2:[-1,0,0,1,1,0],3:[-1,0,0,-1,1,1],4:[1,0,0,-1,0,1],
      5:[0,-1,-1,0,1,1],6:[0,-1,1,0,0,1],7:[0,1,1,0,0,0],8:[0,1,-1,0,1,0]}[master.orientation];
    const orient = exifMatrix ? numbers(exifMatrix)+' cm ' : '';
    addLayer('Artwork', 'ARTWORK', form('q '+transform+' cm '+orient+'/Source Do Q',
      [-j.b, -j.b, j.w+j.b, j.h+j.b], {XObject:{Source:asset.ref}}));
  }

  if (mode !== 'print') {
    const tint = register({FunctionType:2, Domain:[0,1], C0:[0,0,0,0], C1:[0,1,0,0], N:1});
    const ops = {M:'m', L:'l', C:'c', Z:'h'};
    const path = j.path.map(([op,...values])=>numbers(values)+' '+ops[op]).join('\n');
    const stroke = 'q /Over gs /Knife CS 1 SCN '+(.25/K).toFixed(7)+' w\n'+path+'\nS Q';
    addLayer('Contour', 'DIE CUT', form(stroke, [-.1,-.1,j.w+.1,j.h+.1], {
      ColorSpace:{Knife:['Separation',key(j.spot),'DeviceCMYK',tint]},
      ExtGState:{Over:{Type:'ExtGState',OP:true,op:false,OPM:1}}
    }));
  }

  const order = layers.map(layer=>layer.ref).reverse();
  doc.catalog.set(key('OCProperties'),ctx.obj({OCGs:order,D:{Order:order,ON:order}}));
  const titles = {combined:'Print and Cut', print:'Print only', cut:'Cut only'};
  doc.setTitle('Sticker Studio - '+titles[mode]);

  const rowMap = new Map();
  const pageMap = new Map();
  function rowForm(layer, columns) {
    const id = layer.name+columns;
    if (!rowMap.has(id)) {
      const stamps = Array.from({length:columns}, (_,i)=>'q '+numbers(rowStamp(j,i))+' cm /Unit Do Q');
      const pad = Math.max(j.b,.1);
      const bounds = [-pad,-pad,columns*(j.dx+j.gap)-j.gap+pad,j.dy+pad];
      rowMap.set(id,form(stamps.join('\n'),bounds,{XObject:{Unit:layer.unit}}));
    }
    return rowMap.get(id);
  }

  function pageContent(total) {
    if (pageMap.has(total)) return pageMap.get(total);
    const rows = rowsOn(j,total);
    const forms = {};
    const groups = layers.map(layer=>{
      const lines = rows.map((columns,r)=>{
        const id = layer.name+columns;
        forms[id] = rowForm(layer,columns);
        const origin = numbers([j.left,j.top+r*(j.dy+j.gap)]);
        return 'q 1 0 0 1 '+origin+' cm /'+id+' Do Q';
      });
      return '/OC /'+layer.name+' BDC\nq '+numbers([K,0,0,-K,0,sheetMM*K])+' cm\n'+lines.join('\n')+'\nQ EMC';
    });
    const pageData = {
      contents:ctx.register(ctx.flateStream(groups.join('\n'))),
      resources:register({XObject:forms,Properties:properties})
    };
    pageMap.set(total,pageData);
    return pageData;
  }

  for (let i=0;i<j.pages;i++) {
    const page = doc.addPage([sheetMM*K,sheetMM*K]);
    const {contents,resources} = pageContent(count(j,i));
    page.node.set(key('Contents'),contents);
    page.node.set(key('Resources'),resources);
    if (i && i%100===0) {
      say('กำลังสร้างแผ่น '+(i+1)+' / '+j.pages);
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  return new Blob([await doc.save()],{type:'application/pdf'});
}

async function splitJob(job, basename) {
  const files = [];
  for (const [mode, suffix] of [['print','Print'], ['cut','Cut']]) {
    const pdf = await production(job, mode);
    files.push({name:basename+'_'+suffix+'.pdf', data:new Uint8Array(await pdf.arrayBuffer())});
  }
  return makeZip(files);
}
function dataURI(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}
function imageBlob(c,type,quality){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('สร้างภาพไม่สำเร็จ')),type,quality));}
async function svgSheet(j,i){
 let image;if(master.svg){image=await dataURI(new Blob([master.svg],{type:'image/svg+xml'}));}else if(master.art){const side=Math.min(6000,Math.ceil(Math.max(j.art[2],j.art[3])*600/25.4));image=await dataURI(await imageBlob(await renderPdf(master.art,side),'image/png'));}
 else if(master.orientation>1)image=JpegOrientation.uprightPNG(master.img);
 else image=await dataURI(new Blob([master.bytes],{type:master.jpg?'image/jpeg':'image/png'}));
 const [x,y,w,h]=j.art,rows=rowsOn(j,count(j,i)),defs=[],groups=[];
 for(const type of ['ARTWORK','DIE_CUT']){
  const unit=type==='ARTWORK'?'graphic':'knife';
  for(const n of new Set(rows)){const tags=Array.from({length:n},(_,c)=>'<use xlink:href="#'+unit+'" transform="matrix('+numbers(rowStamp(j,c))+')"/>');defs.push('<g id="'+unit+n+'">'+tags.join('')+'</g>');}
  groups.push('<g id="'+type+'" inkscape:groupmode="layer" inkscape:label="'+type.replace('_',' ')+'">'+rows.map((n,r)=>'<use xlink:href="#'+unit+n+'" x="'+j.left+'" y="'+fmt(j.top+r*(j.dy+j.gap))+'"/>').join('')+'</g>');
 }
 return new Blob(['<svg xmlns="'+NS+'" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="1000mm" height="1000mm" viewBox="0 0 1000 1000"><defs><clipPath id="edge"><rect x="'+(-j.b)+'" y="'+(-j.b)+'" width="'+(j.w+2*j.b)+'" height="'+(j.h+2*j.b)+'"/></clipPath><g id="graphic" clip-path="url(#edge)"><image x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" preserveAspectRatio="none" xlink:href="'+image+'"/></g><path id="knife" fill="none" stroke="#ff0090" stroke-width="'+(.25/K)+'" d="'+svgD(j.path)+'"/>',...defs,'</defs>',...groups,'</svg>'],{type:'image/svg+xml'});
}
async function exportJob(type){
 if(!job||exporting||readingCut===revision)return;const j=job,i=pageIndex,begin=performance.now();
 exporting=true;document.querySelector('main').inert=true;say('กำลังเตรียมไฟล์…');
 try{await new Promise(r=>setTimeout(r,30));let blob;
  const basename=$('filename').textContent.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'_')||'Sticker';
  if(type==='zip')blob=await splitJob(j,basename);else if(type==='pdf')blob=await production(j);else if(type==='svg')blob=await svgSheet(j,i);
  else{const canvas=document.createElement('canvas');canvas.width=canvas.height=2000;paint(canvas,j,i,$('showCut').checked);blob=await imageBlob(canvas,'image/jpeg',.94);}
  const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=basename+'_'+(type==='pdf'?'PrintCut':type==='zip'?'Print-and-Cut':'Sheet-'+(i+1))+'.'+type;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  say('สร้างไฟล์ '+type.toUpperCase()+' แล้ว · '+((performance.now()-begin)/1000).toFixed(1)+' วินาที');
 }catch(e){say('ส่งออกไม่สำเร็จ · '+e.message);}finally{exporting=false;document.querySelector('main').inert=false;update();}
}
for(const type of ['pdf','zip','svg','jpg'])$(type).onclick=()=>exportJob(type);
$('detailView').ontoggle=()=>{if($('detailView').open)drawUnit($('unit'),job);};
openFile({name:'Sticker-Master.pdf'},Uint8Array.from(atob(stickerDemo),s=>s.charCodeAt(0)));
