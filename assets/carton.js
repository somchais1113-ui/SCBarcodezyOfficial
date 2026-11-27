'use strict';
const $=id=>document.getElementById(id), ns='http://www.w3.org/2000/svg';
const assets=[],items=[], names=['หน้า','ขวา','หลัง','ซ้าย'];
let active=-1,face=0,zoom=1,mag=1,yaw=-.55,pitch=.36,g=null,moving=null,autoSizeItem=null,groupSerial=0,clipboardItem=null,extraSelected=new Set();
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
for(const [id,label,min] of [['ix','X (มม.)',0],['iy','Y (มม.)',0],['iw','W (มม.)',.1],['ih','H (มม.)',.1]])field('placement',id,label,0,min,9999);
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
function syncAutoSize(){
 const value=['len','wid','hei'].map(id=>fmt(num(id))).join('x');
 if(!autoSizeItem){const a=CartonStandard.asset('size',value);autoSizeItem={asset:assets.push(a)-1,i:0,part:'bottom',locked:true};items.push(autoSizeItem);}
 else if(assets[autoSizeItem.asset].value!==value)assets[autoSizeItem.asset]=CartonStandard.asset('size',value);
 const b=partBox(0,'bottom'),a=assets[autoSizeItem.asset],w=Math.min(156,b.w*.78,b.h*.78*a.ratio,b.w,b.h*a.ratio);
 Object.assign(autoSizeItem,{w,x:(b.w-w)/2,y:(b.h-w/a.ratio)/2});
}
function constrain(o){
 const b=partBox(o.i,o.part),a=assets[o.asset];if(!b.h)return;
 o.w=Math.min(o.w,b.w,b.h*a.ratio);o.x=Math.max(0,Math.min(b.w-o.w,o.x));o.y=Math.max(0,Math.min(b.h-o.w/a.ratio,o.y));
}
function visibleItems(){return items.filter(o=>partBox(o.i,o.part).h>0).sort((a,b)=>Number(!!a.locked)-Number(!!b.locked));}
function drawing(el,edit,lines){
 el.replaceChildren();const pad=edit?Math.max(5,g.width*.018):0;el.setAttribute('viewBox',[-pad,-pad,g.width+2*pad,g.height+2*pad].join(' '));
 if(edit)node('path',{d:g.cut,fill:'#f2dfbf'},el);
 if(edit)for(let i=0;i<4;i++)for(const part of ['wall','top','bottom']){
  const b=partBox(i,part);if(!b.h)continue;
  node('rect',{x:b.x,y:b.y,width:b.w,height:b.h,fill:i===face&&part==='wall'?'#e6cba3':'transparent','data-side':i},el);
  if(edit&&$('showSafe').checked){const m=safeInset(b);if(m>0)node('rect',{x:b.x+m,y:b.y+m,width:b.w-2*m,height:b.h-2*m,fill:'none',stroke:'#169678','stroke-width':1,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke','pointer-events':'none','data-guide':'safe'},el);}
  if(part==='wall'&&$('showDims').checked){const t=node('text',{x:b.x+b.w/2,y:b.y+b.h*.91,'text-anchor':'middle','font-size':Math.min(b.h*.08,b.w*.065),fill:'#866d50','pointer-events':'none'},el);t.textContent=names[i]+' · '+fmt(b.w)+' × '+fmt(b.h);}
 }
 for(const o of visibleItems()){
  const b=partBox(o.i,o.part),a=assets[o.asset],x=b.x+o.x,y=b.y+o.y,h=o.w/a.ratio;
  node('image',{x,y,width:o.w,height:h,href:edit&&inkMode()!=='original'&&a.img.complete&&a.img.naturalWidth?inkPreview(a).url:a.url,'data-item':items.indexOf(o),...(o.locked?{'data-locked':'true'}:{})},el);
 
 }
 if(lines){node('path',{d:g.cut,fill:'none',stroke:'#ae3457','stroke-width':.25},el);node('path',{d:g.fold,fill:'none',stroke:'#3269b2','stroke-width':.25,'stroke-dasharray':'4 2'},el);}
 if(edit&&selectedObjects().length>1){for(const o of selectedObjects()){const b=partBox(o.i,o.part);node('rect',{x:b.x+o.x,y:b.y+o.y,width:o.w,height:o.w/assets[o.asset].ratio,fill:'none',stroke:'#245ac9','stroke-width':1.5,'vector-effect':'non-scaling-stroke','pointer-events':'none','data-multi':'true'},el);}}
 if(edit&&selectedObjects().length===1&&items[active]&&!items[active].locked&&visibleItems().includes(items[active])){
  const o=items[active],a=assets[o.asset],b=partBox(o.i,o.part),x=b.x+o.x,y=b.y+o.y,w=o.w,h=w/a.ratio;
  const ctm=el.getScreenCTM(),unit=ctm?1/Math.hypot(ctm.a,ctm.b):g.width/1000,r=4.5*unit;
  const overlay=node('g',{'data-selection':'true'},el);node('rect',{x,y,width:w,height:h,fill:'none',stroke:'#245ac9','stroke-width':1.5,'vector-effect':'non-scaling-stroke','pointer-events':'none'},overlay);
  for(const [k,u,v] of [['nw',0,0],['n',.5,0],['ne',1,0],['w',0,.5],['e',1,.5],['sw',0,1],['s',.5,1],['se',1,1]]){
   // Offset edge handles when artwork is too small to keep all targets usable.
   const hx=x+u*w+(u===0?-r:u===1?r:0),hy=y+v*h+(v===0?-r:v===1?r:0);
   node('rect',{x:hx-r,y:hy-r,width:2*r,height:2*r,rx:unit,fill:'white',stroke:'#245ac9','stroke-width':1.2,'vector-effect':'non-scaling-stroke','data-resize':k},overlay);
  }
  if(moving?.resize){const t=node('text',{x:x+w/2,y:y-14*unit,'text-anchor':'middle','font-size':12*unit,fill:'#174a96',stroke:'white','stroke-width':3*unit,'paint-order':'stroke','pointer-events':'none'},overlay);t.textContent=fmt(w)+' × '+fmt(h)+' mm';}
 }

}
function controls(){
 const o=items[active];$('item').hidden=!o||o.locked;
 $('objects').replaceChildren(...items.flatMap((e,i)=>e.locked?[]:[new Option(assets[e.asset].name+' · '+names[e.i]+({wall:'',top:' · ฝาบน',bottom:' · ฝาล่าง'})[e.part],i)]));
 $('objects').value=active;
 const asset=o&&assets[o.asset];$('selectionHint').textContent=o&&!o.locked?'Selected: '+asset.name:'เลือกองค์ประกอบบนแบบคลี่เพื่อแก้ไข';$('ppi').textContent=asset?.native?(asset.ppi?'ภาพใน PDF ประมาณ '+Math.round(asset.ppi*asset.mmWidth/o.w)+' ppi ณ ขนาดที่วาง':'PDF ต้นฉบับ · คงวัตถุและทรัพยากรเมื่อส่ง PDF'):'';
 if(o&&!o.locked){$('ix').value=fmt(o.x);$('iy').value=fmt(o.y);$('iw').value=fmt(o.w);$('ih').value=fmt(o.w/asset.ratio);$('elementSize').textContent=fmt(o.w)+' × '+fmt(o.w/asset.ratio)+' mm';}
 if(selectedObjects().length>1){$('item').hidden=true;$('selectionHint').textContent=selectedObjects().length+' Objects Selected · ใช้ Toolbar';}
 updateAdvanced();CartonText.sync();
 const standard=asset?.standard; $('standardOptions').hidden=!standard||standard==='size';$('countryOption').hidden=standard!=='dhas';$('stackOption').hidden=!['stack','set'].includes(standard);$('setGapOption').hidden=standard!=='set';$('ungroupStandard').hidden=standard!=='set';$('groupStandard').hidden=!o?.groupId||!['stack','dry','up'].includes(standard);
 if(standard==='set'){const v=asset.value; if(document.activeElement!==$('stackCount'))$('stackCount').value=v.count;if(document.activeElement!==$('setGap'))$('setGap').value=fmt(v.gap*symbolSize(o,asset));}
 if(standard==='dhas'&&document.activeElement!==$('originCountry')&&document.activeElement!==$('countrySelect')){const sel=$('countrySelect'),known=[...sel.options].some(v=>v.value===asset.value);sel.value=known?asset.value:'CUSTOM';$('originCountry').hidden=known;$('originCountry').value=asset.value;}
 if(standard==='stack'&&document.activeElement!==$('stackCount'))$('stackCount').value=asset.value;
}
function redraw(){
 try{g=geometry();}catch(e){g=null;$('check').textContent=e.message;$('flat').replaceChildren();$('sheet').textContent='';$('toolbarDims').textContent='ตรวจขนาดกล่อง';render3();for(const id of ['svg','pdf','jpeg','package'])$(id).disabled=true;return;}
 syncAutoSize();items.forEach(constrain);drawing($('flat'),true,true);controls();render3();
 const gap=g.w-2*g.f,innerOverlap=2*g.f-g.l;
 $('toolbarDims').textContent=['len','wid','hei'].map(id=>fmt(num(id))).join(' × ')+' mm';$('sheet').textContent=fmt(g.width)+' × '+fmt(g.height)+' มม.';
 $('check').textContent=(Math.abs(gap)<.01?'ฝาคู่นอกชนกลางตามระยะเส้นพับ':gap>0?'ระยะห่างปลายฝา '+fmt(gap)+' มม.':'ฝาคู่นอกเกยกัน '+fmt(-gap)+' มม.')+(innerOverlap>.01?' · ฝาคู่ในซ้อน '+fmt(innerOverlap)+' มม.':'')+' · '+($('basis').value==='crease'?'ใช้ระยะเส้นพับที่กรอก':'แบบร่างตามขนาดที่กรอก')+' · ตรวจระยะเผื่อกับซัพฯ ก่อนผลิต';
 const printable=visibleItems().length>0||(inkMode()==='original'&&$('lines').checked);
 for(const id of ['svg','pdf','package'])$(id).disabled=!printable;
 updatePreflight();
 $('jpeg').disabled=false;
 if(!printable)$('check').textContent+=' · วางกราฟิกบนแบบคลี่เพื่อส่งไฟล์พิมพ์';
 const outside=visibleItems().filter(o=>!o.locked&&outsideSafe(o)).length;if(outside)$('check').textContent+=' · ⚠ '+outside+' องค์ประกอบอยู่นอก Safe Area';
 if(!moving)recordHistory();
}
function scaleFlat(n){zoom=Math.max(1,Math.min(8,n));$('flat').style.width=100*zoom+'%';$('flat').style.height=$('scroll').clientHeight*zoom+'px';$('zoom').value=Math.round(zoom*100)+'%';if(g)drawing($('flat'),true,true);}
$('plus').onclick=()=>scaleFlat(zoom*1.25);$('minus').onclick=()=>scaleFlat(zoom/1.25);$('fit').onclick=()=>{scaleFlat(1);$('scroll').scrollTo(0,0);};
 $('pan').onclick=()=>{const on=$('pan').getAttribute('aria-pressed')!=='true';$('pan').setAttribute('aria-pressed',String(on));$('flat').classList.toggle('pan-mode',on);};
new ResizeObserver(()=>scaleFlat(zoom)).observe($('scroll'));
function coord(e){return new DOMPoint(e.clientX,e.clientY).matrixTransform($('flat').getScreenCTM().inverse());}
function at(p){
 const i=g.edges.findIndex((x,k)=>k<4&&p.x>=x&&p.x<g.edges[k+1]);if(i<0)return null;
 const part=p.y<g.top?'top':p.y>=g.bottom?'bottom':'wall',b=partBox(i,part);
 return p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h&&b.h?{i,part,b}:null;
}
function place(asset,target,p){
 if(!g||!target)return;
 const {i,part,b}=target;
 $('acceptConversion').checked=false;
 if(assets[asset].standard){const a=assets[asset];asset=assets.push(CartonStandard.asset(a.standard,a.value,a.rotation))-1;}
 const a=assets[asset],defaultWidth=({stack:35,dry:35,up:35,care:110,dhas:90,set:115})[a.standard];
 const w=a.mmWidth||Math.min(defaultWidth||b.w*.4,b.h*a.ratio*.6);
 if(assets[asset].mmWidth&&(w>b.w+.001||w/assets[asset].ratio>b.h+.001))$('status').textContent='ชิ้นงานใหญ่กว่าแผง ระบบย่อให้พอดี ตรวจขนาดก่อนส่งผลิต';
 items.push({asset,i,part,w,x:(p?p.x-b.x:b.w/2)-w/2,y:(p?p.y-b.y:b.h/2)-w/assets[asset].ratio/2});active=items.length-1;extraSelected.clear();face=i;redraw();
}
$('flat').onpointerdown=e=>{if(!g||e.button!==0&&e.button!==1)return;
 const flat=$('flat'),scroll=$('scroll');if(isTextField(document.activeElement))document.activeElement.blur();
 if(e.button===1||$('pan').getAttribute('aria-pressed')==='true'){e.preventDefault();moving={pan:true,sx:e.clientX,sy:e.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};flat.setPointerCapture(e.pointerId);return;}
 const idx=e.target.getAttribute('data-item'),handle=e.target.getAttribute('data-resize'),p=coord(e);
 if(CartonText.pointerDown(e,idx))return;
 if(handle&&items[active]&&!items[active].locked){e.preventDefault();const o=items[active],b=partBox(o.i,o.part),a=assets[o.asset],h=o.w/a.ratio;moving={resize:handle,start:p,x:o.x,y:o.y,w:o.w,h,i:o.i,part:o.part};flat.setPointerCapture(e.pointerId);return;}
 if(idx!==null&&!items[Number(idx)].locked){e.preventDefault();const index=Number(idx),o=items[index];
 if(e.shiftKey){const selected=new Set(selectedObjects());if(selected.has(o))selected.delete(o);else selected.add(o);active=selected.has(o)?index:items.indexOf([...selected].at(-1));extraSelected=new Set([...selected].filter(v=>v!==items[active]));face=o.i;redraw();return;}
 if(!selectedObjects().includes(o)){extraSelected.clear();active=index;}else if(active!==index){extraSelected=new Set(selectedObjects().filter(v=>v!==o));active=index;}
 const b=partBox(o.i,o.part),sel=selectedObjects();moving=sel.length>1?{multi:sel.map(o=>({o,x:o.x,y:o.y})),start:p}:{dx:p.x-b.x-o.x,dy:p.y-b.y-o.y};flat.setPointerCapture(e.pointerId);face=o.i;
 }else{const hit=at(p);if(hit)face=hit.i;active=-1;extraSelected.clear();}redraw();};
$('flat').onpointermove=e=>{if(!moving||!g)return;
 if(moving.pan){$('scroll').scrollLeft=moving.left-(e.clientX-moving.sx);$('scroll').scrollTop=moving.top-(e.clientY-moving.sy);return;}
 const p=coord(e),o=items[active];if(!o)return;
 if(moving.multi){moveSet(moving.multi,p.x-moving.start.x,p.y-moving.start.y);redraw();return;}
 if(moving.resize){const m=moving,k=m.resize,b=partBox(m.i,m.part),dx=p.x-m.start.x,dy=p.y-m.start.y,ratio=m.w/m.h;
  const sx=k.includes('e')?1:k.includes('w')?-1:0,sy=k.includes('s')?1:k.includes('n')?-1:0;
  const anchorX=m.x+(sx>0?0:sx<0?m.w:m.w/2),anchorY=m.y+(sy>0?0:sy<0?m.h:m.h/2);
  const delta=sx&&sy?(sx*dx*m.w+sy*dy*m.h)/(m.w*m.w+m.h*m.h):sx?sx*dx/m.w:sy*dy/m.h;
  const maxW=sx>0?b.w-anchorX:sx<0?anchorX:2*Math.min(anchorX,b.w-anchorX),maxH=sy>0?b.h-anchorY:sy<0?anchorY:2*Math.min(anchorY,b.h-anchorY);
  const w=Math.max(.1,Math.min(m.w*(1+delta),maxW,maxH*ratio)),h=w/ratio;
  Object.assign(o,{w,x:anchorX-(sx>0?0:sx<0?w:w/2),y:anchorY-(sy>0?0:sy<0?h:h/2)});redraw();return;
 }
 const hit=at(p);if(!hit)return;Object.assign(o,{i:hit.i,part:hit.part,x:p.x-hit.b.x-moving.dx,y:p.y-hit.b.y-moving.dy});face=hit.i;redraw();};
$('flat').onpointerup=$('flat').onpointercancel=()=>{const resize=moving?.resize;moving=null;if(resize&&g)drawing($('flat'),true,true);if(g)recordHistory();};
$('flat').onlostpointercapture=()=>{moving=null;if(g)recordHistory();};
$('flat').ondragover=e=>e.preventDefault();
$('flat').ondrop=e=>{e.preventDefault();const id=e.dataTransfer.getData('carton-asset');if(g&&id!==''&&assets[Number(id)]){const p=coord(e);place(Number(id),at(p),p);}};
function registerAsset(asset,library='library'){
 const id=assets.push(asset)-1,btn=document.createElement('button');btn.className='tile';btn.draggable=true;
 asset.img.draggable=false;btn.append(asset.img,document.createTextNode(asset.name));if(library==='standardLibrary'&&['care','dhas','set'].includes(asset.standard))btn.classList.add('wide');
 if(asset.standard)btn.dataset.kind=asset.standard;
 btn.ondragstart=e=>e.dataTransfer.setData('carton-asset',id);
 btn.onclick=()=>{if(g)place(id,{i:face,part:'wall',b:partBox(face,'wall')});};$(library).append(btn);return id;
}
let uploadQueue=Promise.resolve();
 function queueFiles(files){const batch=Array.from(files);uploadQueue=uploadQueue.then(()=>importFiles(batch)).catch(e=>{$('status').textContent=e.message;});return uploadQueue;}
 async function importFiles(files){
 for(const file of files){try{
 if(!/\.(png|jpe?g|webp|svg|pdf)$/i.test(file.name)&&!['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf'].includes(file.type))throw Error('ไม่รองรับชนิดไฟล์');
 if(/\.pdf$/i.test(file.name)||file.type==="application/pdf"){await CartonPDF.open(file);continue;}
 let url=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file);});
 const img=new Image();img.src=url;await img.decode();if(!img.naturalWidth||!img.naturalHeight)throw Error();
 if(JpegOrientation.fromDataURL(url)>1)url=JpegOrientation.uprightPNG(img);
 registerAsset({url,img,vector:file.type==='image/svg+xml'||/\.svg$/i.test(file.name)?portableVector(await file.text()):null,name:file.name,ratio:img.naturalWidth/img.naturalHeight});$('status').textContent='ลากภาพลงบนแผง หรือคลิกภาพเพื่อวาง';
 }catch{$('status').textContent='เปิดไฟล์ '+file.name+' ไม่สำเร็จ หรือชนิดไฟล์ไม่รองรับ';}}
 }
 $('files').onchange=e=>{queueFiles(e.target.files);e.target.value='';};
 const drop=$('elementDrop');let dragDepth=0;
 drop.addEventListener('dragenter',e=>{if(!Array.from(e.dataTransfer.types).includes('Files'))return;e.preventDefault();dragDepth++;drop.classList.add('is-over');});
 drop.addEventListener('dragover',e=>{e.preventDefault();if(Array.from(e.dataTransfer.types).includes('Files'))e.dataTransfer.dropEffect='copy';});
 drop.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)drop.classList.remove('is-over');});
 drop.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();dragDepth=0;drop.classList.remove('is-over');queueFiles(e.dataTransfer.files);});
 function symbolSize(o,a){return a.rotation%180===0?o.w/(3+2*a.value.gap):o.w;}
 function updateStandard(value,rotation){
  const o=items[active],a=o&&assets[o.asset];if(!a?.standard||o.locked)return;
  const next=CartonStandard.asset(a.standard,value,rotation);const oldH=o.w/a.ratio;
  if((rotation-a.rotation)%180!==0){const cx=o.x+o.w/2,cy=o.y+oldH/2;o.w=oldH;o.x=cx-o.w/2;o.y=cy-o.w/next.ratio/2;}
  assets[o.asset]=next;redraw();
 }
 $('countrySelect').onchange=e=>{const a=assets[items[active].asset];$('originCountry').hidden=e.target.value!=='CUSTOM';if(e.target.value==='CUSTOM'){$('originCountry').value=a.value;$('originCountry').focus();}else{ $('originCountry').value=e.target.value;updateStandard(e.target.value,a.rotation);}};
 $('originCountry').onchange=e=>{const a=assets[items[active].asset],value=CartonStandard.country(e.target.value);if(!value){e.target.value=a.value;$('status').textContent='กรุณาระบุประเทศผู้ผลิตจริง';return;}e.target.value=value;updateStandard(value,a.rotation);};
 $('stackCount').onchange=e=>{const a=assets[items[active].asset];if(e.target.validity.valid&&e.target.value!=='')updateStandard(a.standard==='set'?{...a.value,count:String(Number(e.target.value))}:String(Number(e.target.value)),a.rotation);else e.target.value=a.standard==='set'?a.value.count:a.value;};
 $('rotateStandard').onclick=()=>{const a=assets[items[active].asset];updateStandard(a.value,(a.rotation+90)%360);};
 $('duplicateStandard').onclick=()=>{const o=items[active],a=assets[o.asset];if(!a?.standard||o.locked)return;items.push({...o,groupId:undefined,asset:assets.push(CartonStandard.asset(a.standard,a.value,a.rotation))-1,x:o.x+5,y:o.y+5});active=items.length-1;extraSelected.clear();redraw();};

