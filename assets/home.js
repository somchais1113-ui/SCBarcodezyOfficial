// Homepage-only motion illustrations. Decorative sample barcodes are not production data.
'use strict';
function productionMotion(){
  const clamp=x=>Math.max(0,Math.min(1,x));
  const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
  const phase=(t,a,b)=>ease((t-a)/(b-a));
  const mix=(a,b,t)=>a+(b-a)*t;
  const n=v=>Number(v.toFixed(2));
  const svg=(id,body)=>`<svg xmlns="http://www.w3.org/2000/svg" class="cover-motion" viewBox="0 0 540 300" aria-hidden="true" focusable="false" data-motion="${id}">${body}</svg>`;
  function carton(t){
    const W=140,D=94,H=64;
    const back=phase(t,.87,1);
    const f=phase(t,.10,.36)*(1-back),th=f*Math.PI/2;
    const cl=phase(t,.45,.64)*(1-phase(t,.70,.83));
    const p=([x,y,z])=>[270+.94*x-.76*y,176+.35*x+.39*y-z*.91];
    const point=a=>p(a).map(n).join(',');
    const poly=(a,c)=>`<polygon points="${a.map(point).join(' ')}" fill="${c}" stroke="#aa8c62" stroke-width=".75" stroke-linejoin="round"/>`;
    const line=(a,b)=>`<path d="M${point(a)}L${point(b)}" fill="none" stroke="#a78a62" stroke-width=".8" stroke-dasharray="3 3"/>`;
    const ex=(a,v,k)=>a.map((x,j)=>x+v[j]*k);
    const faces=[];
    const add=(a,html)=>faces.push({d:a.reduce((s,q)=>s+q[0]*.55+q[1]*.72+q[2]*.65,0)/a.length,html});
    const base=[[-W/2,-D/2,0],[W/2,-D/2,0],[W/2,D/2,0],[-W/2,D/2,0]];
    add(base,poly(base,'#c5a572'));
    const walls=[
      {a:[-W/2,-D/2,0],b:[W/2,-D/2,0],n:[0,-1],len:D/2,c:'#d9bd92'},
      {a:[-W/2,D/2,0],b:[W/2,D/2,0],n:[0,1],len:D/2,c:'#d5b586',print:true},
      {a:[-W/2,-D/2,0],b:[-W/2,D/2,0],n:[-1,0],len:W*.28,c:'#e0c59b'},
      {a:[W/2,-D/2,0],b:[W/2,D/2,0],n:[1,0],len:W*.28,c:'#bd9867'}];
    walls.forEach((w,i)=>{
      const u=[w.n[0]*Math.cos(th),w.n[1]*Math.cos(th),Math.sin(th)];
      const a1=ex(w.a,u,H),b1=ex(w.b,u,H),face=[w.a,w.b,b1,a1];
      let html=poly(face,w.c)+line(w.a,w.b);
      if(w.print&&f>.65){
        const A=p(a1),B=p(b1),C=p(w.a);
        const mat=[(B[0]-A[0])/W,(B[1]-A[1])/W,(C[0]-A[0])/H,(C[1]-A[1])/H,A[0],A[1]].map(n);
        html+=`<g transform="matrix(${mat.join(' ')})" opacity="${n(phase(t,.29,.43)*(1-back))}" fill="#493a28" font-family="Arial,sans-serif"><text x="13" y="19" font-size="12" font-weight="700" letter-spacing="1">SC / PACK</text><path d="M13 24H85" stroke="#493a28" stroke-width=".65"/><text x="13" y="34" font-size="4.7" letter-spacing=".8">CORRUGATED CARTON</text><path d="M103 41V25M97 31L103 25 109 31M118 41V25M112 31L118 25 124 31M96 44H126" fill="none" stroke="#493a28" stroke-width="1.4"/></g>`;
      }
      add(face,html);
      const close=i<2?phase(cl,.25,1):phase(cl,0,.85);
      // Open flaps extend outward from the upper hinge; closing rotates inward.
      const angle=th+close*Math.PI/2;
      const v=[w.n[0]*Math.cos(angle),w.n[1]*Math.cos(angle),Math.sin(angle)];
      const flap=[a1,b1,ex(b1,v,w.len),ex(a1,v,w.len)];
      add(flap,poly(flap,i<2?'#e1c9a1':'#d8b98c')+line(a1,b1));
    });
    const scale=.85+.31*f;
    return `<g transform="translate(270 176) scale(${n(scale)}) translate(-270 -176)">${faces.sort((a,b)=>a.d-b.d).map(x=>x.html).join('')}</g>`;
  }
  const label=`<g id="cover-sticker-label"><rect width="70" height="44" rx=".8" fill="#1b4c40"/><path d="M44 0H70V24Z" fill="#d4d9a4"/><circle cx="60" cy="8" r="7" fill="#e5ab5d"/><text x="6" y="10" font-family="Arial,sans-serif" font-size="4" letter-spacing="1.1" fill="#c3d1c1">BOTANICAL</text><text x="6" y="26" font-family="Georgia,serif" font-size="15" fill="#fff5d9">FORM.</text><path d="M6 30H33" stroke="#9db39b" stroke-width=".5"/><text x="6" y="36" font-family="Arial,sans-serif" font-size="3.5" letter-spacing=".7" fill="#d1dbcb">NATURAL SERIES / 01</text><path d="M56 31v7m3-7v7m2-7v7m3-7v7m2-7v7" stroke="#e9e8d6" stroke-width=".9"/></g>`;
  const coords=Array.from({length:9},(_,i)=>[15+(i%3)*82,18+Math.floor(i/3)*64]);
  function sticker(t){
    const pr=phase(t,.06,.34), cut=phase(t,.40,.76),peel=phase(t,.78,.91),reset=1-phase(t,.94,1);
    const printed=coords.map(([x,y],i)=>`<use href="#cover-sticker-label" x="${x}" y="${y}" opacity="${n(clamp(pr*10-i)*(i===8?1-peel:1)*reset)}"/>`).join('');
    const cuts=coords.map(([x,y],i)=>{const a=clamp(cut*9-i);return `<rect x="${x+2}" y="${y+2}" width="66" height="40" rx="1" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${n(1-a)}" stroke="#e4319b" stroke-width=".85" fill="none" opacity="${n((a>0?1:0)*reset*(i===8?1-peel:1))}"/>`}).join('');
    // Travel along each cut perimeter, matching the active outline.
    const ci=Math.min(8,Math.floor(cut*9)),c=coords[ci],dist=clamp(cut*9-ci)*212;
    let hx,sy;
    if(t<.37){sy=12+184*pr;hx=132+104*Math.sin(pr*6*Math.PI)}
    else if(dist<66){hx=c[0]+2+dist;sy=c[1]+2}
    else if(dist<106){hx=c[0]+68;sy=c[1]+2+dist-66}
    else if(dist<172){hx=c[0]+68-(dist-106);sy=c[1]+42}
    else {hx=c[0]+2;sy=c[1]+42-(dist-172)}
    const vis=phase(t,.04,.09)*(1-phase(t,.33,.36)+phase(t,.39,.42)-phase(t,.74,.78));
    return `<defs>${label}</defs><g transform="matrix(1.08 .33 -.72 .61 201 38)"><rect x="-4" y="-4" width="272" height="216" rx="2" fill="#c3d0c8"/><rect width="264" height="208" rx="1" fill="white" stroke="#becdc4" stroke-width=".7"/><path d="M8 16V8H16M248 8H256V16M8 192V200H16M248 200H256V192" fill="none" stroke="#4f6259" stroke-width="1.2"/>${printed}${cuts}<g opacity="${n(peel*reset)}"><rect x="181" y="148" width="66" height="40" rx="1" fill="white" stroke="#c4cfc6" stroke-width=".5"/><g transform="translate(179 ${n(146-45*peel)}) rotate(${n(-12*peel)} 35 22)"><use href="#cover-sticker-label"/><path d="M49 44Q65 39 70 25V44Z" fill="#e0e9e2" stroke="#bfcec5" stroke-width=".4"/></g></g><g opacity="${n(clamp(vis))}" transform="translate(0 ${n(sy-33)})"><rect x="-9" y="-4" width="282" height="12" rx="2" fill="#607d72"/><path d="M-6 -2H270" stroke="#a5b9b0" stroke-width="1"/><g transform="translate(${n(hx)} -9)"><rect x="-13" width="26" height="24" rx="2" fill="#294b40"/><rect x="-10" y="2" width="20" height="8" rx="1" fill="#9aada4"/><circle cx="7" cy="5" r="1.5" fill="#ff9e51"/><path d="M-3 24V28H3V24" fill="#374d45"/><path d="M0 28V33" stroke="#e4319b" stroke-width="1.2"/></g></g></g>`;
  }
  const barWidths=[2,3,6,2,6,3,2,6,2,6,3,3,6,2,6,3,2,6,3,6,2,6,3,2,6,3,6,2,6,3,2];
  const btotal=barWidths.reduce((s,w)=>s+w+3,0),unit=235/btotal;
  let bx=38;
  const bars=barWidths.map(w=>{const p=`<rect x="${n(bx)}" y="61" width="${n(w*unit)}" height="25"/>`;bx+=(w+3)*unit;return p}).join('');
  const barcodeArt=`<g id="cover-barcode-art" fill="#20252a"><rect x="14" y="10" width="282" height="122" fill="none" stroke="#30363d"/><text x="155" y="30" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="16">QTM GELVOLUTION 007 HITZ</text><text x="155" y="43" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="8">QUANTUM GELVOLUTION 007 HITZ / 0.7 MM</text><text x="155" y="53" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="8">8851907346492 × 240</text><rect x="23" y="59" width="264" height="29" fill="none" stroke="#20252a" stroke-width="1.3"/>${bars}<text x="155" y="100" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="10" letter-spacing="2">48851907346490</text><g font-family="Arial,sans-serif" font-size="7.5" text-anchor="middle" font-weight="700"><rect x="23" y="105" width="264" height="22" fill="none" stroke="#30363d" stroke-width=".7"/><path d="M98 105V127M145 105V127M215 105V127M23 116H287" stroke="#30363d" stroke-width=".6"/><text x="60.5" y="113">LOCATION</text><text x="121.5" y="113">QTY</text><text x="180" y="113">G.W. (Kg)</text><text x="251" y="113">LOT NO.</text><text x="60.5" y="124">IND</text><text x="121.5" y="124">240</text></g><path d="M0 148H310" stroke="#b9c8d7" stroke-width=".8" stroke-dasharray="3 3"/></g>`;
  function barcode(t){
    const offset=n(92+148*phase(t,.14,.86));
    return `<defs>${barcodeArt}<clipPath id="cover-barcode-clip"><rect x="0" y="91" width="310" height="209"/></clipPath></defs><g transform="translate(115 0)"><rect width="310" height="300" fill="white"/><path d="M0 0V300M310 0V300" stroke="#c1ccd8"/><g clip-path="url(#cover-barcode-clip)"><g transform="translate(0 ${offset})">${[-296,-148,0,148,296].map(y=>`<use href="#cover-barcode-art" y="${y}"/>`).join('')}</g></g><rect x="-18" y="57" width="346" height="34" rx="4" fill="#34475a"/><path d="M-18 58V51H328V58Z" fill="#64788e"/><path d="M-18 51L-8 45H318L328 51Z" fill="#a7b6c7"/><rect x="-9" y="65" width="328" height="7" rx="1.5" fill="#1d2d3f"/><path d="M7 89H303" stroke="#6498f0" stroke-width="2.5"/><circle cx="310" cy="54.5" r="2.6" fill="#8ddabf"/><path d="M-9 54H18M23 54H31" stroke="#c7d4e2" stroke-width="1.2"/></g>`;
  }
  function studio(t){
    // Fixed geometry; only the two numeric fields and the cursor move.
    const s=t*10.5;
    const price=s<2.1?'39':s<2.55?'':s<2.85?'4':'49';
    const qty=s<6.05?'4':s<6.5?'':'6';
    const field=s<4.4?{x:395,y:10,w:27,base:27,tx:398,old:'39',now:price,start:1.05,end:3.55}:{x:63,y:120,w:17,base:137,tx:66,old:'4',now:qty,start:5.05,end:7.35};
    const active=s>=field.start&&s<field.end,selected=s>=field.start+.32&&s<field.start+1.05;
    const selection=active?`<g stroke="#246df2" stroke-width="1" fill="white"><rect x="${field.x}" y="${field.y}" width="${field.w}" height="24" fill="none"/>${[[field.x,field.y],[field.x+field.w,field.y],[field.x,field.y+24],[field.x+field.w,field.y+24]].map(([x,y])=>`<rect x="${x-1.8}" y="${y-1.8}" width="3.6" height="3.6"/>`).join('')}${selected?`<rect x="${field.tx-1}" y="${field.base-15}" width="${field.old.length*9+2}" height="18" fill="#246df2" stroke="none"/><text x="${field.tx}" y="${field.base}" fill="white" stroke="none" font-size="16" font-weight="bold">${field.old}</text>`:`<path d="M${field.tx+field.now.length*9+1} ${field.base-15}V${field.base+3}" stroke-width="1.5" opacity="${Math.floor(s*2.5)%2===0?1:0}"/>`}</g>`:'';
    let x,y;
    if(s<1.05){const a=ease(s/1.05);x=mix(510,410,a);y=mix(245,21,a)}
    else if(s<3.65){x=410;y=21}
    else if(s<5.05){const a=ease((s-3.65)/1.4);x=mix(410,73,a);y=mix(21,131,a)}
    else if(s<7.35){x=73;y=131}
    else{const a=ease((s-7.35)/.75);x=mix(73,42,a);y=mix(131,219,a)}
    const cursor=`<g transform="translate(${n(x)} ${n(y)})" opacity="${n(1-ease((s-7.8)/.5))}">${active?'<path d="M-4 -8H4M0 -8V8M-4 8H4" stroke="#253952" stroke-width="1.5" fill="none"/>':'<path d="M0 0V20L5 15L10 25L14 23L9 13H17Z" fill="#24364d" stroke="white" stroke-width="1.4" stroke-linejoin="round"/>'}</g>`;
    const studioBars=Array.from({length:37},(_,i)=>`<rect x="${n(i*4.3)}" y="5" width="${i%3===0?3.1:i%2===0?2:1.2}" height="54"/>`).join('');
    return `<g transform="translate(24 68) scale(.875)" font-family="Arial,'Noto Sans Thai',sans-serif"><rect width="562" height="190" rx="1" fill="white" stroke="#b9c8da"/><g fill="#263d89" font-size="14"><text x="13" y="27" font-weight="bold">ชื่อสินค้า :</text><text x="82" y="27" textLength="264" lengthAdjust="spacingAndGlyphs">เอลเฟ่นพลัส ปากกาเน้นข้อความ ลูน่า</text><text x="356" y="27" font-size="13">ราคา :</text><text x="398" y="27" font-size="16" font-weight="bold">${price}</text><text x="425" y="27" font-size="13">บาท</text><text x="13" y="49" font-weight="bold">ชนิดสินค้า :</text><text x="94" y="49">ปากกาเน้นข้อความ</text><text x="13" y="71">ขนาด : 2–4 มม.</text><text x="155" y="71" font-size="16" font-weight="bold">คำเตือน : ห้ามนำเข้าปาก</text><text x="13" y="93">ประเทศผู้ผลิต : ประเทศจีน</text><text x="13" y="115" font-size="12.5" textLength="350" lengthAdjust="spacingAndGlyphs">ผู้นำเข้าและจัดจำหน่าย : บริษัท ดี.เอช.เอ.สยามวาลา จำกัด</text><text x="13" y="137">บรรจุ :</text><text x="66" y="137" font-size="16" font-weight="bold">${qty}</text><text x="83" y="137">ด้าม / แพ็ค</text><text x="13" y="159" font-size="12">วันที่ผลิต : ................................</text><text x="13" y="177" font-size="12">วันที่ควรใช้ก่อน : ........................</text></g><g transform="translate(385 64)" fill="#263d89"><text y="-8" font-size="6.9" font-weight="bold">ELF PLUS HIGHLIGHTER LUNA</text><text y="0" font-size="5.5">ASSORTED COLOUR</text>${studioBars}<text x="79" y="71" text-anchor="middle" font-size="8" letter-spacing="4">8851907340179</text><rect x="1" y="82" width="23" height="23" fill="none" stroke="#263d89" stroke-width="1.4"/><path d="M3 84h7v7H3z M15 84h7v7h-7z M3 96h7v7H3z M12 93h4v4h-4z M18 97h4v6h-4z M12 101h3v2h-3z"/><text x="31" y="91" font-family="Georgia,serif" font-size="10" font-weight="bold">D.H.A. Siamwalla Ltd.</text><text x="31" y="102" font-size="6">PRODUCT INFORMATION</text></g>${selection}${cursor}</g>`;
  }
  const scenes={carton:{render:carton,duration:11000,still:.65},sticker:{render:sticker,duration:11000,still:.92},barcode:{render:barcode,duration:6000,still:0},studio:{render:studio,duration:10500,still:.86}};
  return {scenes,svg};
}
function startMotion(){
  const {scenes}=productionMotion();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const entries=Array.from(document.querySelectorAll('[data-motion]')).map(el=>({el,scene:scenes[el.dataset.motion],visible:false,elapsed:0,last:null})).filter(e=>e.scene);
  let frame=0;
  const draw=(e,t)=>{e.el.innerHTML=e.scene.render(t)};
  function tick(now){
    frame=0;
    for(const e of entries){
      if(!e.visible||document.hidden||reduced.matches){e.last=null;continue}
      if(e.last!==null)e.elapsed+=Math.min(100,now-e.last);
      e.last=now;draw(e,(e.elapsed%e.scene.duration)/e.scene.duration);
    }
    schedule();
  }
  function schedule(){if(!frame&&!document.hidden&&!reduced.matches&&entries.some(e=>e.visible))frame=requestAnimationFrame(tick)}
  function sync(){
    if(frame){cancelAnimationFrame(frame);frame=0}
    entries.forEach(e=>{e.last=null;if(reduced.matches)draw(e,e.scene.still)});
    schedule();
  }
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(changes=>{
      for(const change of changes){const e=entries.find(x=>x.el===change.target);if(e){e.visible=change.isIntersecting;e.last=null}}
      schedule();
    },{threshold:.05});
    entries.forEach(e=>observer.observe(e.el));
  }else entries.forEach(e=>e.visible=true);
  document.addEventListener('visibilitychange',sync);
  if(reduced.addEventListener)reduced.addEventListener('change',sync);else if(reduced.addListener)reduced.addListener(sync);
  sync();
}
startMotion();
