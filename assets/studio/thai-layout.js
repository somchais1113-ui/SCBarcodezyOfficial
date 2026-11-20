// The bundled DB face uses contextual Thai glyphs, including forms for stacked marks.
// Keep its outlines in font units and apply tracking once per grapheme cluster.
function withDBThaiLayout(face) {
  const wrapped = Object.create(face);
  wrapped.studioDBLayout=true;
  const segmenter = new Intl.Segmenter('th', {granularity:'grapheme'});
  function layout(text, x, y, size, options, draw) {
    const scale = size / face.unitsPerEm, spacing = size * (options?.letterSpacing || 0);
    const path = draw ? new opentype.Path() : null;
    let cursor = x;
    for (const run of text.match(/[\u0e00-\u0e7f]+|\s+|[^\u0e00-\u0e7f\s]+/gu) || []) {
      if (!/[\u0e00-\u0e7f]/u.test(run)) {
        if (draw) path.extend(face.getPath(run,cursor,y,size,options));
        cursor += face.getAdvanceWidth(run,size,options);
        continue;
      }
      for (const {segment} of segmenter.segment(run)) {
        const forms = dbThaiPositions[dbThaiClusters[segment]];
        const base = face.charToGlyph(Array.from(segment)[0]);
        if (forms) {
          for (const [id, advance, dx, dy] of forms) {
            // This face maps Sara Am after four tall consonants to .notdef.
            // Use the face's left-hand dot and full-height Sara Aa in that slot.
            const glyphs=id===0&&segment.endsWith('ำ')
              ?[face.nameToGlyph('nikhahitleftthai'),face.charToGlyph('า')]
              :[id===-1?base:face.glyphs.get(id)];
            if(draw)for(const glyph of glyphs){
              if(options?.thaiMarkOffset||options?.markState)ThaiMarks.append(path,face,glyph,cursor+dx*scale,y-dy*scale,size,{...options,toneContext:ThaiMarks.toneContext(segment)});
              else path.extend(glyph.getPath(cursor+dx*scale,y-dy*scale,size));
            }
            cursor+=(glyphs.length===2?glyphs[1].advanceWidth:advance+(id===-1?base.advanceWidth:0))*scale;
          }
        } else {
          if(draw)path.extend((options?.thaiMarkOffset||options?.markState)
            ?ThaiMarks.run(face,segment,cursor,y,size,{...options,kerning:true,letterSpacing:0})
            :face.getPath(segment,cursor,y,size,{kerning:true}));
          cursor += face.getAdvanceWidth(segment,size,{kerning:true});
        }
        cursor += spacing;
      }
    }
    return draw ? path : cursor-x;
  }
  wrapped.getPath = (text,x=0,y=0,size=72,options) => layout(text,x,y,size,options,true);
  wrapped.getAdvanceWidth = (text,size,options) => layout(text,0,0,size,options,false);
  return wrapped;
}
