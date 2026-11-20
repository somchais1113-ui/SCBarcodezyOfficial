// Compare the same outlined text used by the editor/export with the ink in the OCR region.
const StudioFonts = (() => {
  function canvas(width, height) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(width));
    c.height = Math.max(1, Math.ceil(height));
    return c;
  }

  function sample(image, region) {
    const x = region.x * image.naturalWidth, y = region.y * image.naturalHeight;
    const w = region.w * image.naturalWidth, h = region.h * image.naturalHeight;
    const scale = Math.min(1, 1700 / w, 180 / h);
    const clip = canvas(w * scale, h * scale);
    const ctx = clip.getContext('2d', {willReadFrequently:true});
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, clip.width, clip.height);
    ctx.drawImage(image, x, y, w, h, 0, 0, clip.width, clip.height);
    return clip;
  }

  function referenceInk(clip) {
    const w = clip.width, h = clip.height;
    const pixels = clip.getContext('2d').getImageData(0, 0, w, h).data;
    const {paper,axis,energy}=palette(pixels,w,h);
    if(energy<18*18)return null;
    const mask = canvas(w, h), ctx = mask.getContext('2d');
    const im = ctx.createImageData(w, h);
    let left=w, top=h, right=-1, bottom=-1;
    for (let i = 0; i < w*h; i++) {
      const darkness=Math.max(0,Math.min(1,axis.reduce((v,n,k)=>v+n*(pixels[i*4+k]-paper[k]),0)/energy));
      im.data[4*i+3] = Math.round(255 * darkness);
      if (darkness < .42) continue;
      const x = i % w, y = Math.floor(i / w);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if (right <= left || bottom <= top) return null;
    ctx.putImageData(im, 0, 0);
    return {mask, left, top, w:right-left+1, h:bottom-top+1};
  }

  function palette(pixels,w,h){
    const paper=SourceArt.paper(pixels,w,h),hist=new Uint32Array(443);
    const distances=new Uint16Array(w*h);
    for(let i=0;i<w*h;i++){
      const r=pixels[4*i]-paper[0],g=pixels[4*i+1]-paper[1],b=pixels[4*i+2]-paper[2];
      distances[i]=Math.round(Math.hypot(r,g,b));hist[distances[i]]++;
    }
    let cutoff=442,count=0;
    while(cutoff>0&&count+hist[cutoff]<w*h*.012)count+=hist[cutoff--];
    const ink=[0,0,0];count=0;
    for(let i=0;i<w*h;i++){
      if(distances[i]<Math.max(12,cutoff-2))continue;
      for(let k=0;k<3;k++)ink[k]+=pixels[4*i+k];
      count++;
    }
    for(let k=0;k<3;k++)ink[k]=count?Math.round(ink[k]/count):paper[k];
    const axis=ink.map((v,k)=>v-paper[k]);
    return {paper,ink,axis,energy:axis.reduce((v,n)=>v+n*n,0)};
  }
  function inkColor(clip) {
    const pixels=clip.getContext('2d').getImageData(0,0,clip.width,clip.height).data;
    return '#'+palette(pixels,clip.width,clip.height).ink.map(v=>v.toString(16).padStart(2,'0')).join('');
  }

  function compare(clip, text, keys, getFont) {
    const ink = referenceInk(clip);
    if (!ink || !text.trim() || text.includes('\n')) return [];
    const h = 42, w = Math.max(10, Math.min(780, Math.round(h * ink.w / ink.h)));
    const c = canvas(w+4,h+4), ctx = c.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(ink.mask, ink.left, ink.top, ink.w, ink.h, 2, 2, w, h);
    const target = ctx.getImageData(0,0,c.width,c.height).data;
    const results = [];
    for (const key of keys) {
      try {
        const font = getFont(key);
        if (Array.from(text).some(ch => ch.trim() && !font.charToGlyphIndex(ch))) continue;
        const plain=font.getPath(text,0,0,64,{kerning:true}).getBoundingBox();
        const naturalWidth=plain.x2-plain.x1, naturalHeight=plain.y2-plain.y1;
        const intervals=font.stringToGlyphs(text).length-1;
        if(!(naturalWidth>0&&naturalHeight>0))continue;
        const guess=intervals?Math.round(1000*((ink.w/ink.h)*naturalHeight-naturalWidth)/(64*intervals)):0;
        const spacings=intervals?[0,guess,guess-18,guess+18,guess-45,guess+45]:[0];
        let winner=null;
        for(const tracking of new Set(spacings.map(v=>Math.max(-90,Math.min(850,v))))){
          const path=font.getPath(text,0,0,64,{kerning:true,letterSpacing:tracking/1000});
          const b=path.getBoundingBox(),bw=b.x2-b.x1,bh=b.y2-b.y1;
          if(!(bw>0&&bh>0))continue;
          ctx.clearRect(0,0,c.width,c.height);
          ctx.save();
          ctx.translate(2,2);ctx.scale(w/bw,h/bh);ctx.translate(-b.x1,-b.y1);
          path.draw(ctx);ctx.restore();
          const shape=ctx.getImageData(0,0,c.width,c.height).data;
          let overlap=0,energy=0;
          for(let i=3;i<target.length;i+=4){
            const a=target[i],b=shape[i];overlap+=a*b;energy+=a*a+b*b;
          }
          const proportions=Math.exp(-Math.abs(Math.log((bw/bh)/(ink.w/ink.h))));
          const score=100*(.94*(energy?2*overlap/energy:0)+.06*proportions);
          // Prefer neutral tracking when two renderings are visually indistinguishable.
          if(!winner||score>winner.score+.25)winner={key,score,tracking};
        }
        if(winner)results.push({...winner,score:Math.round(winner.score)});
      } catch { /* One unsupported outline must not interrupt OCR on the other lines. */ }
    }
    return results.sort((a,b)=>b.score-a.score);
  }
  function inkBounds(clip) {
    const ink=referenceInk(clip);
    if(!ink)return {x:0,y:0,w:1,h:1};
    return {x:ink.left/clip.width,y:ink.top/clip.height,w:ink.w/clip.width,h:ink.h/clip.height};
  }
  return {compare,sample,inkColor,inkBounds};
})();