$('setGap').onchange=()=>{const o=items[active],a=o&&assets[o.asset];if(a?.standard!=='set'||!$('setGap').validity.valid)return;const unit=symbolSize(o,a),gap=num('setGap')/unit,oldH=o.w/a.ratio,cx=o.x+o.w/2,cy=o.y+oldH/2;assets[o.asset]=CartonStandard.asset('set',{...a.value,gap},a.rotation);o.w=a.rotation%180===0?unit*(3+2*gap):unit;o.x=cx-o.w/2;o.y=cy-o.w/assets[o.asset].ratio/2;redraw();};
$('ungroupStandard').onclick=()=>{const o=items[active],a=o&&assets[o.asset];if(a?.standard!=='set')return;const u=symbolSize(o,a),step=u*(1+a.value.gap),groupId=++groupSerial,rotation=a.rotation;const children=['stack','dry','up'].map((k,i)=>{const asset=assets.push(CartonStandard.asset(k,a.value.count,rotation))-1;let x=0,y=0;switch(rotation){case 90:y=i*step;break;case 180:x=(2-i)*step;break;case 270:y=(2-i)*step;break;default:x=i*step;}return {...o,asset,w:u,x:o.x+x,y:o.y+y,groupId,groupGap:a.value.gap,groupRotation:rotation};});items.splice(active,1,...children);extraSelected.clear();redraw();};
$('groupStandard').onclick=()=>{const o=items[active];if(!o?.groupId)return;const kids=items.filter(k=>k.groupId===o.groupId),stack=kids.find(k=>assets[k.asset].standard==='stack');if(kids.length!==3||!stack||kids.some(k=>k.i!==o.i||k.part!==o.part)){ $('status').textContent='ต้องมีสัญลักษณ์ครบทั้งสามและอยู่บนฝาหรือแผงเดียวกันเพื่อรวมชุด';return;}const u=stack.w,gap=stack.groupGap??5/u,rotation=stack.groupRotation??0,a=CartonStandard.asset('set',{count:assets[stack.asset].value,gap},rotation),next={asset:assets.push(a)-1,i:o.i,part:o.part,w:rotation%180===0?u*(3+2*gap):u,x:Math.min(...kids.map(k=>k.x)),y:Math.min(...kids.map(k=>k.y))};for(let i=items.length-1;i>=0;i--)if(kids.includes(items[i]))items.splice(i,1);items.push(next);active=items.length-1;extraSelected.clear();redraw();};
$('objects').onchange=e=>{extraSelected.clear();active=Number(e.target.value);face=items[active].i;redraw();};
$('remove').onclick=()=>deleteSelected();
for(const [id,k] of [['ix','x'],['iy','y'],['iw','w']])$(id).onchange=()=>{if($(id).validity.valid&&items[active]&&!items[active].locked)items[active][k]=num(id);redraw();};
$('lines').addEventListener('change',redraw);
document.querySelectorAll('#dims input,#spec input,#type,#basis,#tape').forEach(e=>e.addEventListener('input',redraw));
const canvas=$('model');
// Keep the backing store proportional to its actual display size (no CSS stretching).
function resizeModel(){const r=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}render3();}
let hitFaces=[],turnStart=null;
function render3(target=canvas){
 if(target===canvas)hitFaces=[];
 const ctx=target.getContext('2d'),W=target.width,H=target.height;
 ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,W,H);ctx.fillStyle='#edf1f5';ctx.fillRect(0,0,W,H);if(!g)return;
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
  ctx.save();try{ctx.setTransform((q[0]-p[0])/box.w,(q[1]-p[1])/box.w,(r[0]-p[0])/box.h,(r[1]-p[1])/box.h,p[0],p[1]);
  ctx.fillStyle=!exterior?'#ae8c60':part==='top'?'#ddc59e':part==='bottom'?'#b99b70':['#d3b488','#c09d70','#c7a67a','#ba986c'][i];ctx.fillRect(0,0,box.w,box.h);
  ctx.strokeStyle='#957955';ctx.lineWidth=.8;ctx.strokeRect(0,0,box.w,box.h);
  if(exterior){
   for(const o of visibleItems().filter(o=>o.i===i&&o.part===part)){const a=assets[o.asset];if(!a.img.complete||!a.img.naturalWidth)continue;ctx.drawImage(inkMode()==='original'?a.img:inkPreview(a).canvas,o.x,o.y,o.w,o.w/a.ratio);}
   if($('tape').checked&&part!=='wall'&&i%2===0&&Math.abs(g.w-2*f)<.01){const band=Math.min(num('band')/2,f);ctx.fillStyle='rgba(177,149,96,.48)';ctx.fillRect(0,part==='top'?0:f-band,box.w,band);}
  }
  }finally{ctx.restore();}
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
function spotConfig(){return {name:$('spotName').value.trim(),color:$('spotColor').value};}
 function inkPreview(a){return CartonInk.preview(a,inkMode(),spotConfig().color);}
 let includeOriginalLines=$('lines').checked;
