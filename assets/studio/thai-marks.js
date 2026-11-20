// Keep glyph shaping and advances intact. Record one occurrence per mark, even
// when the dot of Sara Am has both an outer contour and an inner counter.
const ThaiMarks=(()=>{
  const kinds=['vowel','tho','am'];
  const upper=/[\u0e31\u0e34-\u0e37\u0e47-\u0e4e]/u;
  const upperNames=/^(?:maihanakat|sarai|saraue|maitaikhu|maiek|maitho|maitri|maichattawa|thanthakhat|nikhahit|yamakkan)/i;
  function which(g){
    const c=g.unicodes||[],n=g.name||'';
    if(c.includes(0xe33)||/^(saraamthai|uni0e33)/i.test(n))return 'compound';
    if(c.includes(0xe4d)||/^(nikhahit|uni0e4d)/i.test(n))return 'am';
    if(c.includes(0xe49)||/^(maitho|uni0e49)/i.test(n))return 'tho';
    if(c.some(i=>[0xe48,0xe4a,0xe4b].includes(i))||/^(maiek|maitri|maichattawa|uni0e(?:48|4[ab]))/i.test(n))return 'tone';
    if(c.some(i=>upper.test(String.fromCodePoint(i)))||upperNames.test(n)||/^uni0e(?:31|3[4-7]|4[7-9a-e])(?:$|[._])/i.test(n)){
      // Other tone marks follow the existing whole-line vertical adjustment.
      if(c.some(i=>[0xe48,0xe4a,0xe4b,0xe4c,0xe4e].includes(i))||/^(maiek|maitri|maichattawa|thanthakhat|yamakkan|uni0e(?:48|4[abce]))/i.test(n))return 'other';
      return 'vowel';
    }
    return '';
  }
  function active(o){return !!(o.markTuning?.all&&Object.keys(o.markTuning.all).length||
    o.markTuning?.single&&o.markTuning.single.text===o.text&&o.markTuning.single.points&&Object.keys(o.markTuning.single.points).length);}
  function valid(t){
    if(t===undefined)return true;
    const offsets=(obj,ok)=>!!obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.entries(obj).every(([k,v])=>
      ok(k)&&Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000));
    return !!t&&typeof t==='object'&&!Array.isArray(t)&&(!t.all||offsets(t.all,k=>kinds.includes(k)))&&(!t.single||
      typeof t.single.text==='string'&&offsets(t.single.points,k=>/^(vowel|tho|am):[1-9]\d*$/.test(k)));
  }
  const segmenter=new Intl.Segmenter('th',{granularity:'grapheme'});
  function toneContext(cluster){
    if(/[ำํ]/u.test(cluster))return 'amTone';
    return /[ัิีึื็]/u.test(cluster)?'stackTone':'baseTone';
  }
  // For fonts shaped as a full run, keep the existing kerning and glyph order.
  // Match tone glyphs in reading order; the DB layout already supplies its cluster.
  function toneQueue(text){
    const result=[];
    for(const {segment} of segmenter.segment(text))
      for(const ch of segment)if(/[่-๋]/u.test(ch))result.push(toneContext(segment));
    return result;
  }
  function validProfiles(profiles){
    const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
    return profiles===undefined||record(profiles)&&Object.values(profiles).every(r=>record(r)&&Object.entries(r).every(([k,v])=>
      ['baseTone','stackTone','amTone','vowel','am'].includes(k)&&Array.isArray(v)&&v.length===2&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=2)));
  }
  function state(o,preview,profile){
    if(!active(o)&&!preview&&!profile)return null;
    const counts={vowel:0,tho:0,am:0};if(preview)preview.counts=counts;
    return {o,preview,profile,counts,kx:MM/(o.sx/100),ky:MM/(o.sy/100)};
  }
  function position(kind,opts){
    const ctx=opts.markState,base=opts.thaiMarkOffset||0;
    if(!ctx||kind==='other')return {dx:0,dy:base};
    const rule=(kind==='tone'||kind==='tho')?(opts.toneContext||opts.tones?.[opts.toneCursor.i++]):kind;
    const offset=ctx.profile?.[rule];
    const px=offset?offset[0]*ctx.o.pt*MM:0,py=offset?offset[1]*ctx.o.pt*MM:0;
    if(kind==='tone')return {dx:px,dy:base+py};
    const index=++ctx.counts[kind],t=ctx.o.markTuning;
    const all=t?.all?.[kind],local=t?.single&&t.single.text===ctx.o.text?t.single.points[kind+':'+index]:null;
    const preview=ctx.preview;
    const spot=preview?.spots?{kind,index,bounds:new opentype.BoundingBox()}:null;
    if(spot)preview.spots.push(spot);
    return {spot,dx:px+((all?.[0]||0)+(local?.[0]||0))*ctx.kx,
      dy:base+py+((all?.[1]||0)+(local?.[1]||0))*ctx.ky,
      highlight:preview&&kind===preview.kind&&(!preview.index||preview.index===index)?preview:null};
  }
  function add(path,part,pos){
    if(pos.dx||pos.dy)for(const cmd of part.commands){
      for(const k of ['x','x1','x2'])if(k in cmd)cmd[k]+=pos.dx;
      for(const k of ['y','y1','y2'])if(k in cmd)cmd[k]+=pos.dy;
    }
    path.extend(part);
    if(pos.spot&&part.commands.length){
      const b=part.getBoundingBox();pos.spot.bounds.addPoint(b.x1,b.y1);pos.spot.bounds.addPoint(b.x2,b.y2);
    }
    if(pos.highlight){
      pos.highlight.path.extend(part);
      if(!pos.highlight.focus&&part.commands.length)pos.highlight.focus=part.getBoundingBox();
    }
  }
  function append(path,face,glyph,x,y,size,options){
    const kind=which(glyph),outline=glyph.getPath(x,y,size,options,face);
    if(!kind){path.extend(outline);return;}
    if(kind!=='compound'){add(path,outline,position(kind,options));return;}
    const top=face.charToGlyph('า').getPath(x,y,size,options,face).getBoundingBox().y1;
    const pos=position('am',options);
    let contour=new opentype.Path();
    function finish(){
      if(!contour.commands.length)return;
      if(contour.getBoundingBox().y2<=top+size*.025)add(path,contour,pos);else path.extend(contour);
      contour=new opentype.Path();
    }
    for(const cmd of outline.commands){if(cmd.type==='M')finish();contour.commands.push(cmd);}
    finish();
  }
  function run(face,text,x,y,size,options){
    const path=new opentype.Path();
    const tones=options.markState?toneQueue(text):[],toneCursor={i:0};
    face.forEachGlyph(text,x,y,size,options,(g,gx,gy,sz,opts)=>append(path,face,g,gx,gy,sz,{...opts,tones,toneCursor,thaiMarkOffset:options.thaiMarkOffset,markState:options.markState}));
    return path;
  }
  function outline(face,text,x,y,size,options){
    if((!options.thaiMarkOffset&&!options.markState)||!/[\u0e31\u0e33-\u0e37\u0e47-\u0e4e]/u.test(text)||face.studioDBLayout)return face.getPath(text,x,y,size,options);
    return run(face,text,x,y,size,options);
  }
  function resize(t,factor){
    for(const group of [t?.all,t?.single?.points])if(group)for(const xy of Object.values(group)){xy[0]*=factor;xy[1]*=factor;}
  }
  return {append,run,outline,state,active,valid,resize,validProfiles,toneContext};
})();
