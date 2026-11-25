/* All generated artwork is transparent, portable SVG geometry, including label text. */
const CartonStandard=(()=>{
 const {glyphs,refs}=CartonStandardArt,ns='http://www.w3.org/2000/svg';
 const definitions=[['stack','Stacking Limit'],['dry','Keep Dry'],['up','Up Arrow'],['care','Handle with Care'],['dhas','DHAS Shipping Mark']];
 function textShape(text){let x=0,paths='';for(const c of text){const g=glyphs[c];if(!g)continue;if(g[1])paths+=`<path d="${g[1]}" transform="translate(${x} 0)"/>`;x+=g[0];}return {w:x,paths};}
 function line(text,cx,baseline,maxWidth,size,attrs='fill="black"'){
  const t=textShape(text),s=Math.min(size,maxWidth/(t.w||1));return `<g ${attrs} transform="translate(${cx-t.w*s/2} ${baseline}) scale(${s})">${t.paths}</g>`;
 }
 function country(value){return String(value||'').toUpperCase().replace(/[^A-Z0-9 .(),/&-]/g,'').replace(/\s+/g,' ').trim().slice(0,60);}
 function art(kind,value,rotation=0){
  let w,h,body;const ref=refs[kind];
  const traced=r=>`<path fill="black" fill-rule="evenodd" d="${r.d}"/>`;
  if(kind==='size'){
   const t='SIZE : '+value+' mm.',f=58;w=Math.ceil(textShape(t).w*f+42);h=108;
   body=`<rect x="3" y="3" width="${w-6}" height="${h-6}" fill="none" stroke="black" stroke-width="6"/>`+line(t,w/2,77,w-40,f);
  }else if(kind==='dhas'){
   w=1300;h=990;body=`<g transform="translate(${(w-ref.w)/2} 0)">${traced(ref)}</g>`+line('MADE IN '+country(value),w/2,987,w-6,165);
  }else if(kind==='stack'&&String(value)!=='4'){
   w=h=470;body='<rect x="14" y="14" width="442" height="442" stroke="black" stroke-width="28" fill="none"/><rect x="67" y="274" width="331" height="47" stroke="black" stroke-width="21" fill="none"/><rect x="67" y="362" width="331" height="47" stroke="black" stroke-width="21" fill="none"/>'+line(String(value),235,220,300,230,'fill="none" stroke="black" stroke-width=".055" stroke-linejoin="miter"');
  }else{w=ref.w;h=ref.h;body=traced(ref);}
  const n=((rotation%360)+360)%360;
  if(n===90){body=`<g transform="translate(${h} 0) rotate(90)">${body}</g>`;[w,h]=[h,w];}
  if(n===180)body=`<g transform="translate(${w} ${h}) rotate(180)">${body}</g>`;
  if(n===270){body=`<g transform="translate(0 ${w}) rotate(270)">${body}</g>`;[w,h]=[h,w];}
  return {w,h,svg:`<svg xmlns="${ns}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`};
 }
 function asset(kind,value,rotation=0){
  const {w,h,svg}=art(kind,value,rotation),img=new Image(),url='data:image/svg+xml;base64,'+btoa(svg);
  const a={name:kind==='size'?'SIZE · อัตโนมัติ':definitions.find(d=>d[0]===kind)[1],url,img,vector:portableVector(svg),ratio:w/h,standard:kind,value,rotation};
  img.onload=()=>{if(typeof g!=='undefined'&&g){if(items.some(o=>assets[o.asset]===a)){drawing($('flat'),true,true);render3();}}};img.src=url;return a;
 }
 return {definitions,art,asset,country};
})();
