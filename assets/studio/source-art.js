// The source patch carries appearance independently of the stored transcription.
const SourceArt=(()=>{
  const styleKeys=['text','font','pt','leading','tracking','baseline','markDrop','sx','sy','pair','kern','align','color','solid','stroke'];
  function styleValue(o,key){return key==='markDrop'?(o[key]??0):o[key];}
  function appearance(o){return Object.fromEntries(styleKeys.map(k=>[k,styleValue(o,k)]));}
  function original(o){return o.sourcePatch&&!o.fixedInk&&!ThaiMarks.active(o)&&styleKeys.every(k=>styleValue(o.sourcePatch.style,k)===styleValue(o,k));}
  function canReuseNumerals(o){
    if(o.markDrop||ThaiMarks.active(o))return false;
    const patch=o.sourcePatch;
    const same=style=>style&&styleKeys.every(k=>k==='text'||styleValue(style,k)===styleValue(o,k));
    return same(patch.style)||(patch.style.text!==o.text&&same(patch.calibrated));
  }
  function makeCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function bounds(r,w,h){
    const x=Math.max(0,Math.min(w-1,Math.round(r.x*w))),y=Math.max(0,Math.min(h-1,Math.round(r.y*h)));
    return {x,y,w:Math.max(1,Math.min(w,Math.round((r.x+r.w)*w))-x),h:Math.max(1,Math.min(h,Math.round((r.y+r.h)*h))-y)};
  }
  // Most frequent perimeter colour supplies the paper under letters when moving or editing.
  function paper(data,w,h){
    const freq=new Map();
    function add(i){const k=(data[i]<<16)|(data[i+1]<<8)|data[i+2];freq.set(k,(freq.get(k)||0)+1);}
    for(let x=0;x<w;x++){add(x*4);add(((h-1)*w+x)*4);}
    for(let y=0;y<h;y++){add(y*w*4);add((y*w+w-1)*4);}
    let key=0xffffff,max=0;
    for(const [k,n] of freq)if(n>max){key=k;max=n;}
    return [key>>16,(key>>8)&255,key&255];
  }
  // A quantity followed by a printed unit is common on carton labels. Split only
  // when the leading digits form isolated ink columns with a measurable word gap.
  function quantityPatch(o,c,bg){
    const original=o.sourcePatch?.style.text||'';
    const match=original.match(/^(\s*)([0-9]{1,5})(\s+)([^0-9\s].*)$/u);
    if(o.type!=='text'||o.numeric||!match||c.width*c.height>2000000)return;
    const ctx=c.getContext('2d'),w=c.width,h=c.height,rgba=ctx.getImageData(0,0,w,h).data;
    const rgb=[1,3,5].map(k=>parseInt(o.color.slice(k,k+2),16)),axis=rgb.map((n,k)=>n-bg[k]);
    const length=axis.reduce((a,n)=>a+n*n,0);if(length<400)return;
    const count=match[2].length,spans=[];let span;
    for(let x=0;x<w;x++){
      let top=h,bottom=-1;
      for(let y=0;y<h;y++){
        const i=4*(y*w+x);
        if(rgba[i+3]*axis.reduce((a,n,k)=>a+n*(rgba[i+k]-bg[k]),0)<100*length)continue;
        top=Math.min(top,y);bottom=y;
      }
      if(bottom<0){span=null;continue;}
      if(!span){span={x,end:x,top,bottom};spans.push(span);}
      span.end=x;span.top=Math.min(span.top,top);span.bottom=Math.max(span.bottom,bottom);
      if(spans.length>count)break;
    }
    if(spans.length<=count)return;
    const digits=spans.slice(0,count),last=digits[count-1],next=spans[count];
    const y=Math.min(...digits.map(d=>d.top)),height=Math.max(...digits.map(d=>d.bottom))-y+1;
    const gap=next.x-last.end-1,inside=Math.max(0,...digits.slice(1).map((d,j)=>d.x-digits[j].end-1));
    if(height<7||gap<Math.max(2,height*.10,inside*1.25)||
        digits.some(d=>d.bottom-d.top+1<height*.70||d.end-d.x+1>height*1.25))return;
    const cut=last.end+1+Math.floor(gap/2);
    const suffix=makeCanvas(w-cut,h);suffix.getContext('2d').drawImage(c,-cut,0);
    o.quantity={digits:match[2],unit:match[4],cut,w,h,left:digits[0].x,top:y,
      width:last.end-digits[0].x+1,height,suffix:suffix.toDataURL('image/png')};
  }
  async function recoverQuantity(o){
    if(!o.sourcePatch||o.quantity||o.numeric||!/^\s*[0-9]{1,5}\s+[^0-9\s]/u.test(o.sourcePatch.style.text))return;
    const img=await imgFrom(o.sourcePatch.data),c=makeCanvas(img.naturalWidth,img.naturalHeight);
    c.getContext('2d').drawImage(img,0,0);
    const hex=o.sourcePatch.paper||'#ffffff';
    quantityPatch(o,c,[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)));
  }
  function quantityArt(o,getFont){
    const q=o.quantity,patch=o.sourcePatch;
    if(!q||!patch||o.fixedInk||!canReuseNumerals(o))return '';
    const edit=o.text.match(/^\s*([0-9]{1,5})\s+(.+)$/u);
    if(!edit||edit[2]!==q.unit)return '';
    const f=getFont(o.font),options={kerning:true,letterSpacing:o.tracking/1000};
    const ref=f.getPath(q.digits,0,0,64,options).getBoundingBox();
    const path=f.getPath(edit[1],0,0,64,options),b=path.getBoundingBox();
    if(!(ref.x2>ref.x1&&ref.y2>ref.y1&&b.x2>b.x1))return '';
    const sx=Math.min(q.width/(ref.x2-ref.x1),(q.cut-q.left)/(b.x2-b.x1)),sy=q.height/(ref.y2-ref.y1);
    const x=q.left-sx*b.x1,y=q.top-sy*ref.y1;
    return '<g transform="translate('+patch.dx*o.w+' '+patch.dy*o.h+') scale('+o.w/q.w+' '+o.h/q.h+')">'+
      '<image x="'+q.cut+'" width="'+(q.w-q.cut)+'" height="'+q.h+'" preserveAspectRatio="none" href="'+q.suffix+'"/>'+
      '<path transform="translate('+x+' '+y+') scale('+sx+' '+sy+')" d="'+path.toPathData(4)+'"/></g>';
  }
  function attach(o,data,box){
    if(o.type==='crop'){o.crop=data;o.x=box.x;o.y=box.y;return;}
    o.sourcePatch={data,dx:(box.x-o.x)/o.w,dy:(box.y-o.y)/o.h,style:appearance(o)};
  }
  function separate(image,layers,width,height){
    const w=image.naturalWidth,h=image.naturalHeight;
    if(w*h>24000000)throw Error('โหมดคงภาพรองรับภาพไม่เกิน 24 ล้านพิกเซล');
    const base=makeCanvas(w,h),ctx=base.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='white';ctx.fillRect(0,0,w,h);ctx.drawImage(image,0,0);
    for(const o of layers){
      const r=o.refRegion;if(!r)continue;
      const box=bounds(r,w,h),pixels=ctx.getImageData(box.x,box.y,box.w,box.h);
      const c=makeCanvas(box.w,box.h),sub=c.getContext('2d'),patch=sub.createImageData(box.w,box.h);
      const bg=paper(pixels.data,box.w,box.h),src=pixels.data,ink=patch.data;
      for(let i=0;i<src.length;i+=4){
        if(src[i]===bg[0]&&src[i+1]===bg[1]&&src[i+2]===bg[2])continue;
        ink[i]=src[i];ink[i+1]=src[i+1];ink[i+2]=src[i+2];ink[i+3]=255;
        src[i]=bg[0];src[i+1]=bg[1];src[i+2]=bg[2];src[i+3]=255;
      }
      ctx.putImageData(pixels,box.x,box.y);sub.putImageData(patch,0,0);
      const rect={x:box.x*width/w,y:box.y*height/h,w:box.w*width/w,h:box.h*height/h};
      o.w=rect.w;o.h=rect.h;attach(o,c.toDataURL('image/png'),rect);
      if(o.sourcePatch){o.sourcePatch.paper='#'+bg.map(n=>n.toString(16).padStart(2,'0')).join('');quantityPatch(o,c,bg);}
    }
    return base.toDataURL('image/png');
  }
  function patchArt(o){
    const patch=o.sourcePatch;
    return '<image x="'+patch.dx*o.w+'" y="'+patch.dy*o.h+'" width="'+o.w+'" height="'+o.h+'" preserveAspectRatio="none" href="'+patch.data+'"/>';
  }
  // For forms with a measured numeral set, retain the unit and reuse printed digits.
  // A missing digit uses the selected font fitted to the numeral box.
  function numericArt(o,atlas,getFont){
    const spec=o.numeric,patch=o.sourcePatch;
    if(!atlas||!spec||!patch||o.fixedInk||!canReuseNumerals(o))return '';
    const raw=o.text.trim();
    if(!raw.endsWith(spec.suffix))return '';
    const number=raw.slice(0,raw.length-spec.suffix.length).trim();
    if(!/^[0-9]+(?:[.,-][0-9]+)*$/.test(number)||number.length>18)return '';
    const digits=[];let cursor=0;
    for(const ch of number){
      const glyph=atlas[ch];
      if(glyph){
        digits.push('<image x="'+cursor+'" y="'+(spec.baseline+glyph.bottom-glyph.h)+'" width="'+glyph.w+'" height="'+glyph.h+'" href="'+glyph.data+'"/>');
        cursor+=glyph.w;
      }else{
        const outline=getFont(o.font).getPath(ch,0,0,64),b=outline.getBoundingBox();
        const w=ch===','?6:23,h=ch===','?13:51;
        const sx=w/(b.x2-b.x1),sy=h/(b.y2-b.y1);
        digits.push('<path transform="translate('+(cursor-b.x1*sx)+' '+(spec.baseline-b.y2*sy)+') scale('+sx+' '+sy+')" d="'+outline.toPathData(4)+'"/>');cursor+=w;
      }
      cursor+=3;
    }
    cursor-=3;const space=spec.cut-3,scale=Math.min(1,space/cursor);
    const left=spec.align==='right'?space-cursor*scale:0;
    return '<g transform="translate('+patch.dx*o.w+' '+patch.dy*o.h+') scale('+o.w/spec.w+' '+o.h/spec.h+')"><image x="'+spec.cut+'" width="'+(spec.w-spec.cut)+'" height="'+spec.h+'" href="'+spec.suffixInk+'"/><g transform="translate('+left+' 0) scale('+scale+' 1)">'+digits.join('')+'</g></g>';
  }
  function resize(project,factor){
    for(const o of project.layers){
      for(const k of ['x','y','w','h','pt','leading','baseline','markDrop','stroke','inkX','inkY'])if(Number.isFinite(o[k]))o[k]*=factor;
      ThaiMarks.resize(o.markTuning,factor);
      if(o.referenceBox)for(const key of ['x','y','w','h','originX','originY'])o.referenceBox[key]*=factor;
      if(o.sourcePatch)for(const style of [o.sourcePatch.style,o.sourcePatch.calibrated].filter(Boolean)){
        for(const k of ['pt','leading','baseline','markDrop','stroke'])if(Number.isFinite(style[k]))style[k]*=factor;
      }
    }
    project.width*=factor;project.height*=factor;
  }
  return {appearance,original,paper,recoverQuantity,quantityArt,attach,separate,patchArt,numericArt,resize};
})();
