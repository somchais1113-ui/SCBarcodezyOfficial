// Run: npm install --no-save jsdom@26.1.0 @napi-rs/canvas; node tests/regression.cjs
// DOM-based integration tests; not a substitute for browser/printer acceptance.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {JSDOM}=require('jsdom'),canvasLib=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.TEST_OUTPUT||path.join(root,'test-output'));
fs.mkdirSync(out,{recursive:true});
const dom=new JSDOM(fs.readFileSync(path.join(root,'barcode.html'),'utf8'),{runScripts:'outside-only',pretendToBeVisual:true,url:'https://local.test/'});
const w=dom.window,urls=new Map(),downloads=[],checks=[];
w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Blob=Blob;
Object.defineProperty(w.document,'fonts',{value:{ready:Promise.resolve()}});
w.URL.createObjectURL=blob=>{const id='blob:test-'+urls.size;urls.set(id,blob);return id;};w.URL.revokeObjectURL=id=>urls.delete(id);
w.HTMLAnchorElement.prototype.click=function(){downloads.push({filename:this.download,blob:urls.get(this.href)});};
w.HTMLCanvasElement.prototype.getContext=function(){if(!this.__canvas||this.__canvas.width!==this.width||this.__canvas.height!==this.height)this.__canvas=canvasLib.createCanvas(this.width,this.height);const context=this.__canvas.getContext('2d');return new Proxy(context,{get(t,p){if(p==='drawImage')return(img,...args)=>t.drawImage(img.__native||img,...args);const v=t[p];return typeof v==='function'?v.bind(t):v;},set(t,p,v){t[p]=v;return true;}});};
w.HTMLCanvasElement.prototype.toBlob=function(cb,mime,quality){const buffer=this.__canvas.toBuffer(mime,mime==='image/jpeg'?Math.round((quality||.95)*100):undefined);cb(new Blob([buffer],{type:mime}));};
w.Image=class{set src(value){urls.get(value).arrayBuffer().then(bytes=>canvasLib.loadImage(Buffer.from(bytes))).then(img=>{this.__native=img;this.onload();}).catch(e=>this.onerror(e));}};
let printed='';w.print=()=>{printed=w.document.getElementById('printSheetRoot').innerHTML;w.dispatchEvent(new w.Event('afterprint'));};
for(const file of ['assets/vendor/jspdf.umd.min.js','assets/vendor/opentype.min.js','assets/vendor/svg2pdf.umd.min.js','assets/js/zip-store.js','assets/js/app.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
const get=id=>w.document.getElementById(id),put=(id,v)=>get(id).value=String(v);
const check=(name,fn)=>{fn();checks.push(name);};
const resetBatch=()=>{for(const e of w.document.querySelectorAll('#batchSection textarea'))e.value='';};
async function saveDownloads(){for(const d of downloads.splice(0))fs.writeFileSync(path.join(out,d.filename),Buffer.from(await d.blob.arrayBuffer()));}
(async()=>{
 await w.ensureFonts();w.update();
 check('Initial sample renders without an error',()=>{assert.match(get('status').textContent,/พร้อมส่งออก/);assert.match(get('label-container').innerHTML,/<path/);});
 check('EAN known vector, auto checksum and rejection',()=>{assert.equal(w.normalizeEAN13('400638133393').value,'4006381333931');assert.equal(w.ean13Bits('4006381333931').length,95);for(const x of ['4006381333932','ABC400638133393','1.234E+12','123'])assert.throws(()=>w.normalizeEAN13(x));});
 check('Manual GTIN retained independently',()=>{const d=w.collectData();assert.equal(w.getITF14(d).value,'38851907345397');assert.equal(w.getITF14({...d,manualItf14:''}).value,'38851907346493');assert.throws(()=>w.getITF14({...d,manualItf14:'38851907345398'}));});
 resetBatch();w.setMode('batch');check('Empty batch cannot export a fallback preview',()=>{assert(w.validateData(w.getPreviewData()).length>0);assert.throws(()=>w.batchForExport());});put('batchGtin13List','8851907346492\n8851907346522');
 check('Batch QTY accepts thousands separators and preserves the printed value',()=>{
   put('batchQtyList','1,200\n1200');
   const {selectedItems}=w.batchForExport();
   assert.deepEqual(Array.from(selectedItems,item=>item.qty),['1,200','1200']);
   for(const item of selectedItems)assert(w.buildPhysicalSVG(item,false,'#ffffff').includes(item.qty));
   const item=selectedItems[0];
   assert.equal(w.validateData({...item,qty:'1,200,000'}).length,0);
   for(const qty of ['0','-1','1.2','1,20','12,00','1,,200','1,200,','0,000'])
     assert(w.validateData({...item,qty}).some(issue=>issue.includes('QTY')));
   put('batchQtyList','');
 });
 check('Blank batch Manual derives each GTIN separately',()=>{const b=w.parseBatchItems();assert.equal(b.items.length,2);assert(b.items.every(x=>x.manualItf14===''));assert.notEqual(w.getITF14(b.items[0]).value,w.getITF14(b.items[1]).value);});
 put('batchGtin13List','8851907346492\n8851907346522\n8851907000004');put('batchTitleList','A\nB\nC');put('batchQtyList','10\n\n30');
 check('Blank row stays at original index',()=>{const b=w.parseBatchItems();assert.deepEqual(Array.from(b.items,x=>x.qty),['10','','30']);assert(w.validateData(b.items[1]).some(x=>x.includes('QTY')));assert.throws(()=>w.batchForExport());});
 put('batchQtyList','10\n20');
 check('Unequal columns stop export',()=>assert(w.parseBatchItems().errors.some(x=>x.includes('QTY'))));
 put('batchQtyList','20');put('batchGrossWeightList','1\n2\n\n');
 check('Trailing empty Excel cell remains empty',()=>assert.deepEqual(Array.from(w.parseBatchItems().items,x=>x.grossWeight),['1','2','']));
 put('batchGrossWeightList','');
 check('Single value broadcast',()=>assert(w.parseBatchItems().items.every(x=>x.qty==='20')));
 resetBatch();put('batchGtin13List','8851907346492\n8851907346522');put('batchGtinLevel','ean13then');put('batchEan13ThenEnNameList','FIRST\nSECOND');put('batchEan13ThenThNameList','ชื่อแรก\nชื่อสอง');w.update();
 check('TH/EN names flow into batch rows',()=>{const b=w.batchForExport();assert.equal(b.items[1].ean13ThenEnName,'SECOND');assert.equal(b.items[1].ean13ThenThName,'ชื่อสอง');});
 await w.downloadBatchOutlinedSvgZip();await saveDownloads();
 resetBatch();put('batchGtin13List',Array(65).fill('8851907346492').join('\n'));put('batchGtinLevel','ean13');w.selectBatchItem(31);
 check('30-item paging respects current set',()=>{const b=w.visibleBatch();assert.equal(b.start,30);assert.equal(b.end,60);assert.equal(b.selectedItems.length,30);});
 w.selectBatchItem(64);check('Final batch page contains remainder only',()=>assert.equal(w.visibleBatch().selectedItems.length,5));
 w.setMode('single');w.loadSample();
 const sizes={'2':[48,30],'3':[60,35],'4':[112,60],ean13:[70,20],ean13then:[80,34]};
 for(const [level,[width,height]] of Object.entries(sizes)){
   put('gtinLevel',level);put('ean13ThenEnName','QTM DISPLAY HIGHLIGHTER AURORA GLITTER');put('ean13ThenThName','ชุดตู้ควอนตั้ม ปากกาเน้นข้อความ ออโรร่า กลิตเตอร์');w.update();const data=w.collectData();
   check(`SVG dimensions and preview parity ${level}`,()=>{const svg=w.buildPhysicalSVG(data,true);const doc=new w.DOMParser().parseFromString(svg,'image/svg+xml');assert.equal(doc.documentElement.getAttribute('width'),width+'mm');assert.equal(doc.documentElement.getAttribute('height'),height+'mm');assert.equal(doc.querySelectorAll('text').length,0);assert.deepEqual(Array.from(get('label-container').querySelectorAll('path'),p=>[p.getAttribute('d'),p.getAttribute('transform')]),Array.from(doc.querySelectorAll('path'),p=>[p.getAttribute('d'),p.getAttribute('transform')]));assert(!doc.querySelector('parsererror'));});
   const svg=w.buildPhysicalSVG(data,true);fs.writeFileSync(path.join(out,level+'.svg'),svg);
   const edit=w.getEditableSVGSource(data);fs.writeFileSync(path.join(out,level+'-editable.svg'),edit);
   check(`Editable embeds fonts ${level}`,()=>{assert(edit.includes('@font-face'));assert(edit.includes('<text'));assert(edit.includes(`width="${width}mm"`));});
   const pdf=new w.jspdf.jsPDF({unit:'mm',format:[width,height],orientation:'landscape',compress:true});await pdf.svg(w.svgStringToElement(w.buildPhysicalSVG(data,true,'#ffffff')),{x:0,y:0,width,height});fs.writeFileSync(path.join(out,level+'.pdf'),Buffer.from(pdf.output('arraybuffer')));
   await w.downloadPNGPreview();await w.downloadJPGPreview();await saveDownloads();
   check(`Raster export successful ${level}`,()=>assert.match(get('status').textContent,/สำเร็จ/));
 }
 // Capture the actual pdf.save payload used by the production handlers.
 w.jspdf.jsPDF.API.save=function(name){fs.writeFileSync(path.join(out,name),Buffer.from(this.output('arraybuffer')));return this;};
 await w.exportSupplierPDF();check('Supplier PDF action reports success',()=>assert.match(get('status').textContent,/Supplier PDF สำเร็จ/));
 resetBatch();put('gtinLevel','ean13');w.setMode('batch');put('batchGtin13List',Array(30).fill('8851907346492').join('\n'));put('printPaperSize','A4');put('printOrientation','landscape');put('printGap','5');w.selectBatchItem(0);
 check('Physical paper layout uses level and gap',()=>{const l=w.sheetLayout('ean13');assert.equal(l.cell.w,70);assert.equal(l.cell.h,20);assert.equal(l.cols,3);assert.equal(l.rows,8);assert.equal(l.perPage,24);});
 await w.exportPrintSheetPDF();check('Multipage Vector Sheet succeeds',()=>assert.match(get('status').textContent,/30 ฉลาก • 2 หน้า/));
 await w.printCurrentSetSheet();check('Browser print matches vector layout',()=>{assert(!w.document.body.classList.contains('print-sheet'));assert(printed.includes('repeat(3,70mm)'));assert(printed.includes('grid-auto-rows:20mm'));assert.equal((printed.match(/class="sheet-page"/g)||[]).length,2);});
 put('printGap','0');check('Zero gap honored',()=>{assert.equal(w.sheetLayout('ean13').gap,0);assert.equal(w.sheetLayout('ean13').perPage,40);});
 put('printPaperSize','A3');put('printOrientation','portrait');check('A3 portrait supported',()=>{const l=w.sheetLayout('4');assert.equal(l.paper.w,297);assert.equal(l.paper.h,420);});
 resetBatch();put('batchGtin13List','8851907346492\n4006381333932');w.selectBatchItem(0);const count=downloads.length;await w.downloadBatchZip('svg');
 check('Invalid batch yields zero downloads and visible row error',()=>{assert.equal(downloads.length,count);assert.match(get('status').textContent,/แถว 2/);});
 w.setMode('single');put('gtinLevel','ean13');put('gtin13','123');w.update();await w.downloadPNGPreview();
 check('Invalid single blocked even if handler called directly',()=>{assert.equal(downloads.length,count);assert.match(get('status').textContent,/ส่งออกไม่สำเร็จ/);assert(get('singleActions').querySelector('button').disabled);});
 w.loadSample();w.loadBatchSample();check('Sample uses Lv4 and valid codes',()=>{assert.equal(get('batchGtinLevel').value,'4');assert(w.parseBatchItems().items.every(x=>!w.validateData(x).length));});
 resetBatch();put('batchGtinLevel','ean13then');put('batchGtin13List','8851907346492\n8851907346522');put('batchEan13ThenEnNameList','สินค้าไทยหนึ่ง\nสินค้าไทยสอง');put('batchEan13ThenThNameList','ชื่อไทยหนึ่ง\nชื่อไทยสอง');w.selectBatchItem(0);await w.downloadBatchZip('svg');await saveDownloads();
 fs.writeFileSync(path.join(out,'test-results.json'),JSON.stringify({passed:checks.length,checks,environment:'JSDOM + actual vendored libraries + Skia Canvas adapter; not browser E2E'},null,2));
 console.log(JSON.stringify({passed:checks.length,checks},null,2));dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exit(1)});
