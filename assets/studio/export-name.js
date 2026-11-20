// Resolve a product on the page being exported. Older templates may have only OCR text.
const StudioExportName=(()=>{
  const productKeys=['productnameth','ชื่อสินค้า','ชื่อผลิตภัณฑ์','productname','productnameen','barcodenameth','barcodenameen'];
  const heading=/^(?:ชื่อ\s*(?:สินค้า|ผลิตภัณฑ์)|product\s*name)\s*[:：]?\s*$/iu;
  const inline=/^(?:ชื่อ\s*(?:สินค้า|ผลิตภัณฑ์)|product\s*name)\s*[:：]\s*(.+)$/iu;
  const otherField=/(?:ราคา|ขนาด|วิธีใช้|คำเตือน|ข้อแนะนำ|บรรจุ|ชนิดสินค้า|price|size|usage)\s*[:：]/iu;
  const norm=s=>String(s||'').trim().toLowerCase().replace(/[\s_-]+/g,'');
  const bangkok=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit'});

  function value(text){
    if(!text||heading.test(text))return '';
    const line=String(text).replace(/\s+/gu,' ').trim();
    const match=line.match(inline);
    return (match?match[1]:line).split(otherField)[0].trim();
  }

  function productName(project,layers){
    const texts=layers.filter(o=>o.type==='text'&&typeof o.text==='string'&&o.text.trim());
    const chosen=texts.find(o=>o.id===project.productNameLayerId);
    if(chosen&&value(chosen.text))return value(chosen.text);
    for(const key of productKeys){
      const layer=texts.find(o=>(norm(o.binding)===key||norm(o.name)===key)&&value(o.text));
      if(layer)return value(layer.text);
    }
    const sameLine=texts.find(o=>inline.test(o.text.trim())&&value(o.text));
    if(sameLine)return value(sameLine.text);
    const label=texts.find(o=>heading.test(o.text.trim()));
    if(label){
      const right=texts.filter(o=>o.x>=label.x+label.w*.65&&Math.abs((o.y+o.h/2)-(label.y+label.h/2))<=Math.max(o.h,label.h)*.55);
      const neighbor=right.sort((a,b)=>a.x-b.x)[0];
      if(neighbor&&value(neighbor.text)&&!neighbor.text.includes(':'))return value(neighbor.text);
    }
    // An unlabelled product headline is common on barcode-only labels.
    const title=texts.filter(o=>(!o.name||o.name==='ข้อความ'||o.name==='ช่องข้อความ')&&o.y<project.height*.45&&
      /[A-Za-zก-ฮ]{2}/u.test(o.text)&&!/[：:]/u.test(o.text)&&!heading.test(o.text.trim())&&
      !/^(?:ราคา|วิธีใช้|คำเตือน|ประเทศผู้ผลิต|ข้อแนะนำ|วันที่|ขนาด|บรรจุ|ชนิดสินค้า|https?\b|www\.)/iu.test(o.text.trim()))
      .sort((a,b)=>a.y-b.y||a.x-b.x)[0];
    if(title)return value(title.text);
    if(project.name&&project.name.trim()!=='ฉลากใหม่')return project.name;
    return project.sourceFileStem||'สินค้า';
  }

  function filename(project,layers,extension,now=new Date()){
    const raw=productName(project,layers).normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/gu,'-')
      .replace(/[\u200b\u202a-\u202e\u2066-\u2069]/gu,'').replace(/\s+/gu,' ').trim();
    let stem='',bytes=0;
    const encoder=new TextEncoder();
    for(const {segment} of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(raw)){
      bytes+=encoder.encode(segment).length;if(bytes>220)break;stem+=segment;
    }
    stem=stem.replace(/^[. -]+|[. -]+$/gu,'')||'สินค้า';
    if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))stem='_'+stem;
    const parts=Object.fromEntries(bangkok.formatToParts(now).map(p=>[p.type,p.value]));
    return stem+'_'+parts.year+'-'+parts.month+'-'+parts.day+'.'+extension;
  }
  return {filename,productName};
})();