function updatePreflight(){if(!g)return;const plan=CartonProduction.preflight(visibleItems(),assets,inkMode(),spotConfig());$('preflight').textContent=plan.message;$('conversionLabel').hidden=!plan.ack;const blocked=plan.errors.length>0||(plan.ack&&!$('acceptConversion').checked);$('pdf').disabled=blocked;$('package').disabled=blocked;}
$('acceptConversion').onchange=updatePreflight;
$('inkMode').onchange=()=>{$('spotOptions').hidden=inkMode()!=='blue';$('inkHint').textContent=inkMode()==='original'?'CMYK · แปลง RGB เป็น DeviceCMYK (ไม่มี ICC)':'1 Colour · เว้นสีขาวเป็นเนื้อกระดาษในภาพ Raster · เส้นโครงสร้างแยกจากงานพิมพ์';$('acceptConversion').checked=false;if(window.syncInkCompact)window.syncInkCompact();redraw();};
$('spotName').oninput=()=>{updatePreflight();};$('spotColor').oninput=()=>{window.syncInkCompact?.();redraw();};
async function output(kind){
 if(!g||$(kind).disabled)throw Error('ตรวจขนาดกล่องและวางกราฟิกก่อนส่งไฟล์พิมพ์');
 const name='Carton_'+[g.l,g.w,g.h].map(fmt).join('x'),el=node('svg',{xmlns:ns,width:g.width+'mm',height:g.height+'mm'});
 const ink=inkMode(),mono=ink!=='original';
 drawing(el,false,kind==='svg'&&$('lines').checked);
 if(kind==='pdf'||kind==='package'){
  const plan=CartonProduction.preflight(visibleItems(),assets,ink,spotConfig());if(plan.errors.length||plan.ack&&!$('acceptConversion').checked)throw Error('กรุณาตรวจ Preflight และยืนยันการแปลงก่อนส่งออก');
  const config={mode:ink,...spotConfig()},placements=visibleItems().map(o=>{const b=partBox(o.i,o.part);return {asset:assets[o.asset],x:b.x+o.x,y:b.y+o.y,w:o.w,h:o.w/assets[o.asset].ratio};}),geo={...g};
  $('status').textContent='กำลังสร้างไฟล์งานพิมพ์…';const result=await CartonProduction.export(geo,placements,config,kind==='package',plan.message);download(new Blob([result],{type:kind==='pdf'?'application/pdf':'application/zip'}),name+(kind==='package'?'_Production.zip':'_Print.pdf'));return;
 }
 if(kind==='svg'){
  for(const im of el.querySelectorAll('image')){
   const asset=assets[items[Number(im.getAttribute('data-item'))].asset];
   if(asset.vector&&(asset.standard||asset.traced||asset.text||!mono)){
    const symbol=asset.vector.cloneNode(true);if(mono){const color=ink==='black'?'#000000':spotConfig().color;symbol.setAttribute('fill',color);for(const n of symbol.querySelectorAll('[fill="black"]'))n.setAttribute('fill',color);for(const n of symbol.querySelectorAll('[stroke="black"]'))n.setAttribute('stroke',color);}
    for(const k of ['x','y','width','height'])symbol.setAttribute(k,im.getAttribute(k));im.replaceWith(symbol);
   }else if(mono&&asset.barcode){
    const symbol=asset.vector.cloneNode(true),color=ink==='black'?'#000000':spotConfig().color;
    symbol.querySelector('rect[fill="white"]').remove();symbol.setAttribute('fill',color);
    for(const el of symbol.querySelectorAll('[fill="black"]'))el.setAttribute('fill',color);
    for(const el of symbol.querySelectorAll('[stroke="black"]'))el.setAttribute('stroke',color);
    for(const k of ['x','y','width','height'])symbol.setAttribute(k,im.getAttribute(k));im.replaceWith(symbol);
   }else if(mono)im.setAttribute('href',await CartonInk.svg(asset,+im.getAttribute('width'),ink,spotConfig().color));
   else if(asset.native)im.setAttribute('href',await CartonPDF.svgBitmap(asset,+im.getAttribute('width')));
  }
  download(new Blob([new XMLSerializer().serializeToString(el)],{type:'image/svg+xml'}),name+'.svg');}
 else if(kind==='jpeg'){const c=document.createElement('canvas');c.width=2400;c.height=1200;render3(c);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.95));download(blob,name+'_preview.jpg');}

}
let exporting=false;for(const kind of ['svg','pdf','jpeg','package'])$(kind).onclick=async()=>{if(exporting)return;exporting=true;try{await output(kind);$('status').textContent='ส่งออก '+kind.toUpperCase()+' แล้ว';}catch(e){$('status').textContent='ส่งออกไม่สำเร็จ · '+e.message;}finally{exporting=false;}};
$('pickPdf').onclick=()=>$('pdfFile').click();
$('pdfFile').onchange=async e=>{const file=e.target.files[0];if(file)try{await CartonPDF.open(file);}catch(error){$('status').textContent=error.message;}e.target.value='';};
for(const [kind] of CartonStandard.definitions)registerAsset(CartonStandard.asset(kind,kind==='dhas'?'CHINA':kind==='stack'?'4':kind==='set'?{count:'4',gap:5/35}:''),'standardLibrary');
const toolBody=$('toolBody');let toolGroup=null;for(const child of [...toolBody.children]){if(child.tagName==='H2'||!toolGroup){toolGroup=document.createElement('div');toolGroup.className='tool-group';toolBody.append(toolGroup);}toolGroup.append(child);}const itemGroup=document.createElement('div');itemGroup.className='tool-group';const itemTitle=document.createElement('h2');itemTitle.textContent='จัดวาง / ปรับขนาด';itemGroup.append($('item'));$('properties').append(itemGroup);

