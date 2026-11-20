// Colour is a visual aid in this inspector only. The production path uses
// the same glyph positions and retains the layer's actual ink.
let markPanelView={id:null,kind:'tho',index:0,step:0.1};
function markPanel(parent,o){
  if(markPanelView.id!==o.id)markPanelView={id:o.id,kind:'tho',index:0,step:markPanelView.step};
  const view=markPanelView;
  const panel=section(parent,'ขยับเครื่องหมายไทย');panel.classList.add('mark-editor');
  function select(label,id,entries){
    const wrap=document.createElement('label');wrap.textContent=label;
    const el=document.createElement('select');el.id=id;
    for(const [value,name] of entries)el.add(new Option(name,value));
    wrap.append(el);row.append(wrap);return el;
  }
  const row=document.createElement('div');row.className='mark-selectors';panel.append(row);
  const target=select('เครื่องหมาย','markKind',[['tho','ไม้โท ้'],['am','วงกลมของ ำ'],['vowel','สระบน / ไม้ไต่คู้']]);
  const occurrence=select('จุดที่ปรับ','markOccurrence',[]);
  const preview=document.createElementNS(NS,'svg');preview.id='markLoupe';preview.setAttribute('aria-label','ภาพขยาย เครื่องหมายที่เลือกแสดงเป็นสีน้ำเงิน');
  panel.append(preview);
  const result=document.createElement('div');result.className='mark-offset';result.id='markOffset';panel.append(result);
  const controls=document.createElement('div');controls.className='mark-nudge';panel.append(controls);
  const stepWrap=document.createElement('label');stepWrap.textContent='ระยะต่อครั้ง';
  const step=document.createElement('select');step.id='markStep';
  for(const n of [.05,.1,.25,.5])step.add(new Option(n+' pt',n));
  step.value=String(view.step);step.onchange=()=>{view.step=Number(step.value);};
  stepWrap.append(step);controls.append(stepWrap);
  const buttons=document.createElement('div');buttons.className='mark-arrows';controls.append(buttons);
  for(const [id,icon,desc,x,y] of [['Left','←','ซ้าย',-1,0],['Right','→','ขวา',1,0],['Up','↑','ขึ้น',0,-1],['Down','↓','ลง',0,1]]){
    const b=button(buttons,icon,()=>change(x*view.step,y*view.step));
    b.id='mark'+id;b.title='ขยับ'+desc;b.setAttribute('aria-label',b.title);b.disabled=o.locked;
  }
  const reset=button(panel,'คืนตำแหน่งที่เลือก',()=>change(0,0,true));reset.id='markReset';
  const hint=document.createElement('small');panel.append(hint);
  let hits=[];
  preview.onclick=e=>{
    const matrix=preview.firstElementChild?.getScreenCTM();
    if(!matrix)return;
    let nearest=null,distance=Infinity;
    for(const spot of hits){
      const b=spot.bounds;
      const a=new DOMPoint(b.x1,b.y1).matrixTransform(matrix),z=new DOMPoint(b.x2,b.y2).matrixTransform(matrix);
      if(e.clientX<a.x-7||e.clientX>z.x+7||e.clientY<a.y-7||e.clientY>z.y+7)continue;
      const d=Math.hypot(e.clientX-(a.x+z.x)/2,e.clientY-(a.y+z.y)/2);
      if(d<distance){nearest=spot;distance=d;}
    }
    if(!nearest)return;
    view.kind=nearest.kind;view.index=nearest.index;refresh();
  };
  function selectedOffset(){
    const t=o.markTuning;
    return (view.index?(t?.single?.text===o.text?t.single.points[view.kind+':'+view.index]:null):t?.all?.[view.kind])||[0,0];
  }
  function change(x,y,clear=false){
    assertUnlocked();
    const before=selectedOffset(),next=clear?[0,0]:[before[0]+x,before[1]+y].map(v=>Math.round(v*1000)/1000);
    if(next.every((n,i)=>n===before[i]))return;
    snap();
    const tuning=o.markTuning??={};
    if(view.index&&tuning.single?.text!==o.text)tuning.single={text:o.text,points:{}};
    const items=view.index?tuning.single.points:(tuning.all??={});
    const key=view.index?view.kind+':'+view.index:view.kind;
    if(next[0]||next[1])items[key]=next;else delete items[key];
    if(tuning.single&&!Object.keys(tuning.single.points).length)delete tuning.single;
    if(tuning.all&&!Object.keys(tuning.all).length)delete tuning.all;
    if(!Object.keys(tuning).length)delete o.markTuning;
    paint();updateSourceNotice(o);refresh();$('undo').disabled=false;$('redo').disabled=true;
    $('applyCmd').disabled=true;$('proposal').textContent='';
  }
  function refresh(){
    panel.hidden=!/[\u0e31\u0e33-\u0e37\u0e47\u0e49\u0e4d]/u.test(o.text);
    if(panel.hidden)return;
    function draw(){
      const info={kind:view.kind,index:view.index,path:new opentype.Path(),spots:[]};
      const body=textArt(o,info),sx=o.sx/100,sy=o.sy/100;
      preview.innerHTML='<g transform="scale('+sx+' '+sy+')"><g fill="#27344a">'+body+'</g><path fill="#195cdb" d="'+info.path.toPathData(5)+'"/></g>';
      return info;
    }
    let info=draw();
    for(const opt of target.options)opt.disabled=!info.counts[opt.value];
    const available=Array.from(target.options).filter(opt=>!opt.disabled);
    if(!available.length){panel.hidden=true;return;}
    if(!info.counts[view.kind]){view.kind=available[0].value;view.index=0;info=draw();}
    const count=info.counts[view.kind];
    if(view.index>count||count===1){if(view.index){view.index=0;info=draw();}}
    hits=info.spots;target.value=view.kind;
    occurrence.replaceChildren(new Option('ทุกจุด ('+count+')','0'));
    for(let i=1;i<=count;i++)occurrence.add(new Option('จุดที่ '+i,i));
    occurrence.value=String(view.index);occurrence.parentElement.hidden=count<=1;
    const b=preview.firstElementChild.getBBox(),sx=o.sx/100,sy=o.sy/100,em=o.pt*MM;
    const w=Math.max(2.5*em*sx,Math.min(b.width*sx+.4*em*sx,6*em*sx)),h=1.45*em*sy;
    const focus=info.focus||{x1:b.x,x2:b.x,y1:b.y,y2:b.y};
    const cx=(focus.x1+focus.x2)*sx/2,cy=(focus.y1+focus.y2)*sy/2;
    const left=Math.max(b.x*sx-em*.2*sx,Math.min(cx-w/2,(b.x+b.width)*sx+em*.2*sx-w));
    const top=b.height*sy<=h?(b.y+b.height/2)*sy-h/2:cy-h*.34;
    preview.setAttribute('viewBox',[left,top,w,h].join(' '));
    const [x,y]=selectedOffset();
    result.textContent='X '+x.toFixed(2)+' pt　 Y '+y.toFixed(2)+' pt';
    reset.disabled=o.locked||(!x&&!y);
    hint.textContent=view.index?'แตะเครื่องหมายในภาพเพื่อเลือกจุด ค่ารายจุดใช้กับข้อความชุดนี้':'แตะเครื่องหมายในภาพเพื่อเลือกจุด หรือเลือกทุกจุดเพื่อใช้ค่ากับคำใหม่';
  }
  target.onchange=()=>{view.kind=target.value;view.index=0;refresh();};
  occurrence.onchange=()=>{view.index=Number(occurrence.value);refresh();};
  refresh();return refresh;
}

