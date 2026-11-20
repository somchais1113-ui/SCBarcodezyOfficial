'use strict';
const $=id=>document.getElementById(id);
const NS='http://www.w3.org/2000/svg', MM=25.4/72;
const escapeXML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const bounded=(v,lo,hi,def)=>Number.isFinite(Number(v))?Math.min(hi,Math.max(lo,Number(v))):def;
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
const types=['text','rect','line','barcode','crop'];
const bitmap=s=>typeof s==='string' && /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(s);
const blank=()=>({format:'barcodedzy-template',version:1,id:uid(),name:'ฉลากใหม่',width:80,height:34,reference:'',fonts:{},layers:[]});
const labels={text:'ข้อความ',rect:'กรอบ',line:'เส้น',barcode:'บาร์โค้ด',crop:'ส่วนภาพ'};
function layer(type,values={}){
  return {id:uid(),type,name:labels[type],x:3,y:3,w:32,h:6,text:type==='barcode'?'8851907346492':'ชื่อสินค้า',pt:12,leading:14.4,tracking:0,baseline:0,markDrop:0,rotation:0,sx:100,sy:100,font:'PraJad',align:'start',kern:0,pair:1,color:'#172637',stroke:.25,solid:false,locked:false,group:'',binding:'',review:false,...values};
}
let project=blank(),selected=null,history=[],future=[],image=null,drag=null,pending=null,busy=false;
let parsedFonts=new Map();
let matchCache=new WeakMap();
const fontNames=()=>[...new Set([...Object.keys(labelFonts),...Object.keys(project.fonts)])];
function regionFor(o){
  return {x:o.x/project.width,y:o.y/project.height,w:o.w/project.width,h:o.h/project.height};
}
function referenceText(o){return o.sourcePatch?.style.text??o.referenceText??o.text;}
function compareLine(o){
  if(!image||!o.refRegion)return null;
  const original=referenceText(o);
  let entry=matchCache.get(o);
  if(!entry||entry.image!==image||entry.text!==original){
    const clip=StudioFonts.sample(image,o.refRegion);
    const matches=StudioFonts.compare(clip,original,fontNames(),dataFont);
    entry={clip,matches,image,text:original};matchCache.set(o,entry);
  }
  return entry;
}
// Use the observed ink height to recover point size, then fit width and side bearing.
function fitFace(o,key,box,tracking=0){
  const f=dataFont(key),b=f.getPath(o.text,0,0,1,{kerning:true,letterSpacing:tracking/1000}).getBoundingBox();
  const height=b.y2-b.y1,width=b.x2-b.x1;
  if(!(height>0&&width>0))return;
  o.font=key;o.pt=box.h/(height*MM);o.sy=100;o.sx=100*box.w/(width*o.pt*MM);
  o.x=box.x-b.x1*o.pt*MM*o.sx/100;o.y=box.y;o.w=box.w;o.h=box.h;
  o.baseline=o.pt*(.8+b.y1);o.tracking=tracking;o.kern=0;o.align='start';
}
function localInkBox(o){
  const path=dataFont(o.font).getPath(String(o.text).split('\n')[0],0,0,o.pt*MM,{kerning:true,letterSpacing:o.tracking/1000});
  const b=path.getBoundingBox();
  return {x:o.x+b.x1*o.sx/100,y:o.y+(o.pt*MM*.8-o.baseline*MM+b.y1)*o.sy/100,w:o.w,h:o.h};
}
function applyFace(o,match){
  assertUnlocked();
  const original=referenceText(o);
  if(!original.trim())throw Error('ระบุข้อความเดิมของช่องก่อนเทียบฟอนต์');
  const {clip}=compareLine(o), bounds=StudioFonts.inkBounds(clip);
  const patch=o.sourcePatch;
  const sourceX=patch?o.x+o.w*patch.dx:o.x,sourceY=patch?o.y+o.h*patch.dy:o.y;
  const base=patch?{x:sourceX,y:sourceY,w:o.w,h:o.h}:
    o.referenceBox?{...o.referenceBox,x:o.referenceBox.x+o.x-o.referenceBox.originX,y:o.referenceBox.y+o.y-o.referenceBox.originY}:localInkBox({...o,text:original});
  const box={x:base.x+bounds.x*base.w,y:base.y+bounds.y*base.h,w:base.w*bounds.w,h:base.h*bounds.h};
  const fitted={...o,text:original};fitFace(fitted,match.key,box,match.tracking);
  snap();
  for(const k of ['font','pt','sx','sy','x','y','baseline','tracking','kern','align'])o[k]=fitted[k];
  if(patch){
    patch.calibrated=SourceArt.appearance(o);
    patch.originalDx??=patch.dx;patch.originalDy??=patch.dy;
    patch.dx=(sourceX-o.x)/o.w;patch.dy=(sourceY-o.y)/o.h;
  }
  if(o.referenceBox){o.referenceBox.x=base.x;o.referenceBox.y=base.y;o.referenceBox.originX=o.x;o.referenceBox.originY=o.y;}
  render();note('เทียบ '+match.key+' กับคำเดิมแล้ว เมื่อเปลี่ยนคำจะคงสเกล ช่องไฟ และแนวฐานชุดนี้');
}
function note(s){$('status').textContent=s;}
function snapshot(){return {data:JSON.stringify(project),selected};}
function snap(){history.push(snapshot());if(history.length>30)history.shift();future=[];pending=null;}
function current(){return project.layers.find(o=>o.id===selected);}
function assertUnlocked(){if(current()?.locked)throw Error('ปลดล็อกเลเยอร์ก่อนแก้ไข');}
function dataFont(key){
  const source=project.fonts[key]||labelFonts[key];
  if(!source)throw Error('ไม่พบฟอนต์ในโปรเจกต์');
  if(!parsedFonts.has(source)){
    const face=opentype.parse(Uint8Array.from(atob(source),c=>c.charCodeAt(0)).buffer);
    parsedFonts.set(source,source===labelFonts['DB ThaiText X']?withDBThaiLayout(face):face);
  }
  return parsedFonts.get(source);
}
function validateProject(p){
  if(!p||p.format!=='barcodedzy-template'||p.version!==1||!Array.isArray(p.layers)||p.layers.length>600)throw Error('รูปแบบโปรเจกต์ไม่รองรับ');
  for(const k of ['width','height'])if(!(p[k]>=1&&p[k]<=1000))throw Error('ตรวจขนาดฉลาก 1–1000 mm');
  if(p.importSize&&(!['width','height','dpi'].every(k=>Number.isFinite(p.importSize[k])&&p.importSize[k]>0)||typeof p.importSize.reason!=='string'))throw Error('ข้อมูลขนาดต้นฉบับไม่ถูกต้อง');
  if(p.numerals&&!Object.entries(p.numerals).every(([key,g])=>/^[0-9.,-]$/.test(key)&&bitmap(g.data)&&[g.w,g.h,g.bottom].every(Number.isFinite)))throw Error('ต้นแบบตัวเลขไม่ถูกต้อง');
  if(p.backdrop&&!bitmap(p.backdrop))throw Error('ภาพพื้นของ Template ไม่ถูกต้อง');
  if(p.reference&&!bitmap(p.reference))throw Error('ภาพอ้างอิงไม่รองรับ');
  if(!ThaiMarks.validProfiles(p.thaiProfiles))throw Error('โปรไฟล์เครื่องหมายไทยไม่ถูกต้อง');
  const ids=new Set();
  for(const o of p.layers){
    if(!ThaiMarks.valid(o.markTuning))throw Error('ค่าตำแหน่งเครื่องหมายไทยไม่ถูกต้อง');
    o.markDrop??=0;
    if(!Number.isFinite(o.markDrop)||Math.abs(o.markDrop)>100000)throw Error('ระยะสระไทยไม่ถูกต้อง');
    if(!types.includes(o.type)||typeof o.id!=='string'||ids.has(o.id))throw Error('เลเยอร์ไม่ถูกต้อง');ids.add(o.id);
    for(const key of ['x','y','w','h','pt','leading','tracking','rotation','sx','sy','baseline','kern','pair','stroke'])if(!Number.isFinite(o[key])||Math.abs(o[key])>100000)throw Error('พารามิเตอร์เลเยอร์ไม่ถูกต้อง');
    if(!/^#[0-9a-f]{6}$/i.test(o.color))throw Error('ค่าสีไม่ถูกต้อง');
    if(o.refRegion&&!['x','y','w','h'].every(k=>Number.isFinite(o.refRegion[k])&&Math.abs(o.refRegion[k])<=2000))throw Error('กรอบอ้างอิงไม่ถูกต้อง');
    if(o.sourcePatch&&(!bitmap(o.sourcePatch.data)||!Number.isFinite(o.sourcePatch.dx)||!Number.isFinite(o.sourcePatch.dy)||!o.sourcePatch.style))throw Error('ข้อมูลช่องจากภาพไม่ถูกต้อง');
    if(o.quantity&&(!bitmap(o.quantity.suffix)||typeof o.quantity.unit!=='string'||!/^[0-9]{1,5}$/.test(o.quantity.digits)||
      !['cut','w','h','width','height','top','left'].every(k=>Number.isFinite(o.quantity[k]))||!(o.quantity.cut>0&&o.quantity.cut<o.quantity.w&&o.quantity.h>0)))throw Error('ส่วนตัวเลขและหน่วยไม่ถูกต้อง');
    if(o.referenceText!==undefined&&typeof o.referenceText!=='string')throw Error('ข้อความอ้างอิงไม่ถูกต้อง');
    if(o.referenceBox&&!['x','y','w','h','originX','originY'].every(k=>Number.isFinite(o.referenceBox[k])))throw Error('ตำแหน่งข้อความเดิมไม่ถูกต้อง');
    if(o.numeric&&(!bitmap(o.numeric.suffixInk)||typeof o.numeric.suffix!=='string'||!['cut','w','h','baseline'].every(k=>Number.isFinite(o.numeric[k]))))throw Error('ช่องตัวเลขไม่ถูกต้อง');
    if(o.caption&&!['bar','width','start','top','height','left','right'].every(k=>Number.isFinite(o.caption[k])&&Math.abs(o.caption[k])<4))throw Error('ข้อมูลตำแหน่งเลขใต้บาร์โค้ดไม่ถูกต้อง');
    if(o.fixedInk&&(!bitmap(o.fixedInk)||!Number.isFinite(o.inkX)||!Number.isFinite(o.inkY)))throw Error('ภาพบรรทัดไม่ถูกต้อง');
    if(o.type==='crop'&&o.crop&&!bitmap(o.crop))throw Error('ภาพส่วนย่อยไม่รองรับ');
  }
  return p;
}
function textArt(o,previewMarks){
  const f=dataFont(o.font),size=o.pt*MM;
  const options={kerning:true,letterSpacing:o.tracking/1000,markState:ThaiMarks.state(o,previewMarks,Object.hasOwn(project.thaiProfiles||{},o.font)?project.thaiProfiles[o.font]:null),thaiMarkOffset:(o.markDrop||0)*MM/(o.sy/100)};
  return String(o.text).split('\n').map((line,i)=>{
    const glyphs=Array.from(new Intl.Segmenter('th',{granularity:'grapheme'}).segment(line),g=>g.segment);
    const hasPair=o.kern!==0&&o.pair>0&&o.pair<glyphs.length;
    const parts=hasPair?[glyphs.slice(0,o.pair).join(''),glyphs.slice(o.pair).join('')]:[line];
    const delta=hasPair?o.kern/1000*size:0;
    const width=parts.reduce((sum,s)=>sum+f.getAdvanceWidth(s,size,options),delta);
    const anchor=o.align==='middle'?.5:o.align==='end'?1:0;
    let x=anchor*(o.w/(o.sx/100)-width);
    const y=(size*.8+i*o.leading*MM)-o.baseline*MM;
    return parts.map((part,j)=>{if(j)x+=delta;const d=ThaiMarks.outline(f,part,x,y,size,options).toPathData(4);x+=f.getAdvanceWidth(part,size,options);return '<path d="'+d+'"/>';}).join('');
  }).join('');
}
function symbol(o){
  const code=String(o.text).trim();
  if(![13,14].includes(code.length)||!isValidGtin(code,code.length))throw Error('ตรวจเลขบาร์โค้ดและ Check Digit');
  if(o.caption){
    const g=o.caption,bars=code.length===13?encodeEAN13Rects(code,{x:o.w*g.start,y:0,height:o.h*g.bar,moduleWidth:o.w*g.width/95,guardExtraHeight:0}):encodeITF14Rects(code,{x:o.w*g.start,y:0,width:o.w*g.width,height:o.h*g.bar});
    const font=dataFont(o.font),paths=Array.from(code,(ch,i)=>{
      const outline=font.getPath(ch,0,0,1),b=outline.getBoundingBox(),scale=o.h*g.height/(b.y2-b.y1);
      const cx=o.w*(g.left+(g.right-g.left)*i/(code.length-1));
      return '<path transform="translate('+(cx-scale*(b.x1+b.x2)/2)+' '+(o.h*g.top-scale*b.y1)+') scale('+scale+')" d="'+outline.toPathData(5)+'"/>';
    });
    return bars+paths.join('');
  }
  return code.length===13?encodeEAN13Rects(code,{x:0,y:0,height:o.h,moduleWidth:o.w/95,guardExtraHeight:0}):encodeITF14Rects(code,{x:0,y:0,width:o.w,height:o.h});
}
function objectArt(o,preview,output=''){
  const fontOutline=output==='font'&&o.type==='text'&&!o.fixedInk;
  if(output && o.type==='text' && !o.fixedInk && (fontOutline||!SourceArt.original(o))){
    const missing=Array.from(o.text).find(c=>c.trim()&&!dataFont(o.font).charToGlyphIndex(c));
    if(missing)throw Error('ฟอนต์ '+o.font+' ไม่มีอักษร “'+missing+'” ในช่อง '+o.name);
  }
  let contents='';
  if(output==='font'&&o.type==='barcode'&&o.caption)contents=symbol(o);
  else if(!fontOutline&&SourceArt.original(o))contents=SourceArt.patchArt(o);
  else switch(o.type){
    case 'text':contents=!fontOutline&&(SourceArt.quantityArt(o,dataFont)||SourceArt.numericArt(o,project.numerals,dataFont));if(contents)break;
      if(o.fixedInk){contents='<image x="'+o.inkX+'" y="'+o.inkY+'" width="'+o.w+'" height="'+o.h+'" preserveAspectRatio="none" href="'+o.fixedInk+'"/>';break;}
      contents='<g transform="scale('+o.sx/100+' '+o.sy/100+')">'+textArt(o)+'</g>';break;
    case 'barcode':try{contents=symbol(o);}catch(e){if(!preview)throw e;contents='<rect width="'+o.w+'" height="'+o.h+'" fill="#ffe0da"/>';};break;
    case 'line':contents='<path d="M0 0 L'+o.w+' 0" stroke="'+o.color+'" stroke-width="'+o.stroke+'"/>';break;
    case 'rect':contents='<rect width="'+o.w+'" height="'+o.h+'" fill="'+(o.solid?o.color:'none')+'" stroke="'+o.color+'" stroke-width="'+(o.solid?0:o.stroke)+'"/>';break;
    case 'crop':if(o.crop)contents='<image width="'+o.w+'" height="'+o.h+'" preserveAspectRatio="none" href="'+o.crop+'"/>';break;
  }
  const hit=preview?'<rect width="'+o.w+'" height="'+Math.max(.8,o.h)+'" fill="transparent" pointer-events="all"/>':'';
  const trace=output&&['text','barcode'].includes(o.type)&&contents.includes('<image')?
    ' data-outline-ink="1"'+(o.fixedInk?' data-opaque="1"':'')+
    (/^#[a-f0-9]{6}$/i.test(o.sourcePatch?.paper)?' data-paper="'+o.sourcePatch.paper+'"':''):'';
  return '<g'+trace+' data-id="'+escapeXML(o.id)+'" fill="'+o.color+'" transform="translate('+o.x+' '+o.y+') rotate('+o.rotation+')">'+contents+hit+'</g>';
}
function artwork(items,preview,output){
  const base=project.backdrop?'<image x="0" y="0" width="'+project.width+'" height="'+project.height+'" preserveAspectRatio="none" href="'+project.backdrop+'"/>':'';
  return base+items.map(o=>objectArt(o,preview,output)).join('');
}
function svgSource(items=project.layers,output=$('outlineMode').value){
  if(items.some(o=>o.fixedInk&&o.binding))throw Error('สลับบรรทัดที่ผูกข้อมูล Batch กลับเป็นข้อความก่อนส่งออก');
  if(!items.length&&!project.backdrop)throw Error('เพิ่มเลเยอร์ก่อนส่งออก');
  return '<svg xmlns="'+NS+'" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="'+project.width+'mm" height="'+project.height+'mm" preserveAspectRatio="none" viewBox="0 0 '+project.width+' '+project.height+'">'+artwork(items,false,output)+'</svg>';
}
let paintVersion=0,previewTimer,previewProject,printPreview;
function paint(){
  const version=++paintVersion;clearTimeout(previewTimer);
  const s=$('stage'),o=current(),w=project.width,h=project.height,m=$('mode').value;
  s.setAttribute('preserveAspectRatio','none');s.setAttribute('viewBox','0 0 '+w+' '+h);$('artboard').style.width=(100*Number($('zoom').value))+'%';s.style.aspectRatio=w+'/'+h;
  $('opacity').parentElement.hidden=m!=='overlay';$('opacityValue').value=$('opacity').value+'%';
  const ref=project.reference?'<image href="'+project.reference+'" width="'+w+'" height="'+h+'" preserveAspectRatio="none"/>':'';
  if(m==='print' && (project.layers.length||project.backdrop)){
    const paper='<rect width="100%" height="100%" fill="white"/>';
    if(previewProject!==project){previewProject=project;printPreview=StudioPrint.session();}
    previewTimer=setTimeout(async()=>{
      try{const root=await printPreview.prepare(svgSource(),'svg');
        if(version===paintVersion)s.innerHTML=paper+root.innerHTML;
      }catch(e){if(version===paintVersion){s.innerHTML=paper;note(e.message);}}
    },90);
    return;
  }
  const art=artwork(project.layers,true);
  let body='<rect width="100%" height="100%" fill="white"/>';
  if(m==='reference')body+=ref;
  else if(m==='diff')body+=art+'<g pointer-events="none" style="mix-blend-mode:difference">'+ref+'</g>';
  else {body+=art;if(m==='overlay')body+='<g pointer-events="none" opacity="'+Number($('opacity').value)/100+'">'+ref+'</g>';}
  if(o&&m!=='reference')body+='<rect transform="translate('+o.x+' '+o.y+') rotate('+o.rotation+')" width="'+o.w+'" height="'+Math.max(.8,o.h)+'" fill="none" stroke="#117fd1" stroke-width=".18" stroke-dasharray="1 .5" pointer-events="none"/>';
  s.innerHTML=body;
}
function restoreSourceStyle(o){
  const patch=o.sourcePatch;
  if(Number.isFinite(patch.originalDx)&&Number.isFinite(patch.originalDy)){
    o.x+=(patch.dx-patch.originalDx)*o.w;o.y+=(patch.dy-patch.originalDy)*o.h;
    patch.dx=patch.originalDx;patch.dy=patch.originalDy;
  }
  delete o.markTuning;Object.assign(o,patch.style);o.markDrop=patch.style.markDrop??0;
}
function updateSourceNotice(o){
  const el=$('sourceNotice');if(!el)return;
  el.textContent=SourceArt.original(o)?'ช่องนี้แสดงรูปจากต้นฉบับ เมื่อแก้ข้อความหรือรูปแบบจะวาดใหม่เฉพาะช่องนี้':'ช่องนี้ใช้รูปแบบที่แก้แล้ว ส่วนอื่นยังคงตามต้นฉบับ';
}
function field(parent,key,title,kind='number',options){
  const o=current(),lab=document.createElement('label');lab.textContent=title;
  const el=document.createElement(options?'select':kind==='textarea'?'textarea':'input');
  if(options)for(const [v,t] of options)el.add(new Option(t,v));
  else if(kind!=='textarea'){el.type=kind;if(kind==='number')el.step='any';}
  el.value=kind==='number'&&!options?Number(o[key].toFixed(3)):o[key]??'';el.disabled=o.locked;
  let liveEdit=false;
  if(key==='markDrop'){
    el.step='.1';el.title='ค่าบวกเลื่อนลง ค่าลบเลื่อนขึ้น ค่า 0 ใช้ตำแหน่งตามฟอนต์';
    el.oninput=()=>{
      if(!Number.isFinite(el.valueAsNumber))return;
      if(!liveEdit){snap();liveEdit=true;}
      o.markDrop=el.valueAsNumber;paint();refreshMarkPanel?.();updateSourceNotice(o);$('undo').disabled=false;$('redo').disabled=true;
    };
  }
  if(key==='text'&&o.type==='text'){
    el.onfocus=()=>{liveEdit=false;};
    el.oninput=()=>{
      if(!liveEdit){snap();liveEdit=true;}
      o.text=el.value;updateSourceNotice(o);paint();refreshMarkPanel?.();$('undo').disabled=false;$('redo').disabled=true;$('applyCmd').disabled=true;
    };
  }
  el.onchange=()=>{const value=kind==='number'&&!options?Number(el.value):el.value;if(typeof value==='number'&&!Number.isFinite(value))return;
    if(['w','h','pt','leading','sx','sy','stroke'].includes(key)&&value<=0){el.value=o[key];note('ค่านี้ต้องมากกว่า 0');return;}
    if(key==='font'&&o.refRegion){
      const match=compareLine(o)?.matches.find(m=>m.key===value);
      if(match){applyFace(o,match);return;}
      if(compareLine(o)&&referenceText(o).trim()&&Array.from(referenceText(o)).every(c=>!c.trim()||dataFont(value).charToGlyphIndex(c))){
        applyFace(o,{key:value,tracking:o.tracking});return;
      }
    }
    if(!liveEdit)snap();liveEdit=false;o[key]=value;updateSourceNotice(o);refreshLists();paint();$('undo').disabled=false;$('redo').disabled=true;
    $('applyCmd').disabled=true;$('proposal').textContent='';
    if(key==='text')showComparison(o);refreshMarkPanel?.();
  };
  if(key==='text')lab.classList.add('editor-text');
  el.dataset.field=key;lab.append(el);parent.append(lab);
}
function button(parent,title,fn){const b=document.createElement('button');b.textContent=title;b.onclick=guard(fn);parent.append(b);return b;}
function guard(fn){return async(...args)=>{try{await fn(...args);}catch(e){note(e.message||String(e));}};}
function section(parent,title,folded=false){
  const node=document.createElement(folded?'details':'section');
  if(!folded)node.className='section-block';
  const heading=document.createElement(folded?'summary':'h3');heading.textContent=title;node.append(heading);parent.append(node);
  return node;
}
function grid(parent){
  const row=document.createElement('div');row.className='pair';parent.append(row);return row;
}
function small(parent,message){
  const el=document.createElement('small');el.textContent=message;parent.append(el);
}
function fontImport(parent){
  const lab=document.createElement('label');lab.className='file';lab.textContent='＋ เพิ่มฟอนต์ OTF / TTF';
  const input=document.createElement('input');input.type='file';input.accept='.ttf,.otf';input.multiple=true;
  input.onchange=guard(importFonts);lab.append(input);parent.append(lab);
}
function fixToImage(o){
  assertUnlocked();
  if(!image||!o.refRegion)throw Error('ต้องมีภาพอ้างอิงของบรรทัดนี้');
  if(o.binding)throw Error('ล้างชื่อคอลัมน์ Batch ก่อนใช้บรรทัดเป็นภาพคงที่');
  const r=o.refRegion,ox=Math.round(r.x*image.naturalWidth),oy=Math.round(r.y*image.naturalHeight);
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round((r.x+r.w)*image.naturalWidth)-ox);
  c.height=Math.max(1,Math.round((r.y+r.h)*image.naturalHeight)-oy);
  if(c.width*c.height>20000000)throw Error('พื้นที่บรรทัดใหญ่เกินไป');
  c.getContext('2d').drawImage(image,ox,oy,c.width,c.height,0,0,c.width,c.height);
  const src=c.toDataURL('image/png'),box=localInkBox(o);
  snap();o.fixedInk=src;o.inkX=box.x-o.x;o.inkY=box.y-o.y;render();
}
function showComparison(o){
  const host=$('fontComparison');if(!host)return;
  host.replaceChildren();
  const result=compareLine(o);
  if(!result){small(host,'เทียบรูปอักษรได้กับบรรทัดที่ถอดจากภาพต้นฉบับ');return;}
  small(host,'บรรทัดในภาพต้นฉบับ');
  const clip=result.clip;clip.className='reference-clip';clip.setAttribute('aria-label','ภาพต้นฉบับของบรรทัดที่เลือก');host.append(clip);
  if(!result.matches.length){small(host,'ยังเทียบรูปอักษรไม่ได้ ตรวจข้อความและเพิ่มฟอนต์ที่มีอักขระครบ');return;}
  const best=result.matches[0],second=result.matches[1];
  small(host,best.score<72?'รูปอักษรยังต่างกันมาก ลองตรวจคำและเพิ่มฟอนต์ต้นฉบับ':second&&best.score-second.score<4?'หลายฟอนต์ให้รูปอักษรใกล้กัน ตรวจเทียบก่อนเลือก':'เรียงตามความคล้ายของรูปอักษรกับภาพ');
  small(host,'เลือกฟอนต์เพื่อเทียบสเกลและแนวฐานกับข้อความเดิม คำใหม่จะใช้ค่าชุดเดียวกัน');
  for(const match of result.matches.slice(0,3)){
    const b=button(host,'',()=>applyFace(o,match));b.disabled=o.locked;
    const label=document.createElement('span');label.className='result-name';
    label.textContent=match.key+' · ความคล้าย '+match.score+'/100'+(match.key===o.font?' · ใช้อยู่':'');
    b.setAttribute('aria-label','ใช้ '+label.textContent);
    const svg=document.createElementNS(NS,'svg');svg.classList.add('sample-art');svg.setAttribute('aria-hidden','true');
    const outline=dataFont(match.key).getPath(result.text,0,0,40,{kerning:true,letterSpacing:match.tracking/1000}),bb=outline.getBoundingBox();
    svg.setAttribute('viewBox',[bb.x1-1,bb.y1-1,bb.x2-bb.x1+2,bb.y2-bb.y1+2].join(' '));svg.setAttribute('preserveAspectRatio','xMinYMid meet');
    const path=document.createElementNS(NS,'path');path.setAttribute('d',outline.toPathData(3));svg.append(path);b.append(label,svg);
  }
}
const openSections=new Set(['เทียบฟอนต์กับภาพต้นฉบับ']);
function rememberDetails(parent,title){
  const el=section(parent,title,true);el.open=openSections.has(title);
  el.addEventListener('toggle',()=>{if(!el.isConnected)return;if(el.open)openSections.add(title);else openSections.delete(title);});return el;
}
let refreshMarkPanel=null;
function inspect(){
  refreshMarkPanel=null;
  const p=$('inspector'),o=current();p.replaceChildren();
  if(!o){const msg=document.createElement('p');msg.className='note-empty';msg.textContent='คลิกข้อความหรือวัตถุบนฉลากเพื่อแก้ไข หรือเพิ่มเลเยอร์ใหม่';p.append(msg);return;}
  if(o.sourcePatch){
    const hint=document.createElement('small');hint.id='sourceNotice';p.append(hint);updateSourceNotice(o);
  }
  if(o.fixedInk){
    small(p,'บรรทัดนี้ใช้ภาพพิกเซลต้นฉบับ เมื่อต้องการแก้คำให้สลับกลับเป็นข้อความ');
    button(p,'กลับไปใช้ข้อความที่แก้ไขได้',()=>{assertUnlocked();snap();delete o.fixedInk;delete o.inkX;delete o.inkY;render();});
  }else if(o.type==='text'||o.type==='barcode')field(p,'text',o.type==='barcode'?'GTIN / ITF-14':'ข้อความ','textarea');
  if(o.review&&o.confidence!=null)small(p,'ความมั่นใจของ OCR '+o.confidence+'%');
  if(o.type==='text'&&!o.fixedInk){
    field(p,'font','ฟอนต์ / น้ำหนัก','text',fontNames().map(k=>[k,k]));
    const row=grid(p);field(row,'pt','ขนาด (pt)');field(row,'leading','ระยะบรรทัด (pt)');
    fontMarkProfile(p,o);
    refreshMarkPanel=markPanel(p,o);
    const match=rememberDetails(p,'เทียบฟอนต์กับภาพต้นฉบับ');fontImport(match);
    const results=document.createElement('div');results.id='fontComparison';results.className='comparison';match.append(results);
    showComparison(o);
    if(o.refRegion&&image&&!o.sourcePatch){
      button(match,'ใช้ภาพต้นฉบับสำหรับบรรทัดคงที่',()=>fixToImage(o)).disabled=o.locked;
      small(match,'เก็บรูปอักษรตามพิกเซลเดิม รวมพื้นหลังในกรอบบรรทัด สลับกลับมาแก้ข้อความได้');
    }
    if(o.quantity)small(match,'เมื่อแก้เฉพาะตัวเลขในโหมดเก็บทรงอักษร ระบบจะเก็บรูปของหน่วยเดิม');
    if(o.sourcePatch&&Number.isFinite(o.confidence))button(match,'แก้คำถอด OCR โดยคงรูปอักษรเดิม',()=>{
      assertUnlocked();
      const word=prompt('กรอกคำที่พิมพ์อยู่จริงในภาพต้นฉบับ',o.sourcePatch.style.text);
      if(word===null||!word.trim())return;
      snap();restoreSourceStyle(o);o.text=word;o.sourcePatch.style.text=word;render();
      note('แก้คำถอดแล้ว โดยยังใช้รูปอักษรจากภาพเดิม');
    });
    if(o.sourcePatch)button(match,'คืนข้อความและรูปแบบต้นฉบับของช่องนี้',()=>{assertUnlocked();snap();restoreSourceStyle(o);delete o.fixedInk;render();});
    const panel=rememberDetails(p,'ปรับตัวอักษรละเอียด');const c=grid(panel);
    field(c,'markDrop','ลดเครื่องหมายบนทั้งหมด (pt)');
    for(const [k,t] of [['tracking','ช่องไฟ Tracking /1000 em'],['baseline','ยกเส้นฐาน (pt)'],['sx','สเกลแนวนอน (%)'],['sy','สเกลแนวตั้ง (%)'],['pair','Kerning หลังอักษรที่'],['kern','Kerning /1000 em']])field(c,k,t);
    field(panel,'align','จัดแนว','text',[['start','ซ้าย'],['middle','กลาง'],['end','ขวา']]);
  }
  const geom=section(p,'ตำแหน่งและขนาด'),xy=grid(geom);
  for(const [k,title] of [['x','ตำแหน่ง X'],['y','ตำแหน่ง Y'],['w','กว้าง'],['h','สูง']])field(xy,k,title+' (mm)');
  const style=grid(geom);field(style,'rotation','มุมหมุน (°)');if(!o.fixedInk)field(style,'color','สี','color');
  if(['rect','line'].includes(o.type))field(geom,'stroke','น้ำหนักเส้น (mm)');
  if(o.type==='rect')button(geom,o.solid?'เปลี่ยนเป็นกรอบ':'เติมสีเต็ม',()=>{assertUnlocked();snap();o.solid=!o.solid;render();});
  if(o.type==='crop'){
    const upload=document.createElement('label');upload.className='file';upload.textContent='แทนที่ด้วยไฟล์โลโก้ความละเอียดสูง';
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.disabled=o.locked;
    input.onchange=guard(async()=>{
      const f=input.files[0];if(!f)return;
      if(f.size>32e6)throw Error('เลือกไฟล์โลโก้ขนาดไม่เกิน 32 MB');
      const data=await readFile(f);if(!bitmap(data))throw Error('เลือกโลโก้ PNG, JPG หรือ WebP');
      const logo=await imgFrom(data);
      if(o!==current()||o.locked)return;
      snap();o.crop=data;delete o.sourcePatch;render();
      note('ฝังโลโก้ '+logo.naturalWidth+' × '+logo.naturalHeight+' px แล้ว');
    });
    upload.append(input);geom.append(upload);
    if(o.crop){
      const native=document.createElement('small');geom.append(native);
      imgFrom(o.crop).then(i=>{native.textContent=i.naturalWidth+' × '+i.naturalHeight+' px · '+Math.round(Math.min(i.naturalWidth*25.4/o.w,i.naturalHeight*25.4/o.h))+' ppi ที่ขนาดวางจริง';}).catch(()=>{});
    }
  }
  if(o.type==='crop'&&image)button(geom,'ตัดภาพจากตำแหน่งนี้',()=>{assertUnlocked();if(!image)throw Error('เพิ่มต้นฉบับก่อน');snap();o.crop=cropImage(o);render();});
  const extra=rememberDetails(p,'จัดการเลเยอร์และข้อมูล Batch');
  if(o.type==='text'){
    const marked=project.productNameLayerId===o.id;
    const choose=button(extra,marked?'ใช้เป็นชื่อไฟล์อยู่ · กลับไปเลือกอัตโนมัติ':'ใช้ข้อความช่องนี้เป็นชื่อไฟล์',()=>{
      snap();if(marked)delete project.productNameLayerId;else project.productNameLayerId=o.id;render();
    });
    choose.setAttribute('aria-pressed',String(marked));
  }
  if(o.review)button(extra,'ทำเครื่องหมายว่าตรวจแล้ว',()=>{if(o.type==='barcode')symbol(o);snap();o.review=false;render();}).className='review';
  field(extra,'name','ชื่อเลเยอร์','text');
  if(!o.fixedInk&&(o.type==='text'||o.type==='barcode'))field(extra,'binding','ชื่อคอลัมน์สำหรับ Batch','text');
  field(extra,'group','ชื่อกลุ่มสำหรับเลื่อนพร้อมกัน','text');
  const actions=document.createElement('div');actions.className='tools selection-actions';extra.append(actions);
  button(actions,o.locked?'ปลดล็อก':'ล็อกเลเยอร์',()=>{snap();o.locked=!o.locked;render();});
  for(const [t,d] of [['ขึ้นหน้า',1],['ลงหลัง',-1]])button(actions,t,()=>{assertUnlocked();const i=project.layers.indexOf(o),j=i+d;if(j<0||j>=project.layers.length)return;snap();project.layers.splice(i,1);project.layers.splice(j,0,o);render();});
  button(actions,'ลบเลเยอร์',()=>{assertUnlocked();snap();project.layers=project.layers.filter(x=>x!==o);selected=null;render();});
}
function refreshLists(){
  const list=$('layers'),picker=$('layerPicker');list.replaceChildren();picker.replaceChildren();
  if(!current())picker.add(new Option('เลือกเลเยอร์',''));
  for(const o of [...project.layers].reverse()){
    const title=(o.review?'◇ ':'')+(o.locked?'▣ ':'')+o.name+(o.type==='text'?' · '+o.text:'');
    picker.add(new Option(title,o.id));
    const b=button(list,title,()=>{selected=o.id;render();if(matchMedia('(max-width:960px)').matches)$('inspectorTitle').scrollIntoView({block:'start'});});
    b.className='layer'+(o.id===selected?' active':'');b.setAttribute('aria-pressed',String(o.id===selected));
  }
  picker.value=selected||'';picker.disabled=!project.layers.length;
  $('layerCount').textContent=project.layers.length?project.layers.length+' เลเยอร์':'';
}
function render(){
  if(typeof drawing!=='undefined'&&drawing){drawing=null;$('stage').classList.remove('marking');$('markField').setAttribute('aria-pressed','false');}
  $('name').value=project.name;$('width').value=Number(project.width.toFixed(4));$('height').value=Number(project.height.toFixed(4));
  $('outlineMode').value=project.outlineMode==='font'?'font':'ink';
  $('sourceSizeHint').textContent=sourceSizeText();
  $('sourceInfo').textContent=project.name+' · '+Number(project.width.toFixed(2))+' × '+Number(project.height.toFixed(2))+' mm';
  $('undo').disabled=!history.length;$('redo').disabled=!future.length;$('applyCmd').disabled=true;$('proposal').textContent='';pending=null;
  $('markField').hidden=!project.backdrop;refreshLists();inspect();paint();$('extract').disabled=busy||!project.reference;
}
function cropImage(o){
  const c=document.createElement('canvas'),kx=image.naturalWidth/project.width,ky=image.naturalHeight/project.height;
  c.width=Math.max(1,Math.round(o.w*kx));c.height=Math.max(1,Math.round(o.h*ky));
  c.getContext('2d').drawImage(image,o.x*kx,o.y*ky,c.width,c.height,0,0,c.width,c.height);return c.toDataURL('image/png');
}
function readFile(f){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('อ่านไฟล์ไม่ได้'));r.readAsDataURL(f);});}
function imgFrom(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('เปิดภาพไม่ได้'));i.src=src;});}
async function restore(p,preferred=null){validateProject(p);const next=p.reference?await imgFrom(p.reference):null;
  for(const o of p.layers)if(o.type==='text'){
    if(!o.sourcePatch&&o.refRegion&&o.referenceText===undefined)o.referenceText=o.text;
    await SourceArt.recoverQuantity(o);
  }
  project=p;image=next;selected=p.layers.some(o=>o.id===preferred)?preferred:p.layers[0]?.id||null;parsedFonts.clear();matchCache=new WeakMap();
  // Older OCR templates only stored their positioned ink box. Recover it for comparison.
  if(next)for(const o of p.layers)if(o.type==='text'&&Number.isFinite(o.confidence)&&o.refRegion===undefined){
    o.refRegion=regionFor(localInkBox(o));o.referenceText??=o.text;
  }
  render();}