function buildInkCompact(){
 const inkGroup=[...toolBody.querySelectorAll('.tool-group')].find(g=>g.querySelector('#inkMode'));if(!inkGroup)return;
 const inkLabel=$('inkMode').closest('label'),compact=document.createElement('div');compact.className='header-ink';
 compact.innerHTML=`<div class="ink-compact" role="group" aria-label="Printing ink"><button type="button" class="ink-chip" data-mode="original" title="CMYK · 4 Colour"><span class="ink-icon cmyk"><span class="ink-dot c"></span><span class="ink-dot m"></span><span class="ink-dot y"></span><span class="ink-dot k"></span></span><span>CMYK</span></button><button type="button" class="ink-chip" data-mode="black" title="K100 · 1 Colour"><span class="ink-icon"><span class="ink-dot k"></span></span><span>K</span></button><button type="button" class="ink-chip" data-mode="blue" title="Spot · 1 Colour"><span class="ink-icon"><span class="ink-dot spot"></span></span><span>Spot</span></button></div><details id="inkPopover"><summary title="ตั้งค่าหมึกและข้อมูลสี">⚙</summary><div class="ink-pop-body"></div></details>`;
 $('openExport').before(compact);const body=compact.querySelector('.ink-pop-body');inkLabel.hidden=true;body.append(inkLabel,$('spotOptions'),$('inkHint'));inkGroup.remove();
 for(const btn of compact.querySelectorAll('.ink-chip'))btn.onclick=()=>{$('inkMode').value=btn.dataset.mode;$('inkMode').dispatchEvent(new Event('change'));$('inkPopover').open=btn.dataset.mode==='blue';};
 window.syncInkCompact=()=>{for(const btn of compact.querySelectorAll('.ink-chip')){const on=btn.dataset.mode===inkMode();btn.classList.toggle('is-active',on);btn.setAttribute('aria-pressed',String(on));}compact.querySelector('.ink-dot.spot').style.background=$('spotColor').value;};
 document.addEventListener('pointerdown',e=>{if(!compact.contains(e.target))$('inkPopover').open=false;});
}

