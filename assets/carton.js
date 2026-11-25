'use strict';
const $=id=>document.getElementById(id), ns='http://www.w3.org/2000/svg';
const assets=[],items=[], names=['หน้า','ขวา','หลัง','ซ้าย'];
let active=-1,face=0,zoom=1,mag=1,yaw=-.55,pitch=.36,g=null,moving=null,autoSizeItem=null,groupSerial=0,clipboardItem=null;
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
  if(part==='wall'){const t=node('text',{x:b.x+b.w/2,y:b.y+b.h*.91,'text-anchor':'middle','font-size':Math.min(b.h*.08,b.w*.065),fill:'#866d50','pointer-events':'none'},el);t.textContent=names[i]+' · '+fmt(b.w)+' × '+fmt(b.h);}
 }
 for(const o of visibleItems()){
  const b=partBox(o.i,o.part),a=assets[o.asset],x=b.x+o.x,y=b.y+o.y,h=o.w/a.ratio;
  node('image',{x,y,width:o.w,height:h,href:edit&&inkMode()!=='original'&&a.img.complete&&a.img.naturalWidth?inkPreview(a).url:a.url,'data-item':items.indexOf(o),...(o.locked?{'data-locked':'true'}:{})},el);
 
 }
 if(lines){node('path',{d:g.cut,fill:'none',stroke:'#ae3457','stroke-width':.25},el);node('path',{d:g.fold,fill:'none',stroke:'#3269b2','stroke-width':.25,'stroke-dasharray':'4 2'},el);}
 if(edit&&items[active]&&!items[active].locked&&visibleItems().includes(items[active])){
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
 const asset=o&&assets[o.asset];$('ppi').textContent=asset?.native?(asset.ppi?'ภาพใน PDF ประมาณ '+Math.round(asset.ppi*asset.mmWidth/o.w)+' ppi ณ ขนาดที่วาง':'PDF ต้นฉบับ · คงวัตถุและทรัพยากรเมื่อส่ง PDF'):'';
 if(o&&!o.locked){$('ix').value=fmt(o.x);$('iy').value=fmt(o.y);$('iw').value=fmt(o.w);$('elementSize').textContent=fmt(o.w)+' × '+fmt(o.w/asset.ratio)+' mm';}
 const standard=asset?.standard; $('standardOptions').hidden=!standard||standard==='size';$('countryOption').hidden=standard!=='dhas';$('stackOption').hidden=!['stack','set'].includes(standard);$('setGapOption').hidden=standard!=='set';$('ungroupStandard').hidden=standard!=='set';$('groupStandard').hidden=!o?.groupId||!['stack','dry','up'].includes(standard);
 if(standard==='set'){const v=asset.value; if(document.activeElement!==$('stackCount'))$('stackCount').value=v.count;if(document.activeElement!==$('setGap'))$('setGap').value=fmt(v.gap*symbolSize(o,asset));}
 if(standard==='dhas'&&document.activeElement!==$('originCountry')&&document.activeElement!==$('countrySelect')){const sel=$('countrySelect'),known=[...sel.options].some(v=>v.value===asset.value);sel.value=known?asset.value:'CUSTOM';$('originCountry').hidden=known;$('originCountry').value=asset.value;}
 if(standard==='stack'&&document.activeElement!==$('stackCount'))$('stackCount').value=asset.value;
}
function redraw(){
 try{g=geometry();}catch(e){g=null;$('check').textContent=e.message;$('flat').replaceChildren();$('sheet').textContent='';render3();for(const id of ['svg','pdf','jpeg','package'])$(id).disabled=true;return;}
 syncAutoSize();items.forEach(constrain);drawing($('flat'),true,true);controls();render3();
 const gap=g.w-2*g.f,innerOverlap=2*g.f-g.l;
 $('sheet').textContent=fmt(g.width)+' × '+fmt(g.height)+' มม.';
 $('check').textContent=(Math.abs(gap)<.01?'ฝาคู่นอกชนกลางตามระยะเส้นพับ':gap>0?'ระยะห่างปลายฝา '+fmt(gap)+' มม.':'ฝาคู่นอกเกยกัน '+fmt(-gap)+' มม.')+(innerOverlap>.01?' · ฝาคู่ในซ้อน '+fmt(innerOverlap)+' มม.':'')+' · '+($('basis').value==='crease'?'ใช้ระยะเส้นพับที่กรอก':'แบบร่างตามขนาดที่กรอก')+' · ตรวจระยะเผื่อกับซัพฯ ก่อนผลิต';
 const printable=visibleItems().length>0||(inkMode()==='original'&&$('lines').checked);
 for(const id of ['svg','pdf','package'])$(id).disabled=!printable;
 updatePreflight();
 $('jpeg').disabled=false;
 if(!printable)$('check').textContent+=' · วางกราฟิกบนแบบคลี่เพื่อส่งไฟล์พิมพ์';
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
 items.push({asset,i,part,w,x:(p?p.x-b.x:b.w/2)-w/2,y:(p?p.y-b.y:b.h/2)-w/assets[asset].ratio/2});active=items.length-1;face=i;redraw();
}
$('flat').onpointerdown=e=>{if(!g||e.button!==0&&e.button!==1)return;
 const flat=$('flat'),scroll=$('scroll');
 if(e.button===1||$('pan').getAttribute('aria-pressed')==='true'){e.preventDefault();moving={pan:true,sx:e.clientX,sy:e.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};flat.setPointerCapture(e.pointerId);return;}
 const idx=e.target.getAttribute('data-item'),handle=e.target.getAttribute('data-resize'),p=coord(e);
 if(handle&&items[active]&&!items[active].locked){e.preventDefault();const o=items[active],b=partBox(o.i,o.part),a=assets[o.asset],h=o.w/a.ratio;moving={resize:handle,start:p,x:o.x,y:o.y,w:o.w,h,i:o.i,part:o.part};flat.setPointerCapture(e.pointerId);return;}
 if(idx!==null&&!items[Number(idx)].locked){e.preventDefault();active=Number(idx);const o=items[active],b=partBox(o.i,o.part);moving={dx:p.x-b.x-o.x,dy:p.y-b.y-o.y};flat.setPointerCapture(e.pointerId);face=o.i;}else{const hit=at(p);if(hit)face=hit.i;active=-1;}redraw();};