let importing=false;
async function setRef(f){
  if(!f||importing||busy)return;
  const kind=StudioSourceImport.kind(f),vector=kind!=='bitmap',limit=vector?64:15;
  if(f.size>limit*1e6)throw Error('เลือกไฟล์ขนาดไม่เกิน '+limit+' MB');
  importing=true;
  const main=document.querySelector('main'),head=document.querySelector('header');
  main.inert=true;head.inert=true;
  note('กำลังอ่าน '+f.name+'…');
  try{
    const result=kind==='pdf'?await StudioSourceImport.pdfFile(f):kind==='svg'?await StudioSourceImport.svgFile(f,project.width):{src:await readFile(f)};
    if(!result){note('ยกเลิกการเลือกหน้า PDF');return;}
    const {src,size,reason}=result;
    if(!bitmap(src))throw Error('รองรับไฟล์ PNG, JPG, WebP, SVG และ PDF');
    const i=await imgFrom(src);
    const fresh=project.reference!==src&&(project.backdrop||(vector&&project.layers.length));
    if(fresh&&!confirm('เปิดต้นฉบับใหม่แทนงานที่กำลังแก้ไข? ย้อนกลับได้ด้วย Undo')){note('เก็บงานเดิมไว้แล้ว');return;}
    snap();
    if(fresh){project={...blank(),fonts:{...project.fonts}};selected=null;}
    if(project.reference!==src)for(const o of project.layers)if(o.type==='text')o.refRegion=null;
    project.reference=src;project.sourceFileStem=f.name.replace(/\.[^./]+$/u,'');image=i;matchCache=new WeakMap();
    if(size){
      if(project.layers.length&&project.backdrop&&Math.abs(project.width-size.width)>1e-8)SourceArt.resize(project,size.width/project.width);
      project.width=size.width;project.height=size.height;
      project.importSize={width:size.width,height:size.height,reason,dpi:size.dpi};
    }else{
      delete project.importSize;
      if(!project.layers.length)project.height=bounded(project.width*i.naturalHeight/i.naturalWidth,1,1000,34);
    }
    $('mode').value='overlay';render();
    note(size?sourceSizeText():'ตรวจขนาดจริงเป็น mm แล้วกดถอดภาพ');
  }finally{importing=false;main.inert=false;head.inert=false;}
}
function sourceSizeText(){
  const m=project.importSize;
  if(!m)return 'SVG และ PDF อ่านขนาดจากไฟล์ · สำหรับภาพถ่าย ให้กรอกขนาดพิมพ์จริง';
  const changed=Math.abs(project.width-m.width)>.001||Math.abs(project.height-m.height)>.001;
  const placed=changed?' · ขนาดที่ใช้ '+Number(project.width.toFixed(3))+' × '+Number(project.height.toFixed(3))+' มม.':'';
  const ppi=changed&&image?Math.round(Math.min(image.naturalWidth*25.4/project.width,image.naturalHeight*25.4/project.height)):m.dpi;
  return m.reason+' · '+Number(m.width.toFixed(3))+' × '+Number(m.height.toFixed(3))+' มม.'+placed+' · ภาพสำหรับถอดแบบ '+ppi+' ppi';
}
function download(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function pdfRows(rows){
  const w=project.width,h=project.height,pdf=new jspdf.jsPDF({putOnlyUsedFonts:true,unit:'mm',format:[w,h],orientation:w>=h?'landscape':'portrait',compress:true});
  const exportTime=new Date(),print=StudioPrint.session();let filename;
  for(const [index,row] of rows.entries()){
    const objects=project.layers.map(o=>o.binding&&row&&Object.hasOwn(row,o.binding)?{...o,text:row[o.binding]}:o);
    if(index===0)filename=StudioExportName.filename(project,objects,'pdf',exportTime);
    let src;try{src=svgSource(objects);}catch(e){throw Error('แถว '+(index+1)+' · '+e.message);}
    if(index)pdf.addPage([w,h],w>=h?'landscape':'portrait');
    await pdf.svg(await print.prepare(src,'pdf'),{x:0,y:0,width:w,height:h});
  }
  pdf.save(filename);return 'ส่งออก PDF '+rows.length+' หน้า · ตัวอักษร Outline'+print.detail();
}
function parseTable(value){
  const rows=value.replace(/\r/g,'').trimEnd().split('\n').map(s=>s.split('\t'));
  const keys=rows.shift().map(s=>s.trim());
  if(!rows.length||rows.length>300||new Set(keys).size!==keys.length)throw Error('ใช้หัวตารางที่ไม่ซ้ำและข้อมูล 1–300 แถว');
  const fields=project.layers.map(o=>o.binding).filter(Boolean);
  if(!fields.length)throw Error('ระบุชื่อคอลัมน์ Batch ในเลเยอร์ก่อน');
  const required=project.layers.filter(o=>o.binding&&!o.batchOptional).map(o=>o.binding);
  if(!fields.some(key=>keys.includes(key)))throw Error('หัวตารางต้องตรงกับชื่อฟิลด์อย่างน้อยหนึ่งช่อง');
  for(const key of required)if(!keys.includes(key))throw Error('ไม่พบคอลัมน์ '+key);
  return rows.map((cells,i)=>{if(cells.length!==keys.length)throw Error('จำนวนช่องไม่ตรงในแถว '+(i+1));const row=Object.fromEntries(keys.map((k,j)=>[k,cells[j]]));for(const k of fields)if(keys.includes(k)&&!row[k].trim())throw Error('แถว '+(i+1)+' ไม่มีค่า '+k);return row;});
}
function dbOpen(){return new Promise((ok,no)=>{const r=indexedDB.open('BarcodedzyTemplateStudio',1);r.onupgradeneeded=()=>r.result.createObjectStore('templates',{keyPath:'id'});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(Error('เปิดที่เก็บในเครื่องไม่ได้ ใช้ดาวน์โหลดโปรเจกต์แทน'));});}
async function database(action,value){
  const db=await dbOpen();try{return await new Promise((ok,no)=>{
    const tx=db.transaction('templates',action==='put'?'readwrite':'readonly');
    const store=tx.objectStore('templates'),req=action==='getAll'?store.getAll():store[action](value);
    tx.oncomplete=()=>ok(req.result);tx.onerror=tx.onabort=()=>no(Error('บันทึกหรือเปิดไม่ได้ กรุณาใช้ไฟล์โปรเจกต์สำรอง'));
  });}finally{db.close();}
}
async function refreshShelf(){const all=await database('getAll');$('shelf').replaceChildren(...all.map(p=>new Option(p.name,p.id)));if(all.some(p=>p.id===project.id))$('shelf').value=project.id;}
function planCommand(source,o){
  const parts=source.trim().split(/\s*(?:และ|,|;)\s*/);const changes={};
  for(const raw of parts){
    const num=raw.match(/-?\d+(?:\.\d+)?/),v=Number(num?.[0]);
    if(/กึ่งกลาง|จัดกลาง/.test(raw)){changes.x=(project.width-o.w)/2;continue;}
    if(!num)throw Error('ระบุระยะหรือขนาด เช่น เลื่อนลง 0.5 mm');
    if(/kerning|เคอร์นิง/i.test(raw)){
      const nums=raw.match(/-?\d+(?:\.\d+)?/g).map(Number);
      if(nums.length!==2||!Number.isInteger(nums[0])||nums[0]<1)throw Error('ใช้ Kerning หลังอักษรที่ 3 -20');
      changes.pair=nums[0];changes.kern=nums[1];continue;
    }
    if(/สระ|วรรณยุกต์/.test(raw)){
      const before=changes.markDrop??o.markDrop??0;
      changes.markDrop=/ยก|ขึ้น/.test(raw)?before-Math.abs(v):/ลด|ลง/.test(raw)?before+Math.abs(v):v;continue;
    }
    if(/เส้นฐาน|baseline/i.test(raw)){
      const base=changes.baseline??o.baseline;
      changes.baseline=/ยก|ขึ้น/.test(raw)?base+Math.abs(v):/ลด|ลง/.test(raw)?base-Math.abs(v):v;continue;
    }
    if(/ระยะบรรทัด|leading/i.test(raw)){
      if(v<=0)throw Error('ระยะบรรทัดต้องมากกว่า 0 pt');changes.leading=v;continue;
    }
    if(/สเกลแนวนอน|สเกลแนวตั้ง|horizontal scale|vertical scale/i.test(raw)){
      if(v<=0)throw Error('สเกลต้องมากกว่า 0%');
      changes[/แนวนอน|horizontal/i.test(raw)?'sx':'sy']=v;continue;
    }
    if(/ช่องไฟ|tracking/i.test(raw)){changes.tracking=(/เพิ่ม|ลด/.test(raw)?o.tracking:0)+(/ลด/.test(raw)?-1:1)*v;continue;}
    if(/ขนาด|ฟอนต์|pt/i.test(raw)){if(v<=0)throw Error('ขนาดฟอนต์ต้องมากกว่า 0');changes.pt=v;continue;}
    if(/หมุน/.test(raw)){changes.rotation=v;continue;}
    const dir=['ซ้าย','ขวา','ขึ้น','ลง'].find(d=>raw.includes(d));
    if(!dir)throw Error('รองรับเลื่อน จัดกลาง ขนาดฟอนต์ ช่องไฟ และหมุน');
    const k=['ซ้าย','ขวา'].includes(dir)?'x':'y';
    changes[k]=(changes[k]??o[k])+(['ซ้าย','ขึ้น'].includes(dir)?-v:v);
  }
  if((o.type!=='text'||o.fixedInk)&&['pt','tracking','baseline','markDrop','leading','sx','sy','pair','kern'].some(k=>k in changes))throw Error('เลือกเลเยอร์ข้อความก่อน');
  return changes;
}
function moveMembers(o,dx,dy){for(const member of project.layers)if(!member.locked&&(member===o||(o.group&&member.group===o.group))){member.x=Math.round((member.x+dx)*1000)/1000;member.y=Math.round((member.y+dy)*1000)/1000;}}
function point(e){const p=$('stage').createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform($('stage').getScreenCTM().inverse());}
$('stage').onpointerdown=e=>{const el=e.target.closest('[data-id]');if(!el)return;selected=el.dataset.id;render();$('stage').focus();if(current().locked)return;drag={last:point(e),saved:false};$('stage').setPointerCapture(e.pointerId);};
$('stage').onpointermove=e=>{if(!drag)return;const p=point(e);if(!drag.saved){snap();drag.saved=true;}moveMembers(current(),p.x-drag.last.x,p.y-drag.last.y);drag.last=p;paint();};
$('stage').onpointerup=$('stage').onpointercancel=()=>{if(drag){drag=null;render();}};
$('stage').onkeydown=e=>{const o=current();if(!o||o.locked)return;const keys={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!keys[e.key])return;e.preventDefault();snap();const step=e.shiftKey?1:.1;moveMembers(o,...keys[e.key].map(i=>i*step));render();};
let drawing=null;
function cancelField(){
  drawing=null;$('stage').classList.remove('marking');$('markField').setAttribute('aria-pressed','false');paint();
}
$('markField').onclick=()=>{
  if(drawing){cancelField();return;}
  if(!project.backdrop)return;
  drawing={};$('mode').value='art';$('stage').classList.add('marking');$('markField').setAttribute('aria-pressed','true');
  paint();note('ลากกรอบชิดข้อความบนภาพ แล้วกรอกข้อความเดิมเพื่อเทียบฟอนต์ · Esc เพื่อยกเลิก');
};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawing)cancelField();});
function dragBox(a,b){
  const w=project.width,h=project.height,x=bounded(Math.min(a.x,b.x),0,w,0),y=bounded(Math.min(a.y,b.y),0,h,0);
  return {x,y,w:bounded(Math.max(a.x,b.x),0,w,0)-x,h:bounded(Math.max(a.y,b.y),0,h,0)-y};
}
const stage=$('stage');
stage.addEventListener('pointerdown',e=>{
  if(!drawing)return;e.stopImmediatePropagation();e.preventDefault();drawing.start=point(e);stage.setPointerCapture(e.pointerId);
},true);
stage.addEventListener('pointermove',e=>{
  if(!drawing?.start)return;e.stopImmediatePropagation();const box=dragBox(drawing.start,point(e));
  let mark=$('fieldBounds');
  if(!mark){mark=document.createElementNS(NS,'rect');mark.id='fieldBounds';mark.setAttribute('fill','#2563eb26');mark.setAttribute('stroke','#2563eb');mark.setAttribute('stroke-width',project.width/700);stage.append(mark);}
  for(const [k,v] of Object.entries({x:box.x,y:box.y,width:box.w,height:box.h}))mark.setAttribute(k,v);
},true);
stage.addEventListener('pointercancel',e=>{if(drawing){e.stopImmediatePropagation();cancelField();}},true);
stage.addEventListener('pointerup',guard(async e=>{
  if(!drawing?.start)return;e.stopImmediatePropagation();const box=dragBox(drawing.start,point(e)),token=project,old=project.backdrop;cancelField();
  if(box.w<project.width/600||box.h<project.height/600)return;
  const text=prompt('ข้อความเดิมในกรอบนี้ (ใช้เทียบฟอนต์)');if(text===null)return;
  const o=layer('text',{...box,text,name:'ช่องข้อความ',refRegion:regionFor(box)});
  const base=await imgFrom(old);if(project!==token||project.backdrop!==old)return;
  const comp=compareLine(o),best=comp?.matches[0],b=comp?StudioFonts.inkBounds(comp.clip):{x:0,y:0,w:1,h:1};
  const measured={x:box.x+b.x*box.w,y:box.y+b.y*box.h,w:box.w*b.w,h:box.h*b.h};
  if(text.trim())fitFace(o,best?.key||o.font,measured,best?.score>=70?best.tracking:0);
  else o.pt=box.h/MM;
  if(comp)o.color=StudioFonts.inkColor(comp.clip);
  const rebuilt=SourceArt.separate(base,[o],project.width,project.height);
  snap();project.backdrop=rebuilt;project.layers.push(o);selected=o.id;render();note('เพิ่มช่องแล้ว · พิมพ์ข้อความใหม่ในแผงแก้ไข');
}),true);
for(const b of document.querySelectorAll('[data-add]'))b.onclick=guard(()=>{const type=b.dataset.add;snap();const o=layer(type,{w:Math.min(32,project.width*.65),h:Math.min(6,project.height*.3)});if(type==='crop'&&image)o.crop=cropImage(o);project.layers.push(o);selected=o.id;render();});
for(const id of ['mode','opacity'])$(id).oninput=paint;
function setCanvasZoom(index){
  const select=$('zoom'),desk=$('desk'),board=$('artboard');
  const previous=board.getBoundingClientRect(),deskBox=desk.getBoundingClientRect();
  const mid={x:deskBox.left+desk.clientWidth/2,y:deskBox.top+desk.clientHeight/2};
  const o=current(),clamp=n=>Math.max(0,Math.min(1,n));
  const fx=clamp(o?(o.x+o.w/2)/project.width:(mid.x-previous.left)/previous.width);
  const fy=clamp(o?(o.y+o.h/2)/project.height:(mid.y-previous.top)/previous.height);
  const x=previous.left+fx*previous.width,y=previous.top+fy*previous.height;
  const keepX=x>=deskBox.left&&x<=deskBox.right?x:mid.x,keepY=y>=deskBox.top&&y<=deskBox.bottom?y:mid.y;
  select.selectedIndex=Math.max(0,Math.min(select.length-1,index));
  board.style.width=(Number(select.value)*100)+'%';
  const next=board.getBoundingClientRect();
  desk.scrollLeft+=next.left+fx*next.width-keepX;desk.scrollTop+=next.top+fy*next.height-keepY;
  $('zoomOut').disabled=select.selectedIndex===0;$('zoomIn').disabled=select.selectedIndex===select.length-1;
}
$('zoomOut').onclick=()=>setCanvasZoom($('zoom').selectedIndex-1);
$('zoomIn').onclick=()=>setCanvasZoom($('zoom').selectedIndex+1);
$('zoom').oninput=()=>setCanvasZoom($('zoom').selectedIndex);
for(const id of ['width','height','name'])$(id).onchange=()=>{
  if(id==='name'){snap();project.name=$('name').value.trim()||'ฉลากใหม่';}
  else{
    const value=bounded($(id).value,1,1000,project[id]),factor=value/project[id],other=id==='width'?'height':'width';
    const keepRatio=!!(project.backdrop||project.importSize);
    if(keepRatio&&(project[other]*factor<1||project[other]*factor>1000)){render();note('ขนาดอีกด้านต้องอยู่ในช่วง 1–1000 mm');return;}
    snap();if(keepRatio)SourceArt.resize(project,factor);else project[id]=value;
  }
  render();
};
$('imageFile').onchange=guard(e=>{const f=e.target.files[0];e.target.value='';return setRef(f);});
$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('over');};$('drop').ondragleave=()=>$('drop').classList.remove('over');
$('drop').ondrop=guard(async e=>{e.preventDefault();$('drop').classList.remove('over');await setRef(e.dataTransfer.files[0]);});
let scanTimer;
function startScan(){
  clearTimeout(scanTimer);
  const overlay=$('scanOverlay');overlay.classList.remove('finished');
  $('scanSource').src=project.reference;$('scanLabel').textContent='กำลังเตรียมภาพ';overlay.hidden=false;
  $('artboard').setAttribute('aria-busy','true');
  const rect=$('artboard').getBoundingClientRect();
  if(rect.top>=innerHeight||rect.bottom<=0)$('artboard').scrollIntoView({block:'nearest'});
}
function finishScan(success){
  $('artboard').setAttribute('aria-busy','false');
  $('scanSource').removeAttribute('src');
  const overlay=$('scanOverlay');
  if(!success||matchMedia('(prefers-reduced-motion: reduce)').matches){overlay.hidden=true;return;}
  $('scanLabel').textContent='ถอดแบบเสร็จแล้ว';overlay.classList.add('finished');
  scanTimer=setTimeout(()=>{overlay.hidden=true;},450);
}
function scanProgress(state,fraction){
  const reading=state==='recognizing text';
  const caption=reading?'กำลังอ่านข้อความ':'กำลังเตรียมตัวอ่าน';
  const percent=reading&&Number.isFinite(fraction)?' · '+Math.round(bounded(fraction,0,1,0)*100)+'%':'';
  $('scanLabel').textContent=caption+percent;note(caption+percent);
}
$('extract').onclick=guard(async()=>{
  if(!image||busy)return;
  if(project.layers.length&&!confirm('แทนที่เลเยอร์บนฉลากด้วยผลถอดแบบใหม่? สามารถ Undo ได้'))return;
  const original=project,old=JSON.stringify(project),preserve=$('traceMode').value==='source';busy=true;$('extract').disabled=true;
  let success=false;
  startScan();
  try{
    if($('traceMode').value==='manual'){
      snap();project.backdrop=project.reference;project.layers=[];selected=null;$('mode').value='art';$('sourcePanel').open=false;
      success=true;note('กด “ตีกรอบช่องข้อความจากภาพ” แล้วลากรอบข้อความที่ต้องการแก้');return;
    }
    if(preserve&&await isLunaReference()){
      const master=await getLuna();
      if(project===original&&JSON.stringify(project)===old&&master.reference===project.reference){
        const factor=project.width/master.width;SourceArt.resize(master,factor);
        master.name=project.name==='ฉลากใหม่'?master.name:project.name;
        master.id=project.id;master.fonts={...project.fonts};snap();await restore(master);
        $('mode').value='art';$('sourcePanel').open=false;success=true;note('ตรงกับภาพ LUNA ต้นฉบับ · โหลดช่องที่ตรวจเทียบกับภาพแล้ว');return;
      }
    }
    if(preserve&&image.naturalWidth*image.naturalHeight>24000000)throw Error('โหมดคงภาพรองรับภาพไม่เกิน 24 ล้านพิกเซล');
    note('กำลังเตรียมตัวอ่านภาษาไทยและอังกฤษ…');
    const found=await StudioTrace.extract(image,project.width,project.height,scanProgress,preserve);
    $('scanLabel').textContent='กำลังแยกเลเยอร์';
    await new Promise(resolve=>setTimeout(resolve,0));
    if(original!==project||JSON.stringify(project)!==old)throw Error('โปรเจกต์เปลี่ยนระหว่างถอดภาพ กรุณากดถอดใหม่');
    if(!found.length&&!preserve)throw Error('ไม่พบข้อความหรือเส้นที่อ่านได้ ลองใช้ภาพหน้าตรงที่ชัดขึ้น');
    const layers=found.map(v=>{
      const {alternate,...values}=v;
      const o=layer(v.type,values);if(preserve){o.refRegion=regionFor(v);if(o.type!=='text'&&o.type!=='crop')o.color=StudioFonts.inkColor(StudioFonts.sample(image,o.refRegion));}
      if(o.type==='text'){
        o.refRegion=regionFor(v);
        let result=compareLine(o);
        if(alternate){
          const alternative={...o,text:alternate.text},other=compareLine(alternative);
          if((other?.matches[0]?.score||0)>(result?.matches[0]?.score||0)+9){
            o.text=alternate.text;o.confidence=alternate.confidence;result=other;matchCache.set(o,other);
          }
        }
        const best=result?.matches[0],b=result?StudioFonts.inkBounds(result.clip):{x:0,y:0,w:1,h:1};
        const measured={x:v.x+b.x*v.w,y:v.y+b.y*v.h,w:v.w*b.w,h:v.h*b.h};
        fitFace(o,best?.key||o.font,measured,best?.score>=70?best.tracking:0);
        o.referenceText=o.text;
        o.referenceBox={x:v.x,y:v.y,w:v.w,h:v.h,originX:o.x,originY:o.y};
        if(result)o.color=StudioFonts.inkColor(result.clip);
      }
      return o;
    });
    const backdrop=preserve?SourceArt.separate(image,layers,project.width,project.height):undefined;
    snap();if(backdrop)project.backdrop=backdrop;else delete project.backdrop;
    project.layers=layers;selected=(layers.find(o=>o.type==='text')||layers[0])?.id||null;
    $('mode').value='art';$('sourcePanel').open=false;
    success=true;
    if(!layers.length){note('เก็บภาพต้นฉบับแล้ว กดตีกรอบช่องข้อความเพื่อเลือกจุดที่ต้องการแก้');return;}
    note('พบ '+layers.length+' เลเยอร์ · ส่งออก SVG หรือ PDF ได้ทันที');
  }finally{busy=false;finishScan(success);render();}
});
let lunaLoading;
async function getLuna(){
  if(!lunaLoading)lunaLoading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='examples/luna-template.js';
    script.onload=()=>resolve(window.lunaTemplate);script.onerror=()=>{lunaLoading=null;reject(Error('เปิดตัวอย่างไม่ได้ กรุณาแตก ZIP ทั้งโฟลเดอร์'));};document.head.append(script);
  });
  return JSON.parse(JSON.stringify(await lunaLoading));
}
async function isLunaReference(){
  if(image?.naturalWidth!==2048||image.naturalHeight!==729)return false;
  // Exact identity only. Similar photos must run through their own recognition pass.
  try{return (await getLuna()).reference===project.reference;}catch{return false;}
}
$('lunaExample').onclick=guard(async()=>{
  const master=await getLuna();
  if((project.reference||project.layers.length)&&!confirm('เปิดตัวอย่าง LUNA แทนงานปัจจุบัน? ย้อนกลับได้ด้วย Undo'))return;
  snap();master.id=uid();await restore(master);$('mode').value='art';$('sourcePanel').open=false;
  selected=project.layers.find(o=>o.binding==='ProductNameTH')?.id||selected;render();note('คลิกช่องที่ต้องการแก้ · ความกว้างตั้งต้น 100 mm เปลี่ยนตามขนาดพิมพ์จริงได้');
});
async function importFonts(e){
  const input=e.target,files=Array.from(input.files);input.value='';
  if(!files.length)return;
  const original=project,added={},errors=[];
  for(const f of files){
    try{
      if(f.size>8e6)throw Error('เกิน 8 MB');
      const src=(await readFile(f)).split(',')[1];
      if([...Object.values(labelFonts),...Object.values(original.fonts),...Object.values(added)].includes(src))continue;
      const font=opentype.parse(await f.arrayBuffer());font.getPath('A',0,0,24).getBoundingBox();
      const base=f.name.replace(/\.[^.]+$/,'')||'Imported font';
      let key=base,number=2;
      while(key in labelFonts||key in original.fonts||key in added){key=base+' ('+number+')';number++;}
      added[key]=src;
    }catch(err){errors.push(f.name+' · '+err.message);}
  }
  if(original!==project)throw Error('โปรเจกต์เปลี่ยน กรุณาเลือกไฟล์ฟอนต์อีกครั้ง');
  const count=Object.keys(added).length;
  if(count){snap();Object.assign(project.fonts,added);matchCache=new WeakMap();render();}
  note((count?'เพิ่มฟอนต์ '+count+' ไฟล์แล้ว · ใช้เทียบเมื่อถอดภาพ หรือเลือกจากผลเทียบของบรรทัดเดิม':'ไม่มีฟอนต์ใหม่')+(errors.length?' · '+errors.join(' / '):''));
}
$('fontFile').onchange=guard(importFonts);
$('layerPicker').onchange=e=>{selected=e.target.value||null;render();};
$('expand').onclick=()=>{const expanded=document.body.classList.toggle('expanded');$('expand').textContent=expanded?'กลับมุมมองแก้ไข':'ขยายพื้นที่ฉลาก';$('expand').setAttribute('aria-pressed',String(expanded));document.querySelector('.center').scrollIntoView({block:'start'});};
let changingHistory=false;
async function historyStep(redo){
  if(changingHistory||busy||importing||document.querySelector('dialog[open]')||document.querySelector('main').inert)return;
  const source=redo?future:history,destination=redo?history:future;
  if(!source.length)return;
  const before=snapshot();
  let index=source.length-1;
  while(index>=0&&source[index].data===before.data)index--;
  if(index<0){source.length=0;$('undo').disabled=!history.length;$('redo').disabled=!future.length;return;}
  const item=source[index],main=document.querySelector('main'),header=document.querySelector('header');
  changingHistory=true;main.inert=true;header.inert=true;
  try{
    await restore(JSON.parse(item.data),item.selected);
    source.splice(index);destination.push(before);
    if(destination.length>30)destination.shift();
    $('undo').disabled=!history.length;$('redo').disabled=!future.length;
    note(redo?'ทำซ้ำแล้ว':'ย้อนกลับแล้ว');
  }finally{changingHistory=false;main.inert=false;header.inert=false;}
}
$('undo').onclick=guard(()=>historyStep(false));$('redo').onclick=guard(()=>historyStep(true));
document.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.isComposing||e.altKey||!(e.metaKey||e.ctrlKey)||e.ctrlKey&&e.metaKey)return;
  if(e.target.isContentEditable||e.target.closest?.('textarea,input:not([type=button]),[role=textbox]'))return;
  if(document.querySelector('dialog[open]')||document.querySelector('main').inert||busy||importing||drag||drawing)return;
  const key=/^[a-z]$/i.test(e.key)?e.key.toLowerCase():e.code==='KeyZ'?'z':e.code==='KeyY'?'y':'';
  if(key!=='z'&&!(key==='y'&&e.ctrlKey&&!e.shiftKey))return;
  e.preventDefault();
  (e.shiftKey||key==='y'?$('redo'):$('undo')).click();
});
$('previewCmd').onclick=guard(()=>{const o=current();if(!o)throw Error('เลือกเลเยอร์ก่อน');assertUnlocked();const changes=planCommand($('command').value,o);pending={id:o.id,changes};const titles={x:'X (mm)',y:'Y (mm)',pt:'ขนาด (pt)',baseline:'เส้นฐาน (pt)',markDrop:'ลดสระและวรรณยุกต์ (pt)',rotation:'มุม (°)',tracking:'ช่องไฟ',pair:'คู่หลังอักษรที่',kern:'Kerning',leading:'ระยะบรรทัด (pt)',sx:'สเกลแนวนอน (%)',sy:'สเกลแนวตั้ง (%)'};$('proposal').textContent=Object.entries(changes).map(([k,v])=>titles[k]+' '+Number(o[k].toFixed(3))+' → '+Number(v.toFixed(3))).join(' · ');$('applyCmd').disabled=false;});
$('command').oninput=()=>{pending=null;$('applyCmd').disabled=true;$('proposal').textContent='';};
$('applyCmd').onclick=guard(()=>{if(!pending||pending.id!==selected)return;const c=pending.changes,o=current();assertUnlocked();snap();moveMembers(o,(c.x??o.x)-o.x,(c.y??o.y)-o.y);Object.assign(o,c);render();note('ใช้คำสั่งแล้ว');});
$('save').onclick=guard(async()=>{await database('put',validateProject(project));await refreshShelf();note('บันทึก Template ในเครื่องแล้ว');});
$('load').onclick=guard(async()=>{const p=await database('get',$('shelf').value);if(!p)throw Error('ยังไม่มี Template ที่บันทึก');snap();await restore(p);note('เปิด '+p.name);});
$('backup').onclick=()=>download(StudioExportName.filename(project,project.layers,'template.json'),new Blob([JSON.stringify(project)],{type:'application/json'}));
$('projectFile').onchange=guard(async e=>{const f=e.target.files[0];if(!f)return;const p=validateProject(JSON.parse(await f.text()));snap();await restore(p);note('เปิดโปรเจกต์แล้ว');});
let printingFile=false;
async function printFile(action){
  if(printingFile||busy)return;
  printingFile=true;
  const main=document.querySelector('main'),header=document.querySelector('header');
  main.inert=true;header.inert=true;
  $('printStatus').textContent='กำลังเตรียมไฟล์ส่งออก…';
  try{const message=await action();$('printStatus').textContent=message;note(message);}
  catch(e){$('printStatus').textContent=e.message;note(e.message);}
  finally{main.inert=false;header.inert=false;printingFile=false;}
}
$('outlineMode').onchange=()=>{project.outlineMode=$('outlineMode').value;$('mode').value='print';paint();};
for(const format of ['svg','png','jpg'])$(format).onclick=()=>printFile(async()=>{
  const print=StudioPrint.session(),root=await print.prepare(svgSource(),format);
  const blob=format==='svg'?new Blob([StudioPrint.serial(root)],{type:'image/svg+xml;charset=utf-8'}):await StudioPrint.raster(root,project.width,project.height,format);
  download(StudioExportName.filename(project,project.layers,format),blob);
  return 'ส่งออก '+format.toUpperCase()+(format==='svg'?' · Outline':' · 600 dpi')+print.detail();
});
$('pdf').onclick=()=>printFile(()=>pdfRows([null]));
$('batch').onclick=()=>printFile(()=>pdfRows(parseTable($('rows').value)));
button($('save').parentElement,'สร้างสำเนา',()=>{snap();project.id=uid();project.name+=' (สำเนา)';render();note('กดบันทึกเพื่อเก็บเป็น Template ใหม่');});
render();refreshShelf().catch(()=>{});note('เริ่มจากวางภาพฉลาก หรือเพิ่มข้อความเพื่อสร้างแบบเอง');
