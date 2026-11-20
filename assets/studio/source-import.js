// Vector documents are rendered locally as high-resolution OCR references.
// Page geometry is kept separately in mm, regardless of the reference pixel budget.
const StudioSourceImport=(()=>{
  const mmPerPt=25.4/72,mmPerPx=25.4/96;
  const unitMM={mm:1,cm:10,q:.25,in:25.4,pt:mmPerPt,pc:25.4/6,px:mmPerPx,'':mmPerPx};
  function dimensions(w,h){
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1||w>1000||h>1000)
      throw Error('ขนาดหน้าต้องอยู่ในช่วง 1–1000 มม. ต่อด้าน');
    const scale=Math.min(600/25.4,8192/Math.max(w,h),Math.sqrt(16000000/(w*h)));
    return {width:w,height:h,pw:Math.max(1,Math.round(w*scale)),ph:Math.max(1,Math.round(h*scale)),dpi:Math.round(scale*25.4)};
  }
  function canvas(size){
    const c=document.createElement('canvas');c.width=size.pw;c.height=size.ph;return c;
  }
  function lengthInMM(value){
    const m=String(value||'').trim().match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|q|in|pt|pc|px)?$/i);
    if(!m)return null;
    if(!(Number(m[1])>0))throw Error('ความกว้างและความสูงใน SVG ต้องมากกว่า 0');
    const unit=(m[2]||'').toLowerCase();return {mm:Number(m[1])*unitMM[unit],pixel:unit===''||unit==='px'};
  }
  function geometry(svg,fallbackWidth){
    const w=lengthInMM(svg.style.width||svg.getAttribute('width')),h=lengthInMM(svg.style.height||svg.getAttribute('height'));
    const raw=svg.getAttribute('viewBox'),v=raw?.trim().split(/[\s,]+/).map(Number);
    if(raw&&!(v.length===4&&v.every(Number.isFinite)&&v[2]>0&&v[3]>0))throw Error('viewBox ของ SVG ไม่ถูกต้อง');
    const ratio=v?v[2]/v[3]:null;
    let width=w?.mm,height=h?.mm,reason='SVG · ขนาดที่ระบุในไฟล์',naturalBox=null;
    if(!width||!height){
      if(!ratio){
        // A standalone SVG without an intrinsic size needs a concrete viewport.
        // The 300 × 150 CSS-pixel default is only a reference for the artwork.
        const viewportW=width?width/mmPerPx:300,viewportH=height?height/mmPerPx:150;
        naturalBox=[0,0,viewportW,viewportH];width??=height?height*viewportW/viewportH:fallbackWidth;
        height??=width*viewportH/viewportW;
        reason='SVG · ระบุขนาดไม่ครบและไม่มี viewBox ใช้กรอบอ้างอิง '+Number(viewportW.toFixed(2))+' × '+Number(viewportH.toFixed(2))+' px กรุณาตรวจขนาดพิมพ์';
      }else if(!width&&!height){width=fallbackWidth;height=width/ratio;reason='SVG · มีเฉพาะสัดส่วน ใช้ความกว้างใน Studio กรุณาตรวจขนาดพิมพ์';}
      else{width??=height*ratio;height??=width/ratio;reason='SVG · คำนวณอีกด้านจาก viewBox';}
    }
    if(w?.pixel||h?.pixel)reason+=' · แปลง px ที่ 96 px/นิ้ว';
    return {...dimensions(width,height),reason,viewBox:v||naturalBox||[0,0,width/mmPerPx,height/mmPerPx]};
  }
  async function svgFile(file,fallbackWidth){
    const doc=new DOMParser().parseFromString(await file.text(),'image/svg+xml'),svg=doc.documentElement;
    if(svg.localName!=='svg'||svg.namespaceURI!=='http://www.w3.org/2000/svg'||doc.querySelector('parsererror'))throw Error('เปิด SVG ไม่ได้ ตรวจรูปแบบไฟล์');
    const size=geometry(svg,fallbackWidth);
    for(const node of svg.querySelectorAll('image,use,feImage')){
      const href=(node.getAttribute('href')||node.getAttributeNS('http://www.w3.org/1999/xlink','href')||'').trim();
      if(href&&!/^(#|data:)/i.test(href))throw Error('SVG มีภาพหรือวัตถุที่ลิงก์ไปไฟล์อื่น กรุณา Embed แล้วบันทึก SVG อีกครั้ง');
    }
    if(!svg.hasAttribute('viewBox'))svg.setAttribute('viewBox',size.viewBox.join(' '));
    svg.setAttribute('width',size.pw);svg.setAttribute('height',size.ph);
    svg.style.setProperty('width',size.pw+'px','important');svg.style.setProperty('height',size.ph+'px','important');
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
    try{
      const c=canvas(size),img=await imgFrom(url);c.getContext('2d').drawImage(img,0,0);
      return {src:c.toDataURL('image/png'),size,reason:size.reason};
    }finally{URL.revokeObjectURL(url);}
  }

  const scripts=new Map();
  function localScript(file){
    if(!scripts.has(file))scripts.set(file,new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src='assets/vendor/pdf-import/'+file;s.onload=resolve;
      s.onerror=()=>{s.remove();scripts.delete(file);reject(Error('เปิดตัวอ่าน PDF ไม่ได้ กรุณาแตก ZIP ทั้งโฟลเดอร์'));};document.head.append(s);
    }));
    return scripts.get(file);
  }
  class PdfResources{
    async fetch({kind,filename}){
      const base64=globalThis.studioPdfAssets[kind]?.[filename];
      if(!base64)throw Error('ไม่พบข้อมูลแสดง PDF '+filename);
      return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
    }
  }
  function selectPage(count){
    if(count===1)return Promise.resolve(1);
    const dialog=$('pdfPageDialog'),input=$('pdfPageNumber');input.max=count;input.value=1;
    $('pdfPageCount').textContent='ไฟล์มี '+count+' หน้า';dialog.returnValue='';
    return new Promise(resolve=>{
      dialog.addEventListener('close',()=>resolve(dialog.returnValue==='open'?input.valueAsNumber:0),{once:true});
      dialog.showModal();input.focus();
    });
  }
  function paperBox(page,metadata){
    const view=page.view;
    if(metadata?.node.TrimBox()){
      const t=metadata.getTrimBox(),box=[t.x,t.y,t.x+t.width,t.y+t.height];
      // An ill-formed TrimBox can protrude beyond the page PDF.js can render.
      if(box.every(Number.isFinite)&&t.width>0&&t.height>0&&box[0]>=view[0]&&box[1]>=view[1]&&box[2]<=view[2]&&box[3]<=view[3])
        return {box,name:'TrimBox · ขนาดหลังตัด'};
    }
    return {box:view,name:metadata?(metadata.node.CropBox()?'CropBox · ขนาดหน้าที่มองเห็น':'MediaBox · ขนาดหน้ากระดาษ'):'ขนาดหน้าที่มองเห็น'};
  }
  function viewportRect(viewport,box){
    const [a,b,c,d]=viewport.convertToViewportRectangle(box);
    return {left:Math.min(a,c),top:Math.min(b,d),w:Math.abs(c-a),h:Math.abs(d-b)};
  }
  async function pdfFile(file){
    await Promise.all(['pdf.js','pdf-worker.js','pdf-boxes.js','resources.js'].map(localScript));
    const bytes=new Uint8Array(await file.arrayBuffer());
    const task=pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,
      BinaryDataFactory:PdfResources,useSystemFonts:false});
    try{
      const doc=await task.promise,number=await selectPage(doc.numPages);
      if(!number)return null;
      const page=await doc.getPage(number);
      let metadata=null;
      try{metadata=(await PDFLib.PDFDocument.load(bytes,{updateMetadata:false})).getPage(number-1);}catch{/* PDF.js can recover some damaged page dictionaries. */}
      const {box,name}=paperBox(page,metadata),unit=page.getViewport({scale:1});
      const rect=viewportRect(unit,box),size=dimensions(rect.w*mmPerPt,rect.h*mmPerPt);
      const c=canvas(size),sx=size.pw/rect.w,sy=size.ph/rect.h;
      await page.render({canvas:c,viewport:unit,transform:[sx,0,0,sy,-rect.left*sx,-rect.top*sy],background:'white'}).promise;
      return {src:c.toDataURL('image/png'),size,reason:'PDF หน้า '+number+'/'+doc.numPages+' · '+name};
    }catch(e){
      if(e.name==='PasswordException')throw Error('PDF นี้ต้องใช้รหัสผ่าน กรุณาเปิดไฟล์แล้วบันทึกสำเนาที่ปลดล็อก');
      throw e;
    }finally{await task.destroy();}
  }
  function kind(file){
    const ext=file.name.split('.').pop().toLowerCase();
    if(file.type==='application/pdf'||ext==='pdf')return 'pdf';
    if(file.type==='image/svg+xml'||ext==='svg')return 'svg';
    return 'bitmap';
  }
  return {kind,svgFile,pdfFile};
})();