// Store corrections in em so that the same profile follows point size and artwork scale.
function fontMarkProfile(parent,o){
  const panel=rememberDetails(parent,'จัดสระและวรรณยุกต์อัตโนมัติ');
  small(panel,'ตั้งครั้งเดียวสำหรับ '+o.font+' ในเทมเพลตนี้ คำที่พิมพ์ใหม่จะใช้ระยะตามขนาดตัวอักษร');
  const samples=[
    ['baseTone','ข้อ','วรรณยุกต์บนพยัญชนะ'],
    ['stackTone','ชี้','วรรณยุกต์เหนือสระบน'],
    ['amTone','น้ำ','วรรณยุกต์เหนือสระอำ'],
    ['vowel','ชี้','สระบน / ไม้ไต่คู้'],
    ['am','น้ำ','วงกลมของสระอำ']
  ];
  const selector=document.createElement('select');
  selector.setAttribute('aria-label','รูปแบบคำที่ต้องการปรับ');selector.id='profileContext';
  for(const [key,word,label] of samples)selector.add(new Option(word+' · '+label,key));
  panel.append(selector);
  const sample=document.createElementNS(NS,'svg');sample.style.cssText='width:100%;height:86px;display:block;background:#f6f9fd;color:#203450';
  sample.setAttribute('aria-label','ตัวอย่างตำแหน่งเครื่องหมายตามโปรไฟล์');panel.append(sample);
  const display=document.createElement('small');panel.append(display);
  const controls=document.createElement('div');controls.className='mark-arrows';panel.append(controls);
  function read(){
    return Object.hasOwn(project.thaiProfiles||{},o.font)?project.thaiProfiles[o.font][selector.value]||[0,0]:[0,0];
  }
  function refresh(){
    const word=samples[selector.selectedIndex][1];
    sample.innerHTML='<g fill="currentColor" transform="scale('+o.sx/100+' '+o.sy/100+')">'+textArt({...o,text:word,align:'start',markTuning:undefined,markDrop:0})+'</g>';
    const b=sample.getBBox(),pad=Math.max(.1,b.height*.22);
    sample.setAttribute('viewBox',[b.x-pad,b.y-pad,b.width+2*pad,b.height+2*pad].join(' '));
    const [x,y]=read();
    display.textContent='X '+(x*100).toFixed(1)+'%　Y '+(y*100).toFixed(1)+'% ของขนาดฟอนต์';
    reset.disabled=o.locked||(!x&&!y);
  }
  function move(dx,dy,clear=false){
    assertUnlocked();
    const old=read(),value=clear?[0,0]:old.map((n,i)=>Math.min(2,Math.max(-2,Math.round((n+(i?dy:dx))*1000)/1000)));
    if(value.every((v,i)=>v===old[i]))return;
    snap();
    const profiles=project.thaiProfiles??={};
    const rules=Object.hasOwn(profiles,o.font)?profiles[o.font]:{};
    if(value.some(Boolean))rules[selector.value]=value;else delete rules[selector.value];
    if(Object.keys(rules).length)Object.defineProperty(profiles,o.font,{value:rules,enumerable:true,configurable:true,writable:true});
    else delete profiles[o.font];
    paint();refresh();refreshMarkPanel?.();$('undo').disabled=false;$('redo').disabled=true;
    $('applyCmd').disabled=true;$('proposal').textContent='';
  }
  for(const [icon,label,x,y] of [['←','ซ้าย',-.005,0],['→','ขวา',.005,0],['↑','ขึ้น',0,-.005],['↓','ลง',0,.005]]){
    const b=button(controls,icon,()=>move(x,y));b.setAttribute('aria-label','ปรับโปรไฟล์'+label);b.disabled=o.locked;
  }
  const reset=button(panel,'คืนค่ารูปแบบคำนี้',()=>move(0,0,true));
  selector.onchange=refresh;panel.addEventListener('toggle',()=>{if(panel.open)refresh();});refresh();
}
