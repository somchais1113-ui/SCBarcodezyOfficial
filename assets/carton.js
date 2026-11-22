'use strict';
const $=id=>document.getElementById(id), ns='http://www.w3.org/2000/svg';
const assets=[],items=[], names=['หน้า','ขวา','หลัง','ซ้าย'];
let active=-1,face=0,zoom=1,mag=1,yaw=-.55,pitch=.36,g=null,moving=null;
const num=id=>Number($(id).value), fmt=n=>Number(n.toFixed(2));
function field(group,id,label,value,min,max,optional=false){
  const wrap=document.createElement('label'),input=document.createElement('input');
  wrap.textContent=label;input.type='number';Object.assign(input,{id,min,max,step:'any',value,required:!optional});
  wrap.append(input);$(group).append(wrap);return input;
}
for(const [id,label,v] of [['len','ยาว (มม.)',400],['wid','กว้าง (มม.)',300],['hei','สูง (มม.)',250]])field('dims',id,label,v,1,2500);
for(const [id,label,v,min,max,opt] of [['thick','หนากระดาษ',3,.1,20],['glue','ลิ้นกาว',35,5,150],['slot','ร่องผ่า',6,.1,30],['depth','ฝาลึก', '',1,2000,true],['band','กว้างเทป',48,1,200]]){
  const e=field('spec',id,label,v,min,max,opt);if(opt)e.placeholder='อัตโนมัติ';
}
for(const [id,label,min] of [['ix','X (มม.)',0],['iy','Y (มม.)',0],['iw','กว้าง (มม.)',.1]])field('placement',id,label,0,min,9999);
function geometry(){
  const adj=({inner:1,outer:-1})[$('basis').value]||0;
  const l=num('len')+adj*num('thick'),w=num('wid')+adj*num('thick'),h=num('hei')+adj*num('thick');
  const f=$('depth').value===''?w/2:num('depth'),top=$('type').value==='open'?0:f;
  const tab=num('glue'),s=num('slot')/2,widths=[l,w,l,w],edges=[tab];
  widths.forEach(v=>edges.push(edges.at(-1)+v));
  if([...document.querySelectorAll('#dims input,#spec input')].some(e=>!e.validity.valid)||l<w||Math.min(l,w,h)<=2*s||tab>=l||edges[4]>5000||top+h+f>5000)throw Error('ตรวจขนาดและร่องผ่า: ด้านยาวต้องไม่น้อยกว่าด้านกว้าง ลิ้นกาวต้องแคบกว่าด้านยาว และแบบคลี่ไม่เกิน 5,000 มม.');
  const bottom=top+h,height=bottom+f,perim=[],fold=[];
  function flaps(y,depth,reverse){
    for(let k=0;k<4;k++){
      const i=reverse?3-k:k,a=edges[i]+(i?s:0),b=edges[i+1]-(i<3?s:0),start=reverse?b:a,end=reverse?a:b;
      perim.push([start,y]);if(depth){perim.push([start,y+depth],[end,y+depth]);fold.push('M'+a+' '+y+'H'+b);}perim.push([end,y]);
    }
  }
  flaps(top,-top,false);flaps(bottom,f,true);
  const bevel=Math.min(h*.18,tab*.35);
  perim.push([0,bottom-bevel],[0,top+bevel]);
  edges.slice(0,4).forEach(x=>fold.push('M'+x+' '+top+'V'+bottom));
  return {l,w,h,f,top,tab,s,height,bottom,edges,widths,width:edges[4],cut:'M'+perim.map(p=>p.join(' ')).join('L')+'Z',fold:fold.join('')};
}
function node(tag,attrs={},parent){
 const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);
 if(parent)parent.append(el);return el;
}
function partBox(i,part){
 const x=g.edges[i],w=g.widths[i],left=i?g.s:0,right=i<3?g.s:0;
 return part==='wall'?{x,y:g.top,w,h:g.h}:{x:x+left,y:part==='top'?0:g.bottom,w:w-left-right,h:part==='top'?g.top:g.f};
}
function constrain(o){
 const b=partBox(o.i,o.part),a=assets[o.asset];if(!b.h)return;
 o.w=Math.min(o.w,b.w,b.h*a.ratio);o.x=Math.max(0,Math.min(b.w-o.w,o.x));o.y=Math.max(0,Math.min(b.h-o.w/a.ratio,o.y));
}
function visibleItems(){return items.filter(o=>partBox(o.i,o.part).h>0);}
function drawing(el,edit,lines){
 el.replaceChildren();el.setAttribute('viewBox',[0,0,g.width,g.height].join(' '));
 if(edit)node('path',{d:g.cut,fill:'#f2dfbf'},el);
 if(edit)for(let i=0;i<4;i++)for(const part of ['wall','top','bottom']){
  const b=partBox(i,part);if(!b.h)continue;
  node('rect',{x:b.x,y:b.y,width:b.w,height:b.h,fill:i===face&&part==='wall'?'#e6cba3':'transparent','data-side':i},el);
  if(part==='wall'){const t=node('text',{x:b.x+b.w/2,y:b.y+b.h*.91,'text-anchor':'middle','font-size':Math.min(b.h*.08,b.w*.065),fill:'#866d50','pointer-events':'none'},el);t.textContent=names[i]+' · '+fmt(b.w)+' × '+fmt(b.h);}
 }
 for(const o of visibleItems()){
  const b=partBox(o.i,o.part),a=assets[o.asset],x=b.x+o.x,y=b.y+o.y,h=o.w/a.ratio;
  node('image',{x,y,width:o.w,height:h,href:edit&&inkMode()!=='original'?CartonInk.preview(a,inkMode()).url:a.url,'data-item':items.indexOf(o)},el);
  if(edit&&items[active]===o)node('rect',{x,y,width:o.w,height:h,fill:'none',stroke:'#245ac9','stroke-width':g.width*.0014,'pointer-events':'none'},el);
 }
 if(lines){node('path',{d:g.cut,fill:'none',stroke:'#ae3457','stroke-width':.25},el);node('path',{d:g.fold,fill:'none',stroke:'#3269b2','stroke-width':.25,'stroke-dasharray':'4 2'},el);}
}
function controls(){
 const o=items[active];$('item').hidden=!items.length;
 $('objects').replaceChildren(...items.map((e,i)=>new Option(assets[e.asset].name+' · '+names[e.i]+({wall:'',top:' · ฝาบน',bottom:' · ฝาล่าง'})[e.part],i)));
 $('objects').value=active;
 const asset=o&&assets[o.asset];$('ppi').textContent=asset?.native?(asset.ppi?'ภาพใน PDF ประมาณ '+Math.round(asset.ppi*asset.mmWidth/o.w)+' ppi ณ ขนาดที่วาง':'PDF ต้นฉบับ · คงวัตถุและทรัพยากรเมื่อส่ง PDF'):'';
 if(o){$('ix').value=fmt(o.x);$('iy').value=fmt(o.y);$('iw').value=fmt(o.w);}
}
function redraw(){
 try{g=geometry();}catch(e){g=null;$('check').textContent=e.message;$('flat').replaceChildren();$('sheet').textContent='';render3();for(const id of ['svg','pdf','jpeg'])$(id).disabled=true;return;}
 items.forEach(constrain);drawing($('flat'),true,true);controls();render3();
 const gap=g.w-2*g.f,innerOverlap=2*g.f-g.l;
 $('sheet').textContent=fmt(g.width)+' × '+fmt(g.height)+' มม.';
 $('check').textContent=(Math.abs(gap)<.01?'ฝาคู่นอกชนกลางตามระยะเส้นพับ':gap>0?'ระยะห่างปลายฝา '+fmt(gap)+' มม.':'ฝาคู่นอกเกยกัน '+fmt(-gap)+' มม.')+(innerOverlap>.01?' · ฝาคู่ในซ้อน '+fmt(innerOverlap)+' มม.':'')+' · '+($('basis').value==='crease'?'ใช้ระยะเส้นพับที่กรอก':'แบบร่างตามขนาดที่กรอก')+' · ตรวจระยะเผื่อกับซัพฯ ก่อนผลิต';
 const printable=visibleItems().length>0||(inkMode()==='original'&&$('lines').checked);
 for(const id of ['svg','pdf'])$(id).disabled=!printable;
 $('jpeg').disabled=false;
 if(!printable)$('check').textContent+=' · วางกราฟิกบนแบบคลี่เพื่อส่งไฟล์พิมพ์';
}
function scaleFlat(n){zoom=Math.max(1,Math.min(8,n));$('flat').style.width=100*zoom+'%';$('flat').style.height=$('scroll').clientHeight*zoom+'px';$('zoom').value=Math.round(zoom*100)+'%';}
$('plus').onclick=()=>scaleFlat(zoom*1.25);$('minus').onclick=()=>scaleFlat(zoom/1.25);$('fit').onclick=()=>scaleFlat(1);
new ResizeObserver(()=>scaleFlat(zoom)).observe($('scroll'));
function coord(e){return new DOMPoint(e.clientX,e.clientY).matrixTransform($('flat').getScreenCTM().inverse());}
function at(p){
 const i=g.edges.findIndex((x,k)=>k<4&&p.x>=x&&p.x<g.edges[k+1]);if(i<0)return null;
 const part=p.y<g.top?'top':p.y>=g.bottom?'bottom':'wall',b=partBox(i,part);
 return p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h&&b.h?{i,part,b}:null;
}
function place(asset,target,p){
 if(!g||!target)return;
 const {i,part,b}=target,w=assets[asset].mmWidth||Math.min(b.w*.4,b.h*assets[asset].ratio*.6);
 if(assets[asset].mmWidth&&(w>b.w+.001||w/assets[asset].ratio>b.h+.001))$('status').textContent='ชิ้นงานใหญ่กว่าแผง ระบบย่อให้พอดี ตรวจขนาดก่อนส่งผลิต';
 items.push({asset,i,part,w,x:(p?p.x-b.x:b.w/2)-w/2,y:(p?p.y-b.y:b.h/2)-w/assets[asset].ratio/2});active=items.length-1;face=i;redraw();
}
$('flat').onpointerdown=e=>{if(!g)return;const idx=e.target.getAttribute('data-item'),p=coord(e);
 if(idx!==null){active=Number(idx);const o=items[active],b=partBox(o.i,o.part);moving={dx:p.x-b.x-o.x,dy:p.y-b.y-o.y};$('flat').setPointerCapture(e.pointerId);face=o.i;}else{const hit=at(p);if(hit)face=hit.i;}redraw();};