$('flat').onpointermove=e=>{if(!moving||!g)return;
 if(moving.pan){$('scroll').scrollLeft=moving.left-(e.clientX-moving.sx);$('scroll').scrollTop=moving.top-(e.clientY-moving.sy);return;}
 const p=coord(e),o=items[active];if(!o)return;
 if(moving.resize){const m=moving,k=m.resize,b=partBox(m.i,m.part),dx=p.x-m.start.x,dy=p.y-m.start.y,ratio=m.w/m.h;
  const sx=k.includes('e')?1:k.includes('w')?-1:0,sy=k.includes('s')?1:k.includes('n')?-1:0;
  const anchorX=m.x+(sx>0?0:sx<0?m.w:m.w/2),anchorY=m.y+(sy>0?0:sy<0?m.h:m.h/2);
  const delta=sx&&sy?(sx*dx*m.w+sy*dy*m.h)/(m.w*m.w+m.h*m.h):sx?sx*dx/m.w:sy*dy/m.h;
  const maxW=sx>0?b.w-anchorX:sx<0?anchorX:2*Math.min(anchorX,b.w-anchorX),maxH=sy>0?b.h-anchorY:sy<0?anchorY:2*Math.min(anchorY,b.h-anchorY);
  const w=Math.max(.1,Math.min(m.w*(1+delta),maxW,maxH*ratio)),h=w/ratio;
  Object.assign(o,{w,x:anchorX-(sx>0?0:sx<0?w:w/2),y:anchorY-(sy>0?0:sy<0?h:h/2)});redraw();return;
 }
 const hit=at(p);if(!hit)return;Object.assign(o,{i:hit.i,part:hit.part,x:p.x-hit.b.x-moving.dx,y:p.y-hit.b.y-moving.dy});face=hit.i;redraw();};
