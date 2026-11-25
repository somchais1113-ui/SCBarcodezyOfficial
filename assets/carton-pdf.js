// The canvas is only a thumbnail. Production placement copies PDF operators and resources.
const CartonPDF=(()=>{
 const $=id=>document.getElementById(id),ptMM=25.4/72;
 let libraries,source,model,revision=0,busy=false;
 function load(){
  if(!libraries)libraries=Promise.all(['pdf.js','pdf-worker.js','pdf-boxes.js','resources.js'].map(file=>new Promise((resolve,reject)=>{
   const s=document.createElement('script');s.src='assets/vendor/pdf-import/'+file;s.onload=resolve;
   s.onerror=()=>reject(Error('โหลดตัวอ่าน PDF ไม่สำเร็จ กรุณาแตก ZIP ทั้งโฟลเดอร์'));document.head.append(s);
  }))).catch(e=>{libraries=null;throw e;});
  return libraries;
 }
 class Resources{async fetch({kind,filename}){const b=studioPdfAssets[kind]?.[filename];if(!b)throw Error('ไม่พบข้อมูลอ่าน PDF');return Uint8Array.from(atob(b),c=>c.charCodeAt(0));}}
 const key=s=>PDFLib.PDFName.of(s),get=(dict,s)=>dict?.lookup(key(s));
 const binary=s=>Uint8Array.from(s,c=>c.charCodeAt(0));
 function decoded(s){const data=PDFLib.decodePDFRawStream(s).decode(),chunks=[];for(let i=0;i<data.length;i+=32768)chunks.push(String.fromCharCode(...data.subarray(i,i+32768)));return chunks.join('');}
 // Read lexical PDF objects, including escaped strings and compound operands, before identifying operators.
 function operations(s){
  let i=0,args=[],ops=[];
  const delim=/[\x00\x09\x0a\x0c\x0d\x20()<>\[\]{}/%]/;
  function skip(){while(i<s.length){if(/[\x00\x09\x0a\x0c\x0d\x20]/.test(s[i]))i++;else if(s[i]==='%'){while(i<s.length&&!/[\r\n]/.test(s[i]))i++;}else break;}}
  function token(depth=0){
   if(depth>64)throw Error('PDF ซ้อนกลุ่มลึกเกิน');skip();const start=i,ch=s[i++];if(!ch)throw Error('ข้อมูล PDF ไม่ครบ');
   if(ch==='('){let n=1;while(i<s.length&&n){const c=s[i++];if(c==='\\')i++;else if(c==='(')n++;else if(c===')')n--;}if(n)throw Error('ข้อความ PDF ไม่ครบ');}
   else if(ch==='['||ch==='<'&&s[i]==='<'){const end=ch==='['?']':'>>';if(ch==='<')i++;skip();while(i<s.length&&!s.startsWith(end,i)){token(depth+1);skip();}if(i>=s.length)throw Error('ข้อมูล PDF ไม่ครบ');i+=end.length;}
   else if(ch==='<'){i=s.indexOf('>',i);if(i<0)throw Error('ข้อมูลภาพ PDF ไม่ครบ');i++;}
   else while(i<s.length&&!delim.test(s[i]))i++;
   return s.slice(start,i);
  }
  skip();while(i<s.length){const t=token();if(/^[a-zA-Z*'"]/.test(t)&&!['true','false','null'].includes(t)){
    if(t==='BI')throw Error('หน้านี้มี Inline Image กรุณาแยกภาพเป็นเลเยอร์แล้วบันทึก PDF ใหม่');
    ops.push({op:t,args});args=[];
   }else args.push(t);skip();}
  return ops;
 }
 function analyze(doc,page){
  const entries=[],layers=new Map();
  function group(dict){
   if(!dict)return null;
   if(String(get(dict,'Type'))!=='/OCG')throw Error('PDF ใช้เงื่อนไขเลเยอร์ซับซ้อน กรุณาบันทึกสำเนาเป็น Acrobat Layers แบบแยกชั้น');
   if(!layers.has(dict))layers.set(dict,{id:'l'+layers.size,label:get(dict,'Name')?.decodeText()||'เลเยอร์ '+(layers.size+1)});
   return layers.get(dict);
  }
  function byToken(dict,name){return dict?.lookup(PDFLib.PDFName.of(name.slice(1)));}
  const content=page.node.Contents(),streams=content instanceof PDFLib.PDFArray?content.asArray().map(ref=>doc.context.lookup(ref)):[content];
  const contentText=streams.filter(Boolean).map(decoded).join('\n');
  const tree=visit(contentText,page.node.Resources(),[],[1,0,0,1,0,0],0);
  return {...tree,entries,layers:[...layers.values()].filter(l=>entries.some(e=>e.tags.includes(l.id))),page,doc};
  function visit(contentText,resources,parents,startMatrix,depth){
   if(depth>28)throw Error('กลุ่ม PDF ซ้อนลึกเกินรองรับ');
   const props=get(resources,'Properties'),xs=get(resources,'XObject'),scopes=[...parents],forms=new Map();
   let ops;
   try{ops=operations(contentText);}catch(error){
    if(!error.message.includes('Inline Image')||props)throw error;
    const entry={id:'o'+entries.length,label:'ภาพรวม · ลากกรอบเพื่อครอป',tags:parents.filter(Boolean).map(t=>t.id)};
    entries.push(entry);return {entries:[entry],whole:contentText,resources};
   }
  let text=null,tr=0,stack=[],matrix=startMatrix,matrices=[];
  for(const cmd of ops){
   const {op,args}=cmd;
   if(op==='q')matrices.push(matrix);if(op==='Q')matrix=matrices.pop()||[1,0,0,1,0,0];
   if(op==='cm')matrix=pdfjsLib.Util.transform(matrix,args.map(Number));
   if(op==='BDC'||op==='BMC'){
    const tag=args[0]==='/OC'?group(byToken(props,args[1]||'')):null;
    if(args[0]==='/OC'&&!tag)throw Error('อ่านกลุ่มเลเยอร์ของหน้านี้ไม่ได้');
    scopes.push(tag);cmd.omit=true;continue;
   }
   if(op==='EMC'){scopes.pop();cmd.omit=true;continue;}
   if(op==='q')stack.push(tr);if(op==='Q')tr=stack.pop()??0;
   if(op==='Tr')tr=Number(args[0]);
   if(op==='BT'||op==='ET')text=null;
   const path=/^(?:[fFsSbB]\*?|f\*)$/.test(op),show=['Tj','TJ',"'",'"'].includes(op);
   if(!path&&!show&&op!=='Do'&&op!=='sh')continue;
   if(show&&tr>=4)throw Error('ข้อความหน้านี้ใช้เป็น clipping mask กรุณา Outline ข้อความมาสก์ก่อนนำเข้า');
   let ppi=null;
   let label=path?'เส้นเวกเตอร์':show?'ข้อความ':op==='sh'?'ไล่สี':'กราฟิก',own=null;
   if(op==='Do'){const x=byToken(xs,args[0]);if(x){own=group(get(x.dict,'OC'));label=String(get(x.dict,'Subtype'))==='/Image'?'ภาพ':'กลุ่มกราฟิก';
    if(label==='กลุ่มกราฟิก'&&String(get(x.dict,'Subtype'))==='/Form'){
     const transform=get(x.dict,'Matrix')?.asArray().map(v=>v.asNumber())||[1,0,0,1,0,0];
     const child=visit(decoded(x),get(x.dict,'Resources')||resources,[...scopes,own],pdfjsLib.Util.transform(matrix,transform),depth+1);
     const name='/CartonNested'+forms.size+'_'+entries.length;
     if(xs.has(key(name.slice(1))))throw Error('ชื่อทรัพยากรชนกันใน PDF');
     cmd.child=child;cmd.args=[name];forms.set(name,{child,source:x});continue;
    }
    if(label==='ภาพ'){
     const unit=get(page.node,'UserUnit')?.asNumber()||1;
     ppi=Math.min(get(x.dict,'Width').asNumber()/Math.hypot(matrix[0],matrix[1]),get(x.dict,'Height').asNumber()/Math.hypot(matrix[2],matrix[3]))*72/unit;
    }}}
   const tags=[...scopes,own].filter(Boolean);
   if(!show||!text||text.tags.join()!==tags.map(t=>t.id).join()){
    const entry={id:'o'+entries.length,label:label+' '+(entries.length+1),tags:tags.map(t=>t.id),ppi};
    entries.push(entry);cmd.entry=entry;if(show)text=entry;
   }else cmd.entry=text;
   cmd.path=path;cmd.show=show;cmd.tr=tr;
  }
  return {ops,resources,forms};
  }
 }
 function program(m,ids){
  const used=new Set(),out=[],needsAdvance=new Set();
  const retained=e=>ids.has(e.id)||e.tags.some(t=>ids.has(t));
  let laterText=false;
  for(let i=m.ops.length-1;i>=0;i--){
   const cmd=m.ops[i];
   if(cmd.op==='ET'||cmd.op==='BT')laterText=false;
   if(cmd.show){if(retained(cmd.entry))laterText=true;else if(laterText)needsAdvance.add(cmd);}
  }
  for(const cmd of m.ops){
   if(cmd.omit)continue;
   const {op,args,entry}=cmd,statement=[...args,op].join(' ');
   if(cmd.child?.whole&&!cmd.child.entries.some(e=>ids.has(e.id)||e.tags.some(t=>ids.has(t))))continue;
   if(!entry||ids.has(entry.id)||entry.tags.some(t=>ids.has(t))){
    out.push(statement);if(op==='Do')used.add(args[0]);continue;
   }
   if(cmd.path)out.push('n');
   if(cmd.show&&needsAdvance.has(cmd))out.push('3 Tr\n'+statement+'\n'+cmd.tr+' Tr');
   else if(op==='"')out.push(args[0]+' Tw '+args[1]+' Tc');
  }
  return {bytes:binary(out.join('\n')),used};
 }
 async function component(m,ids){
  const {PDFDocument,PDFObjectCopier}=PDFLib,dest=await PDFDocument.create(),c=dest.context,copy=PDFObjectCopier.for(m.doc.context,c);
  function makeForm(tree,attrs,sourceDict){
   const raw=tree.whole?{bytes:binary(tree.whole)}:program(tree,ids);
   const resources=tree.resources?.clone()||m.doc.context.obj({}),xs=get(resources,'XObject');
   resources.delete(key('Properties'));
   let res;
   if(xs&&!tree.whole){
    resources.delete(key('XObject'));res=copy.copy(resources);const selected=c.obj({});
    for(const name of raw.used){
     const n=key(name.slice(1)),nested=tree.forms.get(name);
     if(nested){
      const form=makeForm(nested.child,{Type:'XObject',Subtype:'Form'},nested.source.dict);
      selected.set(n,c.register(form));
     }else{
      const stream=copy.copy(xs.lookup(n));stream.dict.delete(key('OC'));selected.set(n,c.register(stream));
     }
    }
    res.set(key('XObject'),selected);
   }else res=copy.copy(resources);
   const form=c.flateStream(raw.bytes,{...attrs,Resources:res});
   for(const k of ['Group','Matrix','BBox']){const value=get(sourceDict,k);if(value)form.dict.set(key(k),copy.copy(value));}
   return form;
  }
  const page=dest.addPage([m.view.width,m.view.height]);
  const form=makeForm(m,{Type:'XObject',Subtype:'Form',BBox:m.pdfView},m.page.node);
   const ref=c.register(form);page.node.set(key('Resources'),c.obj({XObject:{Art:ref}}));
   const [a,b,cc,d,e,f]=m.view.transform;
   page.node.set(key('Contents'),c.register(c.flateStream('q '+[a,-b,cc,-d,e,m.view.height-f].join(' ')+' cm /Art Do Q')));
   return dest.save();
 }
 async function thumbnail(bytes){
  const task=pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,BinaryDataFactory:Resources,useSystemFonts:false});
  try{
   const page=await (await task.promise).getPage(1),base=page.getViewport({scale:1}),scale=Math.min(4,2600/Math.max(base.width,base.height));
   const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await page.render({canvas,canvasContext:canvas.getContext('2d',{alpha:true,willReadFrequently:true}),viewport,background:'rgba(0,0,0,0)'}).promise;
   const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   let l=canvas.width,t=canvas.height,r=0,b=0;
   for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]){l=Math.min(l,x);r=Math.max(r,x+1);t=Math.min(t,y);b=Math.max(b,y+1);}
   if(r<=l||b<=t)throw Error('ส่วนที่เลือกไม่มีภาพที่มองเห็น');
   l=Math.max(0,l-1);t=Math.max(0,t-1);r=Math.min(canvas.width,r+1);b=Math.min(canvas.height,b+1);
   const cut=document.createElement('canvas');cut.width=r-l;cut.height=b-t;
   cut.getContext('2d').drawImage(canvas,-l,-t);
   const bbox={left:l/scale,bottom:Math.max(0,base.height-b/scale),right:Math.min(base.width,r/scale),top:base.height-t/scale};
   const w=bbox.right-bbox.left,h=bbox.top-bbox.bottom,url=cut.toDataURL('image/png'),img=new Image();img.src=url;await img.decode();
   return {url,img,ratio:w/h,mmWidth:w*ptMM,native:{bytes,bbox}};
  }finally{await task.destroy();}
 }
 async function extract(ids,name){const bytes=await component(model,new Set(ids));const selected=model.entries.filter(e=>ids.includes(e.id)||e.tags.some(t=>ids.includes(t)));
  const imagePpis=selected.map(e=>e.ppi).filter(Number.isFinite);
  return {...await thumbnail(bytes),name,ppi:imagePpis.length?Math.min(...imagePpis):null};}
 function chosen(){return [...$('partList').querySelectorAll(':checked')].map(n=>({id:n.value,label:n.parentNode.textContent}));}
 let cached=null,drag=null;
 function buttons(){const valid=!!cached&&!busy;$('partsMerge').disabled=!valid;$('partsSeparate').disabled=!valid;$('partsClose').disabled=busy;$('partPage').disabled=busy;$('partMode').disabled=busy;$('partList').inert=busy;$('selectParts').disabled=busy;}
 async function preview(){
  const token=++revision,chosenParts=chosen();cached=null;buttons();$('partPreview').removeAttribute('src');
  $('cropReset').hidden=true;
  if(!chosenParts.length){$('partInfo').textContent='เลือกชิ้นงานเพื่อดูตัวอย่าง';return;}
  $('partInfo').textContent='กำลังอ่านส่วนที่เลือก…';
  try{const part=await extract(chosenParts.map(p=>p.id),chosenParts.map(p=>p.label).join(' + '));if(token!==revision)return;
   cached=part;$('partPreview').src=part.url;$('partInfo').textContent=fmt(part.mmWidth)+' × '+fmt(part.mmWidth/part.ratio)+' มม. · PDF คงต้นฉบับ / SVG ฝังภาพโปร่งใส';
  }catch(e){if(token===revision)$('partInfo').textContent=e.message;}
  buttons();
 }
 function list(){
  const entries=$('partMode').value==='layer'?model.layers:model.entries;
  const frag=document.createDocumentFragment();
  for(const e of entries){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=e.id;label.append(input,document.createTextNode(e.label));frag.append(label);}
  $('partList').replaceChildren(frag);preview();
 }
 async function pageChanged(){
  const token=++revision;cached=null;model=null;buttons();$('partList').replaceChildren();$('partPreview').removeAttribute('src');
  try{const n=+$('partPage').value,pg=await source.reader.getPage(n);
   if(token!==revision)return;
   model=analyze(source.doc,source.doc.getPage(n-1));model.view=pg.getViewport({scale:1});model.pdfView=pg.view;
   $('partMode').options[0].disabled=!model.layers.length;$('partMode').value=model.layers.length?'layer':'object';list();
  }catch(e){$('partInfo').textContent=e.message;}
 }
 async function importSelected(separate){
  if(!cached||busy)return;
  busy=true;buttons();const parts=chosen(),combined=cached;
  try{
   const result=[];if(separate&&parts.length>1){for(const p of parts){$('partInfo').textContent='กำลังเตรียม '+p.label;result.push(await extract([p.id],p.label));}}else result.push(combined);
   result.forEach(registerAsset);$('status').textContent='เพิ่ม '+result.length+' ชิ้นแล้ว · คลิกหรือลากไปวางบนแผงกล่อง';$('pdfParts').close();
  }catch(e){$('partInfo').textContent=e.message;}finally{busy=false;buttons();}
 }
 let initialized=false;
 function init(){
  if(initialized)return;initialized=true;
  $('selectParts').onclick=()=>{const inputs=[...$('partList').querySelectorAll('input')],value=inputs.some(e=>!e.checked);inputs.forEach(e=>e.checked=value);preview();};
  const img=$('partPreview');
  function pointer(e){const r=img.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
  img.draggable=false;img.style.touchAction='none';img.style.cursor='crosshair';
  img.onpointerdown=e=>{if(!cached||busy)return;drag=pointer(e);img.setPointerCapture(e.pointerId);};
  const box=document.createElement('div');box.className='part-crop-box';box.hidden=true;img.parentNode.append(box);
  img.onpointermove=e=>{if(!drag)return;const end=pointer(e),r=img.getBoundingClientRect(),parent=img.parentNode.getBoundingClientRect();box.hidden=false;
   Object.assign(box.style,{left:r.left-parent.left+Math.min(end[0],drag[0])*r.width+'px',top:r.top-parent.top+Math.min(end[1],drag[1])*r.height+'px',width:Math.abs(end[0]-drag[0])*r.width+'px',height:Math.abs(end[1]-drag[1])*r.height+'px'});};
  img.onpointercancel=()=>{drag=null;box.hidden=true;};
  img.onpointerup=async e=>{
   img.parentNode.querySelector('.part-crop-box').hidden=true;
   if(!drag||!cached)return;const previous=cached,token=revision,end=pointer(e),x=Math.min(drag[0],end[0]),y=Math.min(drag[1],end[1]),w=Math.abs(drag[0]-end[0]),h=Math.abs(drag[1]-end[1]);drag=null;
   if(w<.015||h<.015)return;
   const box=previous.native.bbox,bw=box.right-box.left,bh=box.top-box.bottom;
   const bbox={left:box.left+x*bw,right:box.left+(x+w)*bw,top:box.top-y*bh,bottom:box.top-(y+h)*bh};
   const c=document.createElement('canvas'),src=previous.img;c.width=Math.max(1,Math.round(src.naturalWidth*w));c.height=Math.max(1,Math.round(src.naturalHeight*h));
   c.getContext('2d').drawImage(src,x*src.naturalWidth,y*src.naturalHeight,w*src.naturalWidth,h*src.naturalHeight,0,0,c.width,c.height);
   const cropped=new Image();cropped.src=c.toDataURL();await cropped.decode();if(token!==revision||cached!==previous)return;
   cached={...previous,img:cropped,url:cropped.src,mmWidth:bw*w*ptMM,ratio:bw*w/(bh*h),native:{...previous.native,bbox}};
   img.src=cropped.src;$('cropReset').hidden=false;$('partInfo').textContent='กรอบครอป '+fmt(cached.mmWidth)+' × '+fmt(cached.mmWidth/cached.ratio)+' มม.';
   $('partsSeparate').disabled=chosen().length>1;
  };
  $('cropReset').onclick=()=>preview();
  $('partPage').onchange=pageChanged;$('partMode').onchange=()=>{if(model)list();};$('partList').onchange=preview;
  $('partsSeparate').onclick=()=>importSelected(true);$('partsMerge').onclick=()=>importSelected(false);
  $('partsClose').onclick=()=>$('pdfParts').close();$('pdfParts').oncancel=e=>{if(busy)e.preventDefault();};
 }
 async function open(file){
  init();$('status').textContent='กำลังอ่าน PDF…';await load();
  const bytes=new Uint8Array(await file.arrayBuffer()),task=pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,BinaryDataFactory:Resources});
  try{
   const reader=await task.promise,doc=await PDFLib.PDFDocument.load(bytes);
   source={reader,doc};$('partPage').replaceChildren(...doc.getPages().map((_,i)=>new Option('หน้า '+(i+1),i+1)));
   $('pdfName').textContent=file.name;$('pdfParts').showModal();const closed=new Promise(resolve=>$('pdfParts').addEventListener('close',resolve,{once:true}));
   await pageChanged();await closed;
  }finally{++revision;source=model=cached=null;await task.destroy();}
 }
 // Insert native PDF forms in the same stacking order as ordinary SVG artwork and cutting guides.
 async function compose(el,width,height,items,assets){
  const doc=await PDFLib.PDFDocument.create(),page=doc.addPage([width/ptMM,height/ptMM]),forms=new Map(),chunk=el.cloneNode(false);
  function place(form,x,y,w,h){page.drawPage(form,{x:x/ptMM,y:(height-y-h)/ptMM,width:w/ptMM,height:h/ptMM});}
  async function flush(){
   if(!chunk.childNodes.length)return;
   const pdf=new jspdf.jsPDF({unit:'mm',format:[width,height],orientation:width>=height?'landscape':'portrait',compress:true});
   chunk.style.cssText='position:absolute;left:-99999px;top:0';document.body.append(chunk);
   try{await pdf.svg(chunk,{x:0,y:0,width,height});const [form]=await doc.embedPdf(pdf.output('arraybuffer'),[0]);place(form,0,0,width,height);}
   finally{chunk.remove();chunk.replaceChildren();}
  }
  for(const child of Array.from(el.children)){
   const index=child.getAttribute('data-item'),asset=index==null?null:assets[items[Number(index)].asset];
   if(!asset?.native){chunk.append(child.cloneNode(true));continue;}
   await flush();if(!forms.has(asset)){
    const original=await PDFLib.PDFDocument.load(asset.native.bytes);
    forms.set(asset,await doc.embedPage(original.getPage(0),asset.native.bbox));
   }
   place(forms.get(asset),...['x','y','width','height'].map(k=>Number(child.getAttribute(k))));
  }
  await flush();return doc.save();
 }
 async function svgBitmap(asset,mmWidth){
  const task=pdfjsLib.getDocument({data:asset.native.bytes.slice(),isEvalSupported:false,useWorkerFetch:false,BinaryDataFactory:Resources});
  try{
   const page=await (await task.promise).getPage(1),b=asset.native.bbox,w=b.right-b.left,h=b.top-b.bottom;
   const scale=Math.min(mmWidth/25.4*600/w,8192/Math.max(w,h),Math.sqrt(16000000/(w*h)));
   const view=page.getViewport({scale}),c=document.createElement('canvas');c.width=Math.ceil(w*scale);c.height=Math.ceil(h*scale);
   await page.render({canvas:c,canvasContext:c.getContext('2d',{alpha:true}),viewport:view,transform:[1,0,0,1,-b.left*scale,b.top*scale-view.height],background:'rgba(0,0,0,0)'}).promise;return c.toDataURL('image/png');
  }finally{await task.destroy();}
 }
 return {open,compose,svgBitmap,load,analyze,component,Resources,operations,decoded};
})();