$('flat').onpointermove=e=>{if(!moving||!g)return;const p=coord(e),hit=at(p);if(!hit)return;Object.assign(items[active],{i:hit.i,part:hit.part,x:p.x-hit.b.x-moving.dx,y:p.y-hit.b.y-moving.dy});face=hit.i;redraw();};
$('flat').onpointerup=$('flat').onpointercancel=()=>moving=null;
$('flat').ondragover=e=>e.preventDefault();
$('flat').ondrop=e=>{e.preventDefault();const id=e.dataTransfer.getData('carton-asset');if(g&&id!==''&&assets[Number(id)]){const p=coord(e);place(Number(id),at(p),p);}};
function registerAsset(asset){
 const id=assets.push(asset)-1,btn=document.createElement('button');btn.className='tile';btn.draggable=true;
 asset.img.draggable=false;btn.append(asset.img,document.createTextNode(asset.name));
 btn.ondragstart=e=>e.dataTransfer.setData('carton-asset',id);
 btn.onclick=()=>{if(g)place(id,{i:face,part:'wall',b:partBox(face,'wall')});};$('library').append(btn);
}
$('files').onchange=async e=>{
 for(const file of Array.from(e.target.files)){try{
 if(/\.pdf$/i.test(file.name)||file.type==="application/pdf"){await CartonPDF.open(file);continue;}
 let url=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file);});
 const img=new Image();img.src=url;await img.decode();if(!img.naturalWidth||!img.naturalHeight)throw Error();
 if(JpegOrientation.fromDataURL(url)>1)url=JpegOrientation.uprightPNG(img);
 registerAsset({url,img,vector:file.type==='image/svg+xml'?portableVector(await file.text()):null,name:file.name,ratio:img.naturalWidth/img.naturalHeight});$('status').textContent='ลากภาพลงบนแผง หรือคลิกภาพเพื่อวาง';
 }catch{$('status').textContent='เปิดภาพ '+file.name+' ไม่สำเร็จ';}}e.target.value='';
};
$('objects').onchange=e=>{active=Number(e.target.value);face=items[active].i;redraw();};
$('remove').onclick=()=>{items.splice(active,1);active=items.length-1;redraw();};
for(const [id,k] of [['ix','x'],['iy','y'],['iw','w']])$(id).onchange=()=>{if($(id).validity.valid)items[active][k]=num(id);redraw();};
$('lines').addEventListener('change',redraw);
document.querySelectorAll('#dims input,#spec input,#type,#basis,#tape').forEach(e=>e.addEventListener('input',redraw));
const canvas=$('model');
let hitFaces=[],turnStart=null;
function render3(target=canvas){
 if(target===canvas)hitFaces=[];
 const ctx=target.getContext('2d'),W=target.width,H=target.height;
 ctx.fillStyle='#edf1f5';ctx.fillRect(0,0,W,H);if(!g)return;
 const {l,w,h,f}=g,scale=Math.min(W,H)*.83*mag/Math.hypot(l,w,h);
 const ca=Math.cos(yaw),sa=Math.sin(yaw),cb=Math.cos(pitch),sb=Math.sin(pitch);
 function project(x,y,z){
  const depth=z*ca-x*sa;
  return [W/2+(x*ca+z*sa)*scale,H/2+(y*cb+depth*sb)*scale,depth*cb-y*sb];
 }
 const corners=[[-l/2,w/2],[l/2,w/2],[l/2,-w/2],[-l/2,-w/2]],surfaces=[];
 for(let i=0;i<4;i++){
  const a=corners[i],b=corners[(i+1)%4],width=g.widths[i],ux=(b[0]-a[0])/width,uz=(b[1]-a[1])/width;
  for(const part of ['wall','top','bottom']){
   const box=partBox(i,part);if(!box.h)continue;
   function point(u,v){
    const s=u+box.x-g.edges[i],d=part==='wall'?0:part==='top'?f-v:v;
    const inset=part!=='wall'&&i%2?Math.min(h*.01,1):0;
    const y=part==='wall'?v-h/2:part==='top'?-h/2+inset:h/2-inset;
    return project(a[0]+ux*s+uz*d,y,a[1]+uz*s-ux*d);
   }
   const p=point(0,0),q=point(box.w,0),r=point(0,box.h),v=point(box.w,box.h);
   const facing=(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
   if(Math.abs(facing)<.01)continue;
   const exterior=facing>0;
   if(!exterior&&g.top&&Math.abs(g.w-2*f)<.01)continue;
   surfaces.push({i,part,box,p,q,r,v,exterior,depth:(p[2]+v[2])/2});
  }
 }
 // Draw interior first. At each lid the short flaps fold beneath the long flaps.
 surfaces.sort((a,b)=>Number(a.exterior)-Number(b.exterior)||(
   a.part===b.part&&a.part!=='wall'?(a.exterior?1:-1)*(b.i%2-a.i%2):0)||a.depth-b.depth);
 for(const {i,part,box,p,q,r,v,exterior} of surfaces){
  if(target===canvas&&exterior)hitFaces.push({i,points:[p,q,v,r]});
  ctx.save();ctx.setTransform((q[0]-p[0])/box.w,(q[1]-p[1])/box.w,(r[0]-p[0])/box.h,(r[1]-p[1])/box.h,p[0],p[1]);
  ctx.fillStyle=!exterior?'#ae8c60':part==='top'?'#ddc59e':part==='bottom'?'#b99b70':['#d3b488','#c09d70','#c7a67a','#ba986c'][i];ctx.fillRect(0,0,box.w,box.h);
  ctx.strokeStyle='#957955';ctx.lineWidth=.8;ctx.strokeRect(0,0,box.w,box.h);
  if(exterior){
   for(const o of items.filter(o=>o.i===i&&o.part===part)){const a=assets[o.asset];ctx.drawImage(inkMode()==='original'?a.img:CartonInk.preview(a,inkMode()).canvas,o.x,o.y,o.w,o.w/a.ratio);}
   if($('tape').checked&&part!=='wall'&&i%2===0&&Math.abs(g.w-2*f)<.01){const band=Math.min(num('band')/2,f);ctx.fillStyle='rgba(177,149,96,.48)';ctx.fillRect(0,part==='top'?0:f-band,box.w,band);}
  }
  ctx.restore();
 }
}
let turn=null;
canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);turnStart=turn=[e.clientX,e.clientY];};
canvas.onpointermove=e=>{if(!turn)return;yaw+=(e.clientX-turn[0])*.012;pitch=Math.max(-1.55,Math.min(1.55,pitch+(e.clientY-turn[1])*.012));turn=[e.clientX,e.clientY];render3();};
canvas.onpointercancel=()=>turn=null;
canvas.onpointerup=e=>{
 if(turn&&Math.hypot(e.clientX-turnStart[0],e.clientY-turnStart[1])<4){
  const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)*canvas.width/rect.width,y=(e.clientY-rect.top)*canvas.height/rect.height;
  const hit=[...hitFaces].reverse().find(({points})=>points.every(([a,b],k)=>{const [c,d]=points[(k+1)%4];return (c-a)*(y-b)-(d-b)*(x-a)>=0;}));
  if(hit){face=hit.i;redraw();}
 }
 turn=null;
};
canvas.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();yaw+=(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)*.13;pitch=Math.max(-1.55,Math.min(1.55,pitch+(e.key==='ArrowUp'?.13:e.key==='ArrowDown'?-.13:0)));render3();};
function scale3(n){mag=Math.max(.5,Math.min(3,n));$('mag').value=Math.round(mag*100)+'%';render3();}
$('sm').onclick=()=>scale3(mag/1.25);$('lg').onclick=()=>scale3(mag*1.25);
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
// Preserve basic vector artwork in the PDF without mounting active content from imported files.
function portableVector(data){
 const doc=new DOMParser().parseFromString(data,'image/svg+xml'),root=doc.documentElement;
 if(root.localName!=='svg'||!root.getAttribute('viewBox'))return null;
 const tags=new Set(['svg','g','path','rect','line','ellipse','circle','polygon','polyline']);
 const attrs=new Set('viewBox width height fill stroke stroke-linecap stroke-linejoin stroke-width stroke-miterlimit fill-rule fill-opacity stroke-opacity opacity x y x1 x2 y1 y2 cx cy r rx ry d points transform preserveAspectRatio xmlns version'.split(' '));
 for(const el of [root,...root.querySelectorAll('*')]){
  if(!tags.has(el.localName)||el.namespaceURI!==ns||Array.from(el.attributes).some(a=>!attrs.has(a.name)||/url\s*\(/i.test(a.value)))return null;
 }
 return root;
}
$('addCode').onclick=async()=>{
 if(!g)return;
 const digits=$('code').value.trim();
 if(!isValidGtin(digits,14)){$('status').textContent='กรุณาตรวจเลข ITF-14 และหลักตรวจสอบ';return;}
 const bars=encodeITF14Rects(digits,{x:12,y:4,height:28,width:100}).replaceAll('class="black"','fill="black"');
 // Keep human-readable digits portable by using the application's shipped outline font.
 const font=opentype.parse(Uint8Array.from(atob(labelFonts.PraJad),c=>c.charCodeAt(0)).buffer);
 const path=font.getPath(digits,0,0,8),bounds=path.getBoundingBox(),offset=(124-bounds.x2-bounds.x1)/2;
 const data='<svg xmlns="'+ns+'" viewBox="0 0 124 45" width="124" height="45"><rect width="124" height="45" fill="white"/><rect x="2" y="2" width="120" height="32" fill="none" stroke="black" stroke-width="2"/>'+bars+'<path transform="translate('+offset+' 42)" d="'+path.toPathData(4)+'"/></svg>';
 const img=new Image(),url='data:image/svg+xml;base64,'+btoa(data);img.src=url;await img.decode();
 const id=assets.length;assets.push({name:digits,url,img,barcode:true,vector:portableVector(data),ratio:124/45});
 place(id,{i:face,part:'wall',b:partBox(face,'wall')});
};
function inkMode(){return $('inkMode').value;}
let includeOriginalLines=$('lines').checked;
$('inkMode').onchange=()=>{
 const mono=inkMode()!=='original',lines=$('lines');
 if(!lines.disabled)includeOriginalLines=lines.checked;
 lines.disabled=mono;lines.checked=mono?false:includeOriginalLines;
 $('inkHint').textContent=mono?'สีขาวเว้นเนื้อกระดาษ · ส่งออกเฉพาะงานพิมพ์ เส้นโครงสร้างดูได้บนแบบคลี่'+(inkMode()==='blue'?' · ชื่อเพลต Carton Blue':''):'';
 redraw();
};
async function output(kind){
 if(!g||$(kind).disabled)throw Error('ตรวจขนาดกล่องและวางกราฟิกก่อนส่งไฟล์พิมพ์');
 const name='Carton_'+[g.l,g.w,g.h].map(fmt).join('x'),el=node('svg',{xmlns:ns,width:g.width+'mm',height:g.height+'mm'});
 const ink=inkMode(),mono=ink!=='original';
 drawing(el,false,!mono&&$('lines').checked);
 if(mono&&kind==='pdf'){
  const bytes=await CartonInk.pdf(el,g.width,g.height,items,assets,ink);
  download(new Blob([bytes],{type:'application/pdf'}),name+'_'+ink+'.pdf');return;
 }
 if(kind==='svg'){
  for(const im of el.querySelectorAll('image')){
   const asset=assets[items[Number(im.getAttribute('data-item'))].asset];
   if(mono&&asset.barcode){
    const symbol=asset.vector.cloneNode(true),color=ink==='black'?'#000000':'#1b4189';
    symbol.querySelector('rect[fill="white"]').remove();symbol.setAttribute('fill',color);
    for(const el of symbol.querySelectorAll('[fill="black"]'))el.setAttribute('fill',color);
    for(const el of symbol.querySelectorAll('[stroke="black"]'))el.setAttribute('stroke',color);
    for(const k of ['x','y','width','height'])symbol.setAttribute(k,im.getAttribute(k));im.replaceWith(symbol);
   }else if(mono)im.setAttribute('href',await CartonInk.svg(asset,+im.getAttribute('width'),ink));
   else if(asset.native)im.setAttribute('href',await CartonPDF.svgBitmap(asset,+im.getAttribute('width')));
  }
  download(new Blob([new XMLSerializer().serializeToString(el)],{type:'image/svg+xml'}),name+'.svg');}
 else if(kind==='jpeg'){const c=document.createElement('canvas');c.width=2400;c.height=1200;render3(c);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.95));download(blob,name+'_preview.jpg');}
 else{
  const width=g.width,height=g.height;
  // PDF image support varies by reader. Embed SVG logos as transparent PNG at their placed size.
  for(const im of el.querySelectorAll('image')){
   const asset=assets[items[Number(im.getAttribute('data-item'))].asset];
   if(asset.vector){
    const nested=document.importNode(asset.vector,true);
    for(const key of ['x','y','width','height'])nested.setAttribute(key,im.getAttribute(key));
    im.replaceWith(nested);continue;
   }
   if(/^data:image\/svg/i.test(asset.url)){
    const c=document.createElement('canvas'),ratio=Math.min(600/25.4,8192/Math.max(+im.getAttribute('width'),+im.getAttribute('height')));
    c.width=Math.ceil(+im.getAttribute('width')*ratio);c.height=Math.ceil(+im.getAttribute('height')*ratio);
    c.getContext('2d').drawImage(asset.img,0,0,c.width,c.height);im.setAttribute('href',c.toDataURL('image/png'));
   }
  }
  if(visibleItems().some(o=>assets[o.asset].native)){
   const bytes=await CartonPDF.compose(el,width,height,items,assets);
   download(new Blob([bytes],{type:'application/pdf'}),name+'.pdf');return;
  }
  const pdf=new window.jspdf.jsPDF({unit:'mm',format:[width,height],orientation:width>=height?'landscape':'portrait',compress:true});
  el.style.cssText='position:absolute;left:-99999px;top:0';document.body.append(el);
  try{await pdf.svg(el,{x:0,y:0,width,height});pdf.save(name+'.pdf');}finally{el.remove();}
 }
}
for(const kind of ['svg','pdf','jpeg'])$(kind).onclick=async()=>{try{await output(kind);$('status').textContent='ส่งออก '+kind.toUpperCase()+' แล้ว';}catch(e){$('status').textContent='ส่งออกไม่สำเร็จ · '+e.message;}};
$('pickPdf').onclick=()=>$('pdfFile').click();
$('pdfFile').onchange=async e=>{const file=e.target.files[0];if(file)try{await CartonPDF.open(file);}catch(error){$('status').textContent=error.message;}e.target.value='';};
redraw();scale3(1);scaleFlat(1);