function cloneAsset(asset){
 const img=new Image();img.src=asset.url;img.decoding='async';
 return {...asset,img,vector:asset.vector?asset.vector.cloneNode(true):null,value:typeof asset.value==='object'?JSON.parse(JSON.stringify(asset.value)):asset.value};
}
function cloneItemData(index){
 const o=items[index];if(!o||o.locked)return null;const a=assets[o.asset];
 return {item:{...o,locked:false,groupId:undefined},asset:cloneAsset(a)};
}
function copyActive(){const data=selectedObjects().map(o=>cloneItemData(items.indexOf(o)));if(!data.length)return false;clipboardItem=data;$('status').textContent='คัดลอก '+data.length+' องค์ประกอบ';updateAdvanced();return true;}
function pasteCopied(){if(!clipboardItem?.length||!g)return false;const copies=[];for(const c of clipboardItem){const a=cloneAsset(c.asset),assetIndex=assets.push(a)-1,o={...c.item,asset:assetIndex,x:c.item.x,y:c.item.y};items.push(o);copies.push(o);constrain(o);a.img.decode().then(redraw).catch(()=>{});}moveSet(copies.map(o=>({o,x:o.x,y:o.y})),8,8);active=items.length-1;extraSelected=new Set(copies.slice(0,-1));face=items[active].i;$('acceptConversion').checked=false;redraw();$('status').textContent='วาง '+copies.length+' องค์ประกอบ';return true;}
function isTextField(el){return !!el && (el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT'||el.isContentEditable);}
document.addEventListener('keydown',e=>{if(!(e.metaKey||e.ctrlKey)||e.altKey||isTextField(document.activeElement)||document.querySelector('dialog[open]'))return;if(e.key.toLowerCase()==='c'&&copyActive())e.preventDefault();else if(e.key.toLowerCase()==='v'&&clipboardItem&&pasteCopied())e.preventDefault();});
document.addEventListener('paste',e=>{if(isTextField(document.activeElement)||document.querySelector('dialog[open]'))return;const files=Array.from(e.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/')||f.type==='application/pdf');if(files.length){e.preventDefault();queueFiles(files);}});

function moveClipboardHint(){const target=itemGroup.querySelector('h2');const note=document.createElement('small');note.className='clipboard-note';note.textContent='คีย์ลัด: Ctrl/Cmd + C เพื่อคัดลอก · Ctrl/Cmd + V เพื่อวาง';itemGroup.append(note);}


// Workbench actions; all dimensions remain in the existing mm coordinate system.
const history=[],historyFields=['len','wid','hei','thick','glue','slot','depth','band','type','basis'];let historyIndex=-1,restoring=false;
function recordHistory(){if(restoring||!g||moving)return;const state={fields:historyFields.map(id=>$(id).value),items:items.map(o=>({...o})),refs:items.map(o=>assets[o.asset]),active,face};state.key=JSON.stringify([state.fields,state.items,state.refs.map(a=>[a.standard,a.value,a.rotation])]);if(history[historyIndex]?.key===state.key)return;history.splice(historyIndex+1);history.push(state);if(history.length>40)history.shift();historyIndex=history.length-1;updateHistoryButtons();}
function updateHistoryButtons(){$('undo').disabled=historyIndex<=0;$('redo').disabled=historyIndex>=history.length-1;}
function restoreHistory(step){const target=historyIndex+step;if(target<0||target>=history.length)return;restoring=true;try{const state=history[target];historyIndex=target;state.fields.forEach((v,i)=>$(historyFields[i]).value=v);items.splice(0,items.length,...state.items.map((o,i)=>{assets[o.asset]=state.refs[i];return {...o};}));autoSizeItem=items.find(o=>o.locked)||null;active=state.active;extraSelected.clear();face=state.face;$('acceptConversion').checked=false;redraw();}finally{restoring=false;updateHistoryButtons();}}
$('undo').onclick=()=>restoreHistory(-1);$('redo').onclick=()=>restoreHistory(1);
document.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.altKey||isTextField(document.activeElement)||document.querySelector('dialog[open]'))return;const k=e.key.toLowerCase();if(k==='z'||k==='y'){e.preventDefault();restoreHistory(k==='y'||e.shiftKey?1:-1);}});
$('ih').onchange=()=>{const o=items[active];if(g&&o&&!o.locked&&$('ih').validity.valid)o.w=num('ih')*assets[o.asset].ratio;redraw();};
for(const btn of document.querySelectorAll('[data-align]'))btn.onclick=()=>{const o=items[active];if(!g||!o||o.locked)return;const b=partBox(o.i,o.part),a=assets[o.asset];if(btn.dataset.align==='left')o.x=0;else if(btn.dataset.align==='right')o.x=b.w-o.w;else {o.x=(b.w-o.w)/2;o.y=(b.h-o.w/a.ratio)/2;}redraw();};
$('gridToggle').onclick=()=>{const on=$('gridToggle').getAttribute('aria-pressed')!=='true';$('gridToggle').setAttribute('aria-pressed',String(on));$('scroll').classList.toggle('no-grid',!on);};
function expandWorkspace(on){$('workspace').classList.toggle('expanded',on);$('expandWorkspace').setAttribute('aria-pressed',String(on));$('expandWorkspace').textContent=on?'Exit full screen ↙':'Full screen ↗';document.body.classList.toggle('workspace-expanded',on);requestAnimationFrame(()=>scaleFlat(zoom));}
$('expandWorkspace').onclick=()=>expandWorkspace(!$('workspace').classList.contains('expanded'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('workspace').classList.contains('expanded'))expandWorkspace(false);});

buildInkCompact();moveClipboardHint();CartonText.init();
initAdvanced();CartonTrace.init({registerAsset,place,currentTarget:()=>g?{i:face,part:'wall',b:partBox(face,'wall')}:null});
window.SCBarcodezyDeepAssetAPI={registerAsset,place,currentTarget:()=>g?{i:face,part:'wall',b:partBox(face,'wall')}:null};
$('toggleTools').onclick=()=>{toolBody.hidden=!toolBody.hidden;$('toggleTools').setAttribute('aria-expanded',String(!toolBody.hidden));$('toggleTools').textContent=toolBody.hidden?'แสดงเครื่องมือ':'ซ่อนเครื่องมือ';};
const exportDialog=$('exportDialog');
$('openExport').onclick=()=>{updatePreflight();$('exportStatus').textContent='';exportDialog.showModal();};
$('closeExport').onclick=()=>exportDialog.close();
new MutationObserver(()=>{$('exportStatus').textContent=$('status').textContent;}).observe($('status'),{childList:true,characterData:true,subtree:true});
// Preview-only geometry; the production exporter continues to use the original dimensions.
new ResizeObserver(resizeModel).observe(canvas);
redraw();scale3(1);scaleFlat(1);$('inkMode').onchange();if(window.syncInkCompact)window.syncInkCompact();resizeModel();

function selectedObjects(){return [...new Set([items[active],...extraSelected])].filter(o=>o&&!o.locked&&items.includes(o)&&g&&partBox(o.i,o.part).h>0);}
function safeInset(b){return Math.max(0,Math.min(Number($('safeMargin').value)||0,(Math.min(b.w,b.h)-.1)/2));}
function outsideSafe(o){const b=partBox(o.i,o.part),m=safeInset(b);return o.x<m-.01||o.y<m-.01||o.x+o.w>b.w-m+.01||o.y+o.w/assets[o.asset].ratio>b.h-m+.01;}
function deleteSelected(){const sel=selectedObjects();if(!sel.length)return;for(let j=items.length-1;j>=0;j--)if(sel.includes(items[j]))items.splice(j,1);active=-1;extraSelected.clear();redraw();$('status').textContent='ลบ '+sel.length+' องค์ประกอบ';}
function moveSet(list,dx,dy){let minX=-Infinity,maxX=Infinity,minY=-Infinity,maxY=Infinity;for(const {o,x,y} of list){const b=partBox(o.i,o.part);minX=Math.max(minX,-x);maxX=Math.min(maxX,b.w-o.w-x);minY=Math.max(minY,-y);maxY=Math.min(maxY,b.h-o.w/assets[o.asset].ratio-y);}dx=Math.max(minX,Math.min(maxX,dx));dy=Math.max(minY,Math.min(maxY,dy));for(const {o,x,y} of list)Object.assign(o,{x:x+dx,y:y+dy});}
function absBox(o){const b=partBox(o.i,o.part);return {o,x:b.x+o.x,y:b.y+o.y,w:o.w,h:o.w/assets[o.asset].ratio,b};}
function unionBox(a){const x=Math.min(...a.map(v=>v.x)),y=Math.min(...a.map(v=>v.y));return {x,y,w:Math.max(...a.map(v=>v.x+v.w))-x,h:Math.max(...a.map(v=>v.y+v.h))-y};}
function doAlign(cmd){const a=selectedObjects().map(absBox),mode=$('alignTo').value;if(!a.length)return;const dist=cmd==='dx'||cmd==='dy';if(dist&&a.length<3||!dist&&['selection','key'].includes(mode)&&a.length<2)return;let changes=[];
 if(dist){const k=cmd==='dx'?'x':'y',d=k==='x'?'w':'h';a.sort((p,q)=>p[k]-q[k]);const end=Math.max(...a.map(v=>v[k]+v[d])),gap=(end-a[0][k]-a.reduce((n,v)=>n+v[d],0))/(a.length-1);if(gap<0){$('status').textContent='พื้นที่ไม่พอสำหรับกระจายแบบไม่ซ้อน';return;}let pos=a[0][k];for(const v of a){changes.push({v,x:k==='x'?pos:v.x,y:k==='y'?pos:v.y});pos+=v[d]+gap;}}
 else{const target=mode==='key'?absBox(items[active]):unionBox(a);for(const v of a){let t=target;if(mode==='panel'||mode==='safe'){const m=mode==='safe'?safeInset(v.b):0;t={x:v.b.x+m,y:v.b.y+m,w:v.b.w-2*m,h:v.b.h-2*m};}let x=v.x,y=v.y;if(cmd==='l')x=t.x;if(cmd==='cx')x=t.x+(t.w-v.w)/2;if(cmd==='r')x=t.x+t.w-v.w;if(cmd==='t')y=t.y;if(cmd==='cy')y=t.y+(t.h-v.h)/2;if(cmd==='b')y=t.y+t.h-v.h;changes.push({v,x,y});}}
 if(changes.some(({v,x,y})=>x<v.b.x-.001||y<v.b.y-.001||x+v.w>v.b.x+v.b.w+.001||y+v.h>v.b.y+v.b.h+.001)){$('status').textContent='จัดแนวไม่ได้: วัตถุจะออกนอกแผงเดิม';return;}for(const {v,x,y} of changes)Object.assign(v.o,{x:x-v.b.x,y:y-v.b.y});redraw();$('status').textContent='จัดแนวแล้ว';}
function updateAdvanced(){const n=selectedObjects().length,mode=$('alignTo').value;$('deleteObjects').disabled=$('copyObjects').disabled=!n;$('pasteObjects').disabled=!clipboardItem?.length;for(const b of $('advancedAlign').children)b.disabled=b.dataset.cmd.startsWith('d')?n<3:n<(mode==='selection'||mode==='key'?2:1);}
function initAdvanced(){const icons={l:'<path d="M3 2V22M6 6H15V11H6ZM6 14H21V19H6Z"/>',cx:'<path d="M12 2V22M6 6H18V11H6ZM2 14H22V19H2Z"/>',r:'<path d="M21 2V22M9 6H18V11H9ZM3 14H18V19H3Z"/>',t:'<path d="M2 3H22M6 6H11V21H6ZM14 6H19V15H14Z"/>',cy:'<path d="M2 12H22M6 2H11V22H6ZM14 6H19V18H14Z"/>',b:'<path d="M2 21H22M6 3H11V18H6ZM14 9H19V18H14Z"/>',dx:'<path d="M2 3V21M22 3V21M5 7H8V17H5ZM11 7H14V17H11ZM17 7H20V17H17Z"/>',dy:'<path d="M3 2H21M3 22H21M7 5H17V8H7ZM7 11H17V14H7ZM7 17H17V20H7Z"/>'};for(const [cmd,label] of Object.entries({l:'ชิดซ้าย',cx:'กึ่งกลาง X',r:'ชิดขวา',t:'ชิดบน',cy:'กึ่งกลาง Y',b:'ชิดล่าง',dx:'กระจาย X',dy:'กระจาย Y'})){const b=document.createElement('button');b.type='button';b.dataset.cmd=cmd;b.title=label;b.setAttribute('aria-label',label);b.innerHTML=`<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="currentColor" stroke-width="1.3">${icons[cmd]}</svg>`;b.onclick=()=>doAlign(cmd);$('advancedAlign').append(b);} $('alignTo').onchange=updateAdvanced;for(const id of ['showSafe','showDims','safeMargin'])$(id).onchange=redraw;$('deleteObjects').onclick=deleteSelected;$('copyObjects').onclick=copyActive;$('pasteObjects').onclick=pasteCopied;document.addEventListener('keydown',e=>{if(isTextField(document.activeElement)||document.querySelector('dialog[open]')||e.altKey)return;const k=e.key,mod=e.ctrlKey||e.metaKey;if(mod&&k.toLowerCase()==='a'&&g){e.preventDefault();const a=visibleItems().filter(o=>!o.locked);active=items.indexOf(a.at(-1));extraSelected=new Set(a.slice(0,-1));redraw();}else if(!mod&&(k==='Delete'||k==='Backspace')&&selectedObjects().length){e.preventDefault();deleteSelected();}else if(k==='Escape'){active=-1;extraSelected.clear();redraw();}else if(!mod&&k.startsWith('Arrow')&&document.activeElement!==$('model')&&selectedObjects().length){e.preventDefault();const d=e.shiftKey?10:1;moveSet(selectedObjects().map(o=>({o,x:o.x,y:o.y})),k==='ArrowLeft'?-d:k==='ArrowRight'?d:0,k==='ArrowUp'?-d:k==='ArrowDown'?d:0);redraw();}});document.addEventListener('pointerdown',e=>{for(const m of document.querySelectorAll('.toolbar-menu[open]'))if(!m.contains(e.target))m.open=false;});}
