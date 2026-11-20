// OCR runs entirely inside a worker. The trained language data are shipped with the editor.
const StudioTrace = (() => {
  const bytes = encoded => Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  let assetsLoading;
  function loadAssets() {
    if (!assetsLoading) assetsLoading = new Promise((resolve,reject) => {
      const script=document.createElement('script');
      script.src='assets/studio/recognizer-data.js';
      script.onload=resolve;
      script.onerror=()=>{assetsLoading=null;reject(new Error('โหลดชุดภาษาไม่ได้ กรุณาแตก ZIP ทั้งโฟลเดอร์'));};
      document.head.append(script);
    });
    return assetsLoading;
  }
  function canvasFrom(image) {
    const factor=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));
    canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return {canvas,ctx};
  }
  function detectBarcode(ctx,w,h) {
    const rgba=ctx.getImageData(0,0,w,h).data;
    const gray=new Uint8ClampedArray(w*h);
    for(let i=0;i<gray.length;i++)gray[i]=(rgba[4*i]+rgba[4*i+1]*2+rgba[4*i+2])/4;
    const hints=new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.ITF]]]);
    const result=new ZXing.MultiFormatReader().decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.RGBLuminanceSource(gray,w,h))),hints);
    const code=result.getText(),points=result.getResultPoints();
    if(!isValidGtin(code,code.length)||![13,14].includes(code.length)||points.length<2)return null;
    const y=Math.min(h-1,Math.max(0,Math.round(points[0].getY())));
    let left=Math.floor(Math.min(...points.map(p=>p.getX()))),right=Math.ceil(Math.max(...points.map(p=>p.getX())));
    const dark=(x,yy)=>gray[yy*w+x]<145;
    // Decoder endpoints fall inside guard bars. Extend through the nearby guard modules.
    const estimated=Math.max(1,(right-left)/(code.length===13?92:110));
    for(const direction of [-1,1]){
      let x=direction<0?left:right,last=x,blank=0;
      while(x>=0&&x<w && blank<Math.ceil(estimated*4.3)){if(dark(x,y)){last=x;blank=0;}else blank++;x+=direction;}
      if(direction<0)left=last;else right=last;
    }
    const fraction=yy=>{let same=0,n=0;for(let x=left;x<=right;x++)if(dark(x,y)){n++;if(dark(x,yy))same++;}return n?same/n:0;};
    let top=y,bottom=y;while(top>0&&fraction(top-1)>.83)top--;while(bottom<h-1&&fraction(bottom+1)>.83)bottom++;
    return {type:'barcode',text:code,x:left,y:top,w:right-left+1,h:bottom-top+1};
  }
  function qrRegion(ctx,w,h){
    const px=ctx.getImageData(0,0,w,h).data,gray=new Uint8ClampedArray(w*h);
    for(let i=0;i<gray.length;i++)gray[i]=(px[4*i]+2*px[4*i+1]+px[4*i+2])/4;
    const decoder=new ZXing.QRCodeReader();
    const bitmap=new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.RGBLuminanceSource(gray,w,h)));
    const result=decoder.decode(bitmap),[bl,tl,tr]=result.getResultPoints();
    const vx=tr.getX()-tl.getX(),vy=tr.getY()-tl.getY(),ux=bl.getX()-tl.getX(),uy=bl.getY()-tl.getY();
    const module=typeof tl.getEstimatedModuleSize==='function'?tl.getEstimatedModuleSize():Math.min(Math.hypot(vx,vy),Math.hypot(ux,uy))/20;
    const margin=Math.ceil(module*4.1);
    const xs=[bl.getX(),tl.getX(),tr.getX(),bl.getX()+vx],ys=[bl.getY(),tl.getY(),tr.getY(),bl.getY()+vy];
    const x=Math.max(0,Math.floor(Math.min(...xs))-margin),y=Math.max(0,Math.floor(Math.min(...ys))-margin);
    return {type:'crop',name:'QR Code',text:'',x,y,w:Math.min(w,Math.ceil(Math.max(...xs))+margin+1)-x,h:Math.min(h,Math.ceil(Math.max(...ys))+margin+1)-y};
  }
  function splitFields(line){
    const words=(line.words||[]).filter(w=>w.text?.trim()&&w.bbox);
    if(words.length<2)return [line];
    const height=Math.max(1,line.bbox.y1-line.bbox.y0),groups=[];
    let active=[];
    function finish(){
      if(!active.length)return;
      groups.push({text:active.map(w=>w.text.trim()).join(' '),confidence:Math.round(active.reduce((n,w)=>n+w.confidence,0)/active.length),
        bbox:{x0:Math.min(...active.map(w=>w.bbox.x0)),y0:Math.min(...active.map(w=>w.bbox.y0)),x1:Math.max(...active.map(w=>w.bbox.x1)),y1:Math.max(...active.map(w=>w.bbox.y1))}});
      active=[];
    }
    for(const word of words){
      if(active.length&&word.bbox.x0-active[active.length-1].bbox.x1>height*.55)finish();
      active.push(word);
      if(/[:：]$/.test(word.text.trim()))finish();
    }
    finish();return groups.length>1?groups:[line];
  }
  function linkCaption(layers){
    const code=layers.find(o=>o.type==='barcode');if(!code)return layers;
    const digits=layers.filter(o=>o.type==='text'&&/^\d+$/.test(o.text.replace(/\s/g,''))&&o.y>=code.y+code.h-3&&o.y<code.y+code.h*1.5&&o.x>=code.x-code.w*.18&&o.x+o.w<=code.x+code.w*1.18).sort((a,b)=>a.x-b.x);
    if(!digits.length||digits.map(o=>o.text.replace(/\s/g,'')).join('')!==code.text)return layers;
    const x=Math.min(code.x,...digits.map(o=>o.x)),r=Math.max(code.x+code.w,...digits.map(o=>o.x+o.w)),top=Math.min(...digits.map(o=>o.y)),end=Math.max(...digits.map(o=>o.y+o.h));
    const width=r-x,height=end-code.y;
    code.caption={start:(code.x-x)/width,width:code.w/width,bar:code.h/height,top:(top-code.y)/height,height:(end-top)/height,left:.03,right:.97};
    code.x=x;code.w=width;code.h=height;
    return layers.filter(o=>!digits.includes(o));
  }
  function findRules(ctx,w,h){
    const px=ctx.getImageData(0,0,w,h).data;
    const rules=[];
    for(const vertical of [false,true]){
      const length=vertical?h:w,depth=vertical?w:h,threshold=Math.max(20,Math.round(length*(vertical?.22:.15)));
      let previous=[];
      for(let j=0;j<depth;j++){
        const next=[];let start=-1;
        for(let i=0;i<=length;i++){
          const index=4*(vertical?i*w+j:j*w+i);
          const dark=i<length&&px[index]+px[index+1]+px[index+2]<390;
          if(dark&&start<0)start=i;
          if(!dark&&start>=0){
            if(i-start>=threshold){
              let run=previous.find(r=>Math.abs(r.a-start)<=3&&Math.abs(r.b-i)<=3);
              if(!run){run={a:start,b:i,first:j,last:j,vertical};rules.push(run);}
              run.last=j;next.push(run);
            }
            start=-1;
          }
        }
        previous=next;
      }
    }
    function alongsideText(r){
      if(!r.vertical||r.b-r.a>h*.35)return false;
      if(rules.some(edge=>!edge.vertical&&edge.a<=r.last+2&&edge.b>=r.first-2&&
        (Math.abs(edge.first-r.a)<5||Math.abs(edge.last-r.b)<5)))return false;
      const length=r.b-r.a,reach=Math.ceil(length*.8);
      let occupied=0,rows=0;
      for(let y=Math.ceil(r.a+length*.18);y<r.b-length*.18;y++){
        rows++;
        for(let x=Math.max(0,r.first-reach);x<=Math.min(w-1,r.last+reach);x++){
          if(x>=r.first-1&&x<=r.last+1)continue;
          const n=4*(y*w+x);
          if(px[n]+px[n+1]+px[n+2]<390){occupied++;break;}
        }
      }
      return occupied>rows*.3;
    }
    return rules.filter(r=>r.last-r.first<Math.max(6,Math.min(w,h)*.015)&&!alongsideText(r)).map(r=>r.vertical?
      {type:'rect',x:r.first,y:r.a,w:r.last-r.first+1,h:r.b-r.a,solid:true}:
      {type:'rect',x:r.a,y:r.first,w:r.b-r.a,h:r.last-r.first+1,solid:true}).slice(0,160);
  }
  function inkBounds(ctx,box,original){
    // Use the cleaned OCR image so rules and decoded bars do not inflate text size.
    // Separate neighbouring lines at a clear horizontal gap while keeping Thai marks.
    const x=Math.max(0,box.x0),y=Math.max(0,box.y0);
    const w=Math.min(ctx.canvas.width,box.x1)-x,h=Math.min(ctx.canvas.height,box.y1)-y;
    if(w<2||h<2)return box;
    const px=ctx.getImageData(x,y,w,h).data;
    const rows=[];
    for(let j=0;j<h;j++){
      let left=w,right=-1,count=0;
      for(let i=0;i<w;i++){
        const n=4*(j*w+i);
        if(px[n]+2*px[n+1]+px[n+2]<580){left=Math.min(left,i);right=i;count++;}
      }
      rows.push({left,right,count});
    }
    // Clip a neighbouring frame or underline that touches the edge of a text box.
    let start=0,limit=h;
    if(w>=60&&h>=8){
      for(let j=0;j<h;j++){
        if(j>h*.25&&j<h*.68)continue;
        let run=0;
        for(let i=0;i<w;i++){
          const n=4*((y+j)*ctx.canvas.width+x+i);
          run=original[n]+2*original[n+1]+original[n+2]<580?run+1:0;
          if(run>w*.72){
            if(j<=h*.25)start=j+1;else limit=Math.min(limit,j);
            break;
          }
        }
      }
    }
    const bands=[];
    const gap=Math.max(3,Math.ceil(h*.11));
    for(let j=start;j<limit;j++){
      const r=rows[j];if(!r.count)continue;
      let band=bands[bands.length-1];
      if(!band||j-band.end>gap){band={start:j,end:j,left:w,right:-1,total:0};bands.push(band);}
      band.end=j;band.left=Math.min(band.left,r.left);band.right=Math.max(band.right,r.right);band.total+=r.count;
    }
    const best=bands.sort((a,b)=>b.total-a.total)[0];
    return best?{x0:x+best.left,x1:x+best.right+1,y0:y+best.start,y1:y+best.end+1}:box;
  }
  async function extract(image,width,height,progress,preserve=false){
    const {canvas,ctx}=canvasFrom(image),w=canvas.width,h=canvas.height,layers=[];
    const original=ctx.getImageData(0,0,w,h).data;
    const erase=o=>{ctx.fillStyle='white';ctx.fillRect(o.x-1,o.y-1,o.w+2,o.h+2);};
    try{const code=detectBarcode(ctx,w,h);if(code){layers.push(code);erase(code);}}catch{/* No supported readable symbol in this image. */}
    if(preserve)try{const qr=qrRegion(ctx,w,h);layers.push(qr);erase(qr);}catch{/* A graphic that cannot be decoded stays on the source backdrop. */}
    const rules=findRules(ctx,w,h);rules.forEach(erase);layers.push(...rules);
    await loadAssets();
    const source=URL.createObjectURL(new Blob([bytes(ocrAssets.worker)],{type:'text/javascript'}));
    let worker,english;
    try{
      worker=await Tesseract.createWorker(['tha','eng'].map(code=>({code,data:bytes(ocrAssets[code])})),1,{
        workerPath:source,workerBlobURL:false,cacheMethod:'none',logger:m=>progress(m.status,m.progress)
      });
      await worker.setParameters({tessedit_pageseg_mode:'11'});
      const {data}=await worker.recognize(canvas);
      const lines=data.lines||[];
      for(const line of preserve?lines.flatMap(splitFields):lines){
        const value=line.text.trim();if(!value)continue;
        const {x0,y0,x1,y1}=inkBounds(ctx,line.bbox,original);
        const sizeMM=(y1-y0)*height/h;
        const latin=(value.match(/[a-z]/gi)||[]).length,thai=(value.match(/[ก-๛]/g)||[]).length;
        let alternate;
        if(latin>=8&&thai>0&&thai<latin/3){
          // A bilingual OCR pass can read a short Latin prefix as Thai.
          // Keep both readings until their rendered outlines have been compared with the source.
          try{
            if(!english){
              english=await Tesseract.createWorker([{code:'eng',data:bytes(ocrAssets.eng)}],1,{workerPath:source,workerBlobURL:false,cacheMethod:'none'});
              await english.setParameters({tessedit_pageseg_mode:'7'});
            }
            const left=Math.max(0,x0-4),top=Math.max(0,y0-3);
            const rectangle={left,top,width:Math.min(w,x1+4)-left,height:Math.min(h,y1+3)-top};
            const retry=await english.recognize(canvas,{rectangle});
            const text=retry.data.text.trim().replace(/\s+/g,' ');
            if(text&&text!==value)alternate={text,confidence:Math.round(retry.data.confidence)};
          }catch{/* An optional second reading must not discard the bilingual result. */}
        }
        layers.push({type:'text',alternate,text:value,x:x0,y:y0,w:x1-x0,h:y1-y0,pt:Math.max(2,sizeMM*72/25.4*1.13),confidence:Math.round(line.confidence)});
      }
    }finally{if(english)await english.terminate();if(worker)await worker.terminate();URL.revokeObjectURL(source);}
    return (preserve?linkCaption(layers):layers).map(o=>({...o,x:o.x*width/w,y:o.y*height/h,w:o.w*width/w,h:o.h*height/h,review:true}));
  }
  return {extract};
})();