$('flat').onpointerup=$('flat').onpointercancel=()=>{const resize=moving?.resize;moving=null;if(resize&&g)drawing($('flat'),true,true);};
$('flat').onlostpointercapture=()=>{moving=null;};
$('flat').ondragover=e=>e.preventDefault();
$('flat').ondrop=e=>{e.preventDefault();const id=e.dataTransfer.getData('carton-asset');if(g&&id!==''&&assets[Number(id)]){const p=coord(e);place(Number(id),at(p),p);}};
function registerAsset(asset,library='library'){
 const id=assets.push(asset)-1,btn=document.createElement('button');btn.className='tile';btn.draggable=true;
 asset.img.draggable=false;btn.append(asset.img,document.createTextNode(asset.name));if(library==='standardLibrary'&&['care','dhas','set'].includes(asset.standard))btn.classList.add('wide');
 if(asset.standard)btn.dataset.kind=asset.standard;
 btn.ondragstart=e=>e.dataTransfer.setData('carton-asset',id);
 btn.onclick=()=>{if(g)place(id,{i:face,part:'wall',b:partBox(face,'wall')});};$(library).append(btn);
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
 $('duplicateStandard').onclick=()=>{const o=items[active],a=assets[o.asset];if(!a?.standard||o.locked)return;items.push({...o,groupId:undefined,asset:assets.push(CartonStandard.asset(a.standard,a.value,a.rotation))-1,x:o.x+5,y:o.y+5});active=items.length-1;redraw();};

$('setGap').onchange=()=>{const o=items[active],a=o&&assets[o.asset];if(a?.standard!=='set'||!$('setGap').validity.valid)return;const unit=symbolSize(o,a),gap=num('setGap')/unit,oldH=o.w/a.ratio,cx=o.x+o.w/2,cy=o.y+oldH/2;assets[o.asset]=CartonStandard.asset('set',{...a.value,gap},a.rotation);o.w=a.rotation%180===0?unit*(3+2*gap):unit;o.x=cx-o.w/2;o.y=cy-o.w/assets[o.asset].ratio/2;redraw();};
$('ungroupStandard').onclick=()=>{const o=items[active],a=o&&assets[o.asset];if(a?.standard!=='set')return;const u=symbolSize(o,a),step=u*(1+a.value.gap),groupId=++groupSerial,rotation=a.rotation;const children=['stack','dry','up'].map((k,i)=>{const asset=assets.push(CartonStandard.asset(k,a.value.count,rotation))-1;let x=0,y=0;switch(rotation){case 90:y=i*step;break;case 180:x=(2-i)*step;break;case 270:y=(2-i)*step;break;default:x=i*step;}return {...o,asset,w:u,x:o.x+x,y:o.y+y,groupId,groupGap:a.value.gap,groupRotation:rotation};});items.splice(active,1,...children);redraw();};
$('groupStandard').onclick=()=>{const o=items[active];if(!o?.groupId)return;const kids=items.filter(k=>k.groupId===o.groupId),stack=kids.find(k=>assets[k.asset].standard==='stack');if(kids.length!==3||!stack||kids.some(k=>k.i!==o.i||k.part!==o.part)){ $('status').textContent='ต้องมีสัญลักษณ์ครบทั้งสามและอยู่บนฝาหรือแผงเดียวกันเพื่อรวมชุด';return;}const u=stack.w,gap=stack.groupGap??5/u,rotation=stack.groupRotation??0,a=CartonStandard.asset('set',{count:assets[stack.asset].value,gap},rotation),next={asset:assets.push(a)-1,i:o.i,part:o.part,w:rotation%180===0?u*(3+2*gap):u,x:Math.min(...kids.map(k=>k.x)),y:Math.min(...kids.map(k=>k.y))};for(let i=items.length-1;i>=0;i--)if(kids.includes(items[i]))items.splice(i,1);items.push(next);active=items.length-1;redraw();};
$('objects').onchange=e=>{active=Number(e.target.value);face=items[active].i;redraw();};
$('remove').onclick=()=>{if(!items[active]||items[active].locked)return;items.splice(active,1);active=items.findLastIndex(o=>!o.locked);redraw();};
for(const [id,k] of [['ix','x'],['iy','y'],['iw','w']])$(id).onchange=()=>{if($(id).validity.valid&&items[active]&&!items[active].locked)items[active][k]=num(id);redraw();};
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
   for(const o of visibleItems().filter(o=>o.i===i&&o.part===part)){const a=assets[o.asset];if(!a.img.complete||!a.img.naturalWidth)continue;ctx.drawImage(inkMode()==='original'?a.img:inkPreview(a).canvas,o.x,o.y,o.w,o.w/a.ratio);}
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
function spotConfig(){return {name:$('spotName').value.trim(),color:$('spotColor').value};}
 function inkPreview(a){return CartonInk.preview(a,inkMode(),spotConfig().color);}
 let includeOriginalLines=$('lines').checked;
function updatePreflight(){if(!g)return;const plan=CartonProduction.preflight(visibleItems(),assets,inkMode(),spotConfig());$('preflight').textContent=plan.message;$('conversionLabel').hidden=!plan.ack;const blocked=plan.errors.length>0||(plan.ack&&!$('acceptConversion').checked);$('pdf').disabled=blocked;$('package').disabled=blocked;}
$('acceptConversion').onchange=updatePreflight;
$('inkMode').onchange=()=>{$('spotOptions').hidden=inkMode()!=='blue';$('inkHint').textContent=inkMode()==='original'?'CMYK · แปลง RGB เป็น DeviceCMYK (ไม่มี ICC)':'1 Colour · เว้นสีขาวเป็นเนื้อกระดาษในภาพ Raster · เส้นโครงสร้างแยกจากงานพิมพ์';$('acceptConversion').checked=false;if(window.syncInkCompact)window.syncInkCompact();redraw();};
$('spotName').oninput=()=>{updatePreflight();};$('spotColor').oninput=()=>{redraw();};
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
   if(asset.vector&&(asset.standard||!mono)){
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
const toolBody=$('toolBody');let toolGroup=null;for(const child of [...toolBody.children]){if(child.tagName==='H2'||!toolGroup){toolGroup=document.createElement('div');toolGroup.className='tool-group';toolBody.append(toolGroup);}toolGroup.append(child);}const itemGroup=document.createElement('div');itemGroup.className='tool-group';const itemTitle=document.createElement('h2');itemTitle.textContent='จัดวาง / ปรับขนาด';itemGroup.append(itemTitle,$('item'));toolBody.append(itemGroup);

function buildInkCompact(){
 const groups=[...toolBody.querySelectorAll('.tool-group')],structureGroup=groups.find(g=>g.querySelector('#type')),inkGroup=groups.find(g=>g.querySelector('#inkMode'));
 if(!structureGroup||!inkGroup)return;
 const inkLabel=$('inkMode').closest('label');
 const compact=document.createElement('div');compact.className='ink-panel';
 compact.innerHTML=`<div class="ink-row"><span class="ink-title">สีหมึกพิมพ์</span></div>
 <div class="ink-compact" role="group" aria-label="สีหมึกพิมพ์">
  <button type="button" class="ink-chip" data-mode="black"><span class="ink-icon"><span class="ink-dot k"></span></span><span>K Only</span><small>1 Colour</small></button>
  <button type="button" class="ink-chip" data-mode="blue"><span class="ink-icon"><span class="ink-dot spot"></span></span><span>Spot</span><small>1 Colour</small></button>
  <button type="button" class="ink-chip" data-mode="original"><span class="ink-icon cmyk"><span class="ink-dot c"></span><span class="ink-dot m"></span><span class="ink-dot y"></span><span class="ink-dot k"></span></span><span>CMYK</span><small>4 Colour</small></button>
 </div>`;
 structureGroup.append(compact);
 structureGroup.classList.add('compact');
 compact.after($('spotOptions'));
 $('spotOptions').classList.add('compact');
 compact.after($('inkHint'));
 $('inkHint').classList.add('compact');
 inkLabel.hidden=true;
 inkGroup.remove();
 for(const btn of compact.querySelectorAll('.ink-chip'))btn.onclick=()=>{$('inkMode').value=btn.dataset.mode;$('inkMode').dispatchEvent(new Event('change'));};
 window.syncInkCompact=()=>{for(const btn of compact.querySelectorAll('.ink-chip'))btn.classList.toggle('is-active',btn.dataset.mode===inkMode());};
}

function cloneAsset(asset){
 const img=new Image();img.src=asset.url;img.decoding='async';
 return {...asset,img,vector:asset.vector?asset.vector.cloneNode(true):null,value:typeof asset.value==='object'?JSON.parse(JSON.stringify(asset.value)):asset.value};
}
function cloneItemData(index){
 const o=items[index],a=assets[o.asset];if(!o||o.locked)return null;
 return {item:{...o,locked:false,groupId:undefined},asset:cloneAsset(a)};
}
async function tryWriteClipboard(){try{await navigator.clipboard.writeText('SCBarcodezy Carton Object');}catch{}}
function copyActive(){const data=cloneItemData(active);if(!data)return false;clipboardItem=data;tryWriteClipboard();$('status').textContent='คัดลอกองค์ประกอบแล้ว';return true;}
function pasteCopied(){if(!clipboardItem||!g)return false;const assetIndex=assets.push(cloneAsset(clipboardItem.asset))-1;const o={...clipboardItem.item,asset:assetIndex,x:clipboardItem.item.x+8,y:clipboardItem.item.y+8};items.push(o);active=items.length-1;face=o.i;constrain(o);redraw();$('status').textContent='วางองค์ประกอบแล้ว';return true;}
function isTextField(el){return !!el && (el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT'||el.isContentEditable);}
async function pasteClipboardImage(e){
 const dt=e.clipboardData;if(!dt)return false;
 const files=[];for(const item of dt.items||[]){if(item.kind==='file'){const f=item.getAsFile();if(f)files.push(f);}}
 if(!files.length)return false;e.preventDefault();await queueFiles(files);return true;
}
document.addEventListener('keydown',async e=>{
 const mod=e.metaKey||e.ctrlKey;if(!mod)return;
 const key=e.key.toLowerCase();
 if(key==='c'&&!isTextField(document.activeElement)){if(copyActive())e.preventDefault();return;}
 if(key==='v'&&!isTextField(document.activeElement)){if(await pasteClipboardImage(e))return;if(pasteCopied())e.preventDefault();return;}
});

function moveClipboardHint(){const target=itemGroup.querySelector('h2');const note=document.createElement('small');note.className='clipboard-note';note.textContent='คีย์ลัด: Ctrl/Cmd + C เพื่อคัดลอก · Ctrl/Cmd + V เพื่อวาง';itemGroup.append(note);}

buildInkCompact();moveClipboardHint();
$('toggleTools').onclick=()=>{toolBody.hidden=!toolBody.hidden;$('toggleTools').setAttribute('aria-expanded',String(!toolBody.hidden));$('toggleTools').textContent=toolBody.hidden?'แสดงเครื่องมือ':'ซ่อนเครื่องมือ';};
redraw();scale3(1);scaleFlat(1);$('inkMode').onchange();if(window.syncInkCompact)window.syncInkCompact();
