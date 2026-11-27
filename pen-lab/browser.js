// Public build: no embedded sample photos
(()=>{
const EMBEDDED_SAMPLES={};
const MODEL='onnx-community/grounding-dino-tiny-ONNX';
const RUNTIME='https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
function chooseBackend(requested, report){return requested==='auto'?(report?.gpu?.ok?'webgpu':report?.wasm?.ok?'wasm':null):requested;}
function parsePrompts(s){return [...new Set(s.split(',').map(x=>x.trim().toLowerCase().replace(/\.+$/,'')).filter(Boolean))].slice(0,20).map(x=>x+'.');}
function normalizeBoxes(items,w,h){return items.flatMap(r=>{const b=r.box||{};const v=[b.xmin,b.ymin,b.xmax,b.ymax];if(!v.every(Number.isFinite)||!Number.isFinite(r.score))return [];const [x1,y1,x2,y2]=v.map((n,i)=>Math.max(0,Math.min(i%2?h:w,n)));return x2>x1&&y2>y1?[{label:String(r.label),score:r.score,box:[x1,y1,x2,y2]}]:[];});}
async function wasmProbe(){const t=performance.now();try{const bytes=new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]);const {instance}=await WebAssembly.instantiate(bytes);if(instance.exports.add(21,21)!==42)throw Error('Wrong output');return {ok:true,ms:performance.now()-t};}catch(e){return {ok:false,error:String(e)};}}
async function gpuProbe(){const t=performance.now();let d;try{if(!navigator.gpu)throw Error('WebGPU unavailable');const a=await navigator.gpu.requestAdapter();if(!a)throw Error('No GPU adapter');d=await a.requestDevice();const b=d.createBuffer({size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});const read=d.createBuffer({size:4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const mod=d.createShaderModule({code:'@group(0) @binding(0) var<storage, read_write> out: array<u32>; @compute @workgroup_size(1) fn main(){out[0]=42u;}'});const p=await d.createComputePipelineAsync({layout:'auto',compute:{module:mod,entryPoint:'main'}});const group=d.createBindGroup({layout:p.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:b}}]});const enc=d.createCommandEncoder(),pass=enc.beginComputePass();pass.setPipeline(p);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();enc.copyBufferToBuffer(b,0,read,0,4);d.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const value=new Uint32Array(read.getMappedRange())[0];read.unmap();if(value!==42)throw Error('Wrong GPU result');return {ok:true,ms:performance.now()-t,maxBufferMB:Math.round(d.limits.maxBufferSize/1048576),shaderF16:a.features.has('shader-f16')};}catch(e){return {ok:false,error:String(e)};}finally{d?.destroy();}}
function modelKey(device,dtype){return `${device}/${dtype}`;}
function getReadiness(s){
 const modelReady=!!s.device&&s.readyKey===modelKey(s.device,s.dtype);
 const blocked=reason=>({canPrepare:false,canRun:false,modelReady,reason});
 if(s.protocol==='file:')return blocked('ยังเริ่ม AI ไม่ได้: เปิดผ่าน Launcher หรือ HTTPS (file:// ใช้ Preview ได้เท่านั้น)');
 if(!s.secure)return blocked('ต้องเปิดผ่าน HTTPS หรือ localhost ที่เป็น secure context');
 if(s.busy)return blocked('กำลังทำงาน — กดหยุดได้หากต้องการยกเลิก');
 if(s.probing||!s.report)return blocked('ตรวจสอบอุปกรณ์ก่อนเตรียมโมเดล');
 if(!s.device||!(s.device==='webgpu'?s.report.gpu?.ok:s.report.wasm?.ok))return blocked('Backend ที่เลือกไม่ผ่าน smoke test — เปลี่ยน Backend หรือกดตรวจสอบอุปกรณ์');
 if(!s.consent)return blocked('ติ๊กยินยอมดาวน์โหลด Runtime และ Model ก่อน');
 if(!modelReady)return {canPrepare:true,canRun:false,modelReady,reason:'กด 01 — โหลด / เตรียมโมเดล ก่อนเริ่มตรวจจับ'};
 if(s.loading||!s.hasImage)return {canPrepare:false,canRun:false,modelReady,reason:'โมเดลพร้อมแล้ว — เลือกภาพก่อนเริ่มตรวจจับ'};
 if(!s.prompts?.length||!(s.threshold>=.05&&s.threshold<=.95))return {canPrepare:false,canRun:false,modelReady,reason:'ตรวจสอบ Part prompts และ Detection threshold (0.05–0.95)'};
 return {canPrepare:false,canRun:true,modelReady,reason:'พร้อม — กด 02 เพื่อเริ่มตรวจจับชิ้นส่วนจริง'};
}

// Grounding DINO's exported ONNX graph expects a single image/text batch.
function buildGroundingText(prompts){
 const clean=Array.isArray(prompts)?prompts.map(x=>String(x).trim().toLowerCase().replace(/[.\s]+$/g,'')).filter(Boolean):[];
 if(!clean.length)throw Error('At least one part prompt is required');
 return [...new Set(clean)].join('. ')+'.';
}
async function prepareGroundingInput(processor,image,prompts){
 const text=buildGroundingText(prompts);
 const inputs=await processor(image,text);
 const dims=Array.from(inputs?.input_ids?.dims??[]);
 if(dims.length!==2||dims[0]!==1||dims[1]<1)throw Error(`Grounding DINO input_ids must have shape [1, tokens]; received [${dims.join(', ')}]`);
 return {inputs,text,dims};
}
function normalizeGroundedResult(results,w,h){
 if(!Array.isArray(results)||results.length!==1)throw Error('Grounding DINO postprocessor must return one image result');
 const r=results[0];const labels=r.text_labels??r.labels;
 if(!Array.isArray(r.boxes)||!Array.isArray(r.scores)||!Array.isArray(labels)||r.boxes.length!==r.scores.length||r.boxes.length!==labels.length)throw Error('Unexpected Grounding DINO postprocessor result format');
 return normalizeBoxes(r.boxes.map((b,i)=>({box:{xmin:b[0],ymin:b[1],xmax:b[2],ymax:b[3]},score:r.scores[i],label:labels[i]})),w,h);
}

// Phase 02: keep the successful single-batch contract, evaluate each prompt separately.
function sweepThresholds(selected){
 if(!Number.isFinite(selected)||selected<.05||selected>.95)throw Error('Invalid detection threshold');
 return [...new Set([.2,.25,.3,.4,selected])].sort((a,b)=>a-b);
}
function benchmarkPlan(prompts,mode,selected){
 const clean=parsePrompts(prompts.join(','));if(!clean.length)throw Error('At least one part prompt is required');
 if(!['individual','combined','compare'].includes(mode))throw Error('Invalid benchmark mode');
 const plan=[];if(mode!=='individual')plan.push({id:'combined',prompts:clean,kind:'combined'});
 if(mode!=='combined')clean.forEach((p,i)=>plan.push({id:`part-${i+1}`,prompts:[p],kind:'individual'}));
 return {passes:plan,thresholds:sweepThresholds(selected)};
}
async function runRecognitionBenchmark({processor,model,image,prompts,mode,threshold,onProgress=()=>{},onDiagnostic=()=>{}}){
 const {passes,thresholds}=benchmarkPlan(prompts,mode,threshold);const results=[];
 for(const [i,pass] of passes.entries()){
  onProgress({index:i+1,total:passes.length,passId:pass.id,prompts:pass.prompts,stage:'input preparation'});
  const {inputs,text,dims}=await prepareGroundingInput(processor,image,pass.prompts);
  onDiagnostic({text,inputIdsShape:dims,passId:pass.id});
  onProgress({index:i+1,total:passes.length,passId:pass.id,prompts:pass.prompts,stage:'inference'});
  const start=performance.now();const outputs=await model(inputs);const inferenceMs=performance.now()-start;
  try{
   onProgress({index:i+1,total:passes.length,passId:pass.id,prompts:pass.prompts,stage:'threshold sweep'});
   const sweeps=[];for(const t of thresholds){
    const raw=await processor.post_process_grounded_object_detection(outputs,inputs.input_ids,{box_threshold:t,text_threshold:t,target_sizes:[[image.height,image.width]]});
    sweeps.push({threshold:t,detections:normalizeGroundedResult(raw,image.width,image.height)});
   }
   results.push({...pass,text,inputIdsShape:dims,inferenceMs,sweeps});
  }finally{for(const value of new Set(Object.values(outputs||{}))){if(typeof value?.dispose==='function')value.dispose();}}
  onProgress({index:i+1,total:passes.length,passId:pass.id,prompts:pass.prompts,stage:'pass completed'});
 }
 return {passes:results,thresholds,mode};
}
function benchmarkRows(benchmark,threshold,passId='all'){
 return benchmark.passes.filter(p=>passId==='all'?p.kind==='individual'||benchmark.mode==='combined':p.id===passId).flatMap(p=>{
 const sweep=p.sweeps.find(s=>Math.abs(s.threshold-threshold)<1e-6);
 return (sweep?.detections??[]).map(d=>({...d,passId:p.id,query:p.prompts.join(' ')}));
 });
}

const ANATOMY={capped:[['cap','Cap','pen cap'],['clip','Clip','pocket clip'],['barrel','Barrel','transparent pen barrel'],['grip','Grip','finger grip'],['nose','Nose','pen nose cone'],['tip','Tip','writing tip']],retractable:[['button','Push button','pen push button'],['clip','Clip','pocket clip'],['housing','Upper housing','upper pen housing'],['barrel','Barrel','pen barrel'],['grip','Grip','rubber grip'],['nose','Nose','pen nose cone'],['tip','Tip','writing tip']],fountain:[['cap','Cap','pen cap'],['clip','Clip','pocket clip'],['ring','Ring','metal trim ring'],['barrel','Barrel','pen barrel'],['grip','Grip','grip section'],['nib','Nib','fountain pen nib']]};
const SAM_MODEL='onnx-community/sam2.1-hiera-tiny-ONNX';
function partPrompts(type){return ANATOMY[type].map(p=>p[2]).join(', ');}
function validBox(b){return Array.isArray(b)&&b.length===4&&b.every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&b[2]-b[0]>.001&&b[3]-b[1]>.001;}
function normalizedBox(a,b){return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])].map(x=>Math.min(1,Math.max(0,x)));}
function maskCandidates(tensor,scores,w,h){const dims=Array.from(tensor.dims||[]),n=dims.at(-3),size=w*h;if(dims.at(-1)!==w||dims.at(-2)!==h||!Number.isInteger(n)||n<1||n>3||tensor.data.length!==n*size||scores.length<n)throw Error('Unexpected SAM mask dimensions');return Array.from({length:n},(_,i)=>{const pixels=new Uint8Array(size);let count=0;for(let j=0;j<size;j++){const on=Number(tensor.data[i*size+j])>0;pixels[j]=on?1:0;count+=on?1:0;}return {pixels,score:Number(scores[i]),area:count/size,index:i};});}
function validPoints(points){return Array.isArray(points)&&points.length>0&&points.length<=24&&points.every(p=>Array.isArray(p)&&p.length===3&&p.slice(0,2).every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&[0,1].includes(p[2]))&&points.some(p=>p[2]===1);}
function matchingCandidates(benchmark,query,threshold,w,h){if(!benchmark)return [];const norm=s=>String(s).toLowerCase().trim().replace(/\.+$/,'');return benchmark.passes.filter(p=>p.kind==='individual'&&norm(p.prompts[0])===norm(query)).flatMap(p=>(p.sweeps.find(s=>Math.abs(s.threshold-threshold)<1e-6)?.detections||[]).map(d=>({...d,box:d.box.map((v,i)=>v/(i%2?h:w))}))).filter(d=>validBox(d.box)).sort((a,b)=>b.score-a.score).slice(0,15);}
function encodeRLE(pixels){const runs=[];let last=0,count=0;for(const p of pixels){const v=p?1:0;if(v===last)count++;else{runs.push(count);count=1;last=v;}}runs.push(count);return runs;}

const $=id=>document.getElementById(id);let report=null,blob=null,img=null,worker=null,busy=false,probing=false,result=null,history=[],imageName='',seq=0,loading=false;let readyKey="",phase="idle",jobTimer=null,workerToken=0;
const isFile=location.protocol==='file:';
const imageStatus=s=>{$('image-status').textContent=s;log(s);};
function deadline(p,ms,label){let timer;return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]).finally(()=>clearTimeout(timer));}

const log=s=>{$('log').textContent+=`${new Date().toLocaleTimeString()} ${s}\n`;};
const status=s=>{$('status').textContent=s;log(s);};
function config(){return {device:chooseBackend($('device').value,report),dtype:$('dtype').value};}
function readiness(){const c=config();return getReadiness({protocol:location.protocol,secure:isSecureContext,busy,probing,report,consent:$('consent').checked,device:c.device,dtype:c.dtype,readyKey,hasImage:!!img,loading,prompts:parsePrompts($('prompts').value),threshold:Number($('threshold').value)});}
function update(){const r=readiness();$('prepare').disabled=!r.canPrepare;$('run').disabled=!r.canRun;$('stop').disabled=!worker;$('action-help').textContent=r.reason;$('model-state').textContent=busy?(phase==='prepare'?'Preparing…':'Running…'):r.modelReady?'Model ready':readyKey?'Settings changed':'Not loaded';$('model-state').dataset.ready=String(r.modelReady&&!busy);for(const id of ['probe','device','dtype','threshold','prompts','mode'])$(id).disabled=busy||probing;for(const id of ['fountain','gel','file','consent'])$(id).disabled=busy;$('launch-help').hidden=!isFile;updatePlan();if(typeof updateAssisted==='function')updateAssisted();}
function stat(k,v){const d=document.createElement('div');d.className='stat';const a=document.createElement('small');a.textContent=k;const b=document.createElement('strong');b.textContent=v;d.append(a,b);return d;}
async function probe(){if(busy||probing)return;probing=true;update();$('recommend').textContent='กำลังตรวจสอบ...';try{const [wasm,gpu,storage]=await Promise.all([wasmProbe(),deadline(gpuProbe(),10000,'GPU probe timed out').catch(e=>({ok:false,error:String(e)})),deadline(Promise.resolve(navigator.storage?.estimate?.()),3000,'Storage probe timed out').catch(()=>null)]);report={secure:isSecureContext,isolated:crossOriginIsolated,wasm,gpu,cores:navigator.hardwareConcurrency??null,memoryGB:navigator.deviceMemory??null,storage:storage?{quota:storage.quota,usage:storage.usage}:null,userAgent:navigator.userAgent};$('stats').replaceChildren(stat('Secure context',report.secure?'Yes':'No'),stat('WebGPU compute',gpu.ok?'PASS':'Unavailable'),stat('WASM execution',wasm.ok?'PASS':'FAIL'),stat('Logical cores',report.cores??'Unknown'),stat('RAM hint (browser)',report.memoryGB?`~${report.memoryGB} GB`:'Not exposed'),stat('Origin storage quota',storage?`${(storage.quota/1e9).toFixed(1)} GB`:'Unknown'));$('recommend').textContent=`Auto: ${chooseBackend('auto',report)||'Unsupported'} · smoke tests เท่านั้น ไม่ยืนยันว่า AI model จะรันสำเร็จ · ${gpu.ok?'GPU test '+gpu.ms.toFixed(0)+' ms':gpu.error}`;log('Device probe completed');}catch(e){status(String(e));}finally{probing=false;update();}}
function draw(canvas,boxes=[]){if(!img)return;canvas.width=img.width;canvas.height=img.height;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,img.width,img.height);c.drawImage(img,0,0);const colors=['#ff6900','#1375b9','#008765','#8e44ad'];boxes.forEach((d,i)=>{const [x,y,x2,y2]=d.box,col=colors[i%colors.length];c.strokeStyle=col;c.lineWidth=Math.max(1,Math.max(img.width,img.height)/360);c.strokeRect(x,y,x2-x,y2-y);c.font=`${Math.max(11,Math.round(img.width/50))}px sans-serif`;const s=`${d.label} ${(d.score*100).toFixed(0)}%`;const h=Math.max(15,img.width/35),ww=c.measureText(s).width+6, yy=Math.max(0,y-h),xx=Math.max(0,Math.min(x,img.width-ww));c.fillStyle=col;c.fillRect(xx,yy,ww,h);c.fillStyle='white';c.fillText(s,xx+3,yy+h-3);});}
async function decodeImage(b){
  if(typeof createImageBitmap==='function'){try{return await createImageBitmap(b);}catch(e){log('ImageBitmap decode failed; trying image element');}}
  const url=URL.createObjectURL(b);try{const el=new Image();await deadline(new Promise((resolve,reject)=>{el.onload=resolve;el.onerror=()=>reject(Error('ไม่สามารถอ่านภาพนี้ได้ (ลอง JPG, PNG หรือ WebP)'));el.src=url;}),15000,'หมดเวลารออ่านภาพ');return el;}finally{URL.revokeObjectURL(url);}
}
async function load(b,n,prompt){if(busy)return;const ticket=++seq;penPanel.clear('');loading=true;imageStatus('กำลังอ่านภาพ '+n);update();let decoded;try{
 if(!b||!b.size||b.size>20*1024*1024)throw Error('รองรับภาพขนาด 1 byte ถึง 20 MB');
 decoded=await decodeImage(b);if(ticket!==seq){decoded.close?.();return;}
 if(decoded.width*decoded.height>20000000){decoded.close?.();throw Error('ภาพเกิน 20 megapixels');}
 if(!decoded.width||!decoded.height)throw Error('ขนาดภาพไม่ถูกต้อง');
 if(img)img.close?.();img=decoded;blob=b;imageName=n;result=null;$('benchmark-results').hidden=true;draw($('source'));$('result').width=img.width;$('result').height=img.height;$('detections').replaceChildren();if(prompt)$('prompts').value=prompt;
 resetAssisted();penPanel.start(img,n);
 imageStatus(`โหลดภาพสำเร็จ: ${n} · ${img.width} × ${img.height} px`);status('ภาพพร้อม — ยังไม่ได้รันโมเดล');
 }catch(e){if(ticket===seq){imageStatus('เปิดภาพไม่สำเร็จ: '+String(e.message||e)+(img?' · ยังแสดงภาพก่อนหน้า':''));}}finally{if(ticket===seq){loading=false;update();}}}
async function sample(name){if(typeof assistInitialized!=='undefined'&&assistInitialized){partType=name==='fountain'?'fountain':'retractable';$('anatomy-type').value=partType;}const bytes=Uint8Array.from(atob(EMBEDDED_SAMPLES[name]),x=>x.charCodeAt(0));await load(new Blob([bytes],{type:'image/jpeg'}),name+'.jpg',partPrompts(partType));}
function finish(){clearTimeout(jobTimer);jobTimer=null;busy=false;phase='idle';$('progress').hidden=true;update();}
function release(){workerToken++;if(worker){worker.terminate();worker=null;}readyKey='';}
function stop(){if(busy)history.push({status:'cancelled',phase,image:imageName});release();finish();status('หยุดแล้ว — คืน session ของโมเดล (ไฟล์ cache อาจยังอยู่)');}
function table(rows){const t=document.createElement('table');const h=t.createTHead().insertRow();['Query','Model label','Score','Box (px)'].forEach(s=>{const th=document.createElement('th');th.textContent=s;h.append(th);});for(const d of rows){const r=t.insertRow();for(const v of [d.query||'—',d.label,(100*d.score).toFixed(1)+'%',d.box.map(x=>x.toFixed(1)).join(', ')])r.insertCell().textContent=v;} $('detections').replaceChildren(t);}
function startJob(kind){if(typeof samBusy!=='undefined'&&samBusy){status('SAM กำลังทำงาน');return;}if(typeof releaseSam==='function')releaseSam();const r=readiness();if(kind==='prepare'?!r.canPrepare:!r.canRun){status(r.reason);return;}const {device,dtype}=config(),threshold=Number($('threshold').value),prompts=parsePrompts($('prompts').value);busy=true;phase=kind;if(kind==='run'){result=null;$('benchmark-results').hidden=true;$('detections').replaceChildren();$('result').width=img.width;$('result').height=img.height;}else{readyKey='';}$('progress').hidden=false;$('progress').removeAttribute('value');$('download-detail').textContent='';update();status(kind==='prepare'?`Preparing model: ${device} / ${dtype}`:`Running actual inference: ${device} / ${dtype}`);const request={device,dtype,threshold,prompts,mode:$('mode').value,image:kind==='run'?imageName:null};let token;
function fail(stage,error){history.push({status:'failed',phase:kind,...request,stage,error});release();finish();status(`FAILED [${stage}]: ${error} — ${/input_ids|dimensions|shape/i.test(error)?'ปัญหารูปแบบข้อมูลเข้าโมเดล กรุณาส่งรายงาน JSON':stage==='runtime import'||stage==='model load'?'ตรวจอินเทอร์เน็ต หรือทดลอง WASM แล้วเตรียมโมเดลใหม่':'ส่งรายงาน JSON เพื่อตรวจสาเหตุ หากเป็น GPU operator ให้ลอง WASM'}`);}
try{if(!worker){worker=new Worker('./worker.js?v=030',{type:'module'});workerToken++;}token=workerToken;const arm=()=>{clearTimeout(jobTimer);jobTimer=setTimeout(()=>{if(token===workerToken&&busy)fail('timeout','ไม่มีความคืบหน้าจาก Worker เกิน 10 นาที');},600000);};arm();worker.onerror=e=>{if(token===workerToken)fail('worker',e.message||'Worker could not start');};worker.onmessageerror=()=>{if(token===workerToken)fail('worker','อ่านผลจาก Worker ไม่ได้');};worker.onmessage=({data:m})=>{if(token!==workerToken||!busy)return;arm();if(m.type==='benchmark-progress'){status(`Pass ${m.index}/${m.total} — ${m.prompts.join(' ')} · ${m.stage}`);$('progress').max=m.total;$('progress').value=m.stage==='pass completed'?m.index:m.index-1;history.push({status:'benchmark-progress',...m});}else if(m.type==='stage'){status(m.stage);$('progress').removeAttribute('value');}else if(m.type==='diagnostic'){log(`Grounding text: ${m.text} | input_ids shape: [${m.inputIdsShape.join(', ')}]`);history.push({status:'input-validated',...m});}else if(m.type==='download'){const p=m.progress;const percent=Number.isFinite(p.progress)?Math.max(0,Math.min(100,p.progress)):null;if(percent!==null){$('progress').max=100;$('progress').value=percent;}else $('progress').removeAttribute('value');if(p.status!=='progress')log(`${p.status} ${p.file||''}`);$('download-detail').textContent=`${p.status}: ${p.file||'model'} ${percent!==null?percent.toFixed(1)+'%':''} ${Number.isFinite(p.loaded)?' · '+(p.loaded/1e6).toFixed(1)+' MB':''} ${Number.isFinite(p.total)?'/ '+(p.total/1e6).toFixed(1)+' MB':''} (ไฟล์ปัจจุบัน)`;}else if(m.type==='ready'&&kind==='prepare'){if(m.device!==device||m.dtype!==dtype){fail('prepare','Model configuration mismatch');return;}readyKey=modelKey(device,dtype);history.push({status:'model-ready',...m});finish();status(`Model ready — ${device} / ${dtype} · กดเริ่มตรวจจับชิ้นส่วนได้`);}else if(m.type==='result'&&kind==='run'){if(m.dimensions[0]!==img.width||m.dimensions[1]!==img.height){fail('verification','Dimension mismatch: result rejected');return;}result={...m,request};history.push({status:'completed',...result});showBenchmark(m);finish();status(`Benchmark completed: ${m.benchmark.passes.length} passes · ${(m.timing.totalMs/1000).toFixed(2)} s total · candidates not validated`);}else if(m.type==='failure'){fail(m.stage,m.error);}};worker.postMessage({type:kind,...request,...(kind==='run'?{blob}: {})});}catch(e){fail('start',String(e));}}
function updatePlan(){try{const p=benchmarkPlan(parsePrompts($('prompts').value),$('mode').value,Number($('threshold').value));$('sweep-plan').textContent=p.thresholds.map(t=>t.toFixed(2)).join(' / ');$('pass-count').textContent=String(p.passes.length);}catch{$('pass-count').textContent='—';$('sweep-plan').textContent='—';}}
function option(value,label){const el=document.createElement('option');el.value=value;el.textContent=label;return el;}
function showBenchmark(m){const b=m.benchmark;const matrix=document.createElement('table');const head=matrix.createTHead().insertRow();for(const name of ['Prompt / pass',...b.thresholds.map(t=>t.toFixed(2)),'Inference (s)']){const th=document.createElement('th');th.textContent=name;head.append(th);}const body=matrix.createTBody();for(const p of b.passes){const row=body.insertRow();const label=p.kind==='combined'?'Combined (baseline)':p.prompts.join(' ');row.insertCell().textContent=label;for(const sweep of p.sweeps){const c=row.insertCell();c.textContent=sweep.detections.length?`${sweep.detections.length} · ${(Math.max(...sweep.detections.map(d=>d.score))*100).toFixed(0)}%`:'0';c.className=sweep.detections.length?'found':'empty';}row.insertCell().textContent=(p.inferenceMs/1000).toFixed(2);}
 $('benchmark-matrix').replaceChildren(matrix);$('benchmark-summary').textContent=`จำนวน candidate · คะแนนสูงสุด (ไม่ใช่ accuracy) | ${b.passes.length} inference passes | ${m.device} / ${m.dtype}`;
 $('view-threshold').replaceChildren(...b.thresholds.map(t=>option(t,t.toFixed(2))));$('view-threshold').value=String(Number(m.request?.threshold??$('threshold').value));
 $('view-pass').replaceChildren(option('all',b.mode==='combined'?'Combined':'All individual prompts'),...b.passes.map(p=>option(p.id,p.kind==='combined'?'Combined baseline':p.prompts.join(' '))));$('benchmark-results').hidden=false;renderBenchmarkView();}
function renderBenchmarkView(){if(!result?.benchmark)return;const rows=benchmarkRows(result.benchmark,Number($('view-threshold').value),$('view-pass').value);draw($('result'),rows);table(rows);}
$('view-threshold').onchange=renderBenchmarkView;$('view-pass').onchange=renderBenchmarkView;
$('probe').onclick=probe;$('fountain').onclick=()=>sample('fountain');$('gel').onclick=()=>sample('gel');$('file').onchange=async e=>{try{const f=e.target.files[0];e.target.value='';if(f)await load(f,f.name);}catch(e){status(String(e));}};for(const id of ['consent','device','dtype','threshold','prompts','mode']){$(id).addEventListener('change',update);$(id).addEventListener('input',update);}$('prepare').onclick=()=>startJob('prepare');$('run').onclick=()=>startJob('run');$('stop').onclick=stop;$('save').onclick=()=>{const data={version:'0.3.0',timestamp:new Date().toISOString(),model:MODEL,runtime:RUNTIME,deviceReport:report,modelReadyKey:readyKey,history,assisted:typeof assistedReport==='function'?assistedReport():null,log:$('log').textContent};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='scwork-v030-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};$('boot-status').textContent=isFile?'เปิด HTML โดยตรง: Preview ใช้ได้ แต่ AI ต้องเปิดผ่าน localhost หรือ HTTPS':'Preview พร้อมใช้งาน — เลือกภาพได้ก่อนเตรียมโมเดล';$('boot-status').dataset.ready='true';update();probe();

// Browser-only assisted workflow. No template-generated masks.
var assistInitialized=false;
let partType='capped',partId='cap',parts={},samWorker=null,samBusy=false,samReady=false,samTimer=null,samGeneration=0,samImageBlob=null,samImageKey='',dragStart=null,dragEnd=null,assistEvents=[];
const assistCanvas=$('assist-canvas');
const currentPart=()=>parts[partId];
const partDefinition=()=>ANATOMY[partType].find(p=>p[0]===partId);
function newPart(){return {box:null,points:[],origin:null,history:[],candidates:[],choice:0,accepted:null,na:false};}
function resetAssisted(){if(!assistInitialized)return;releaseSam();parts=Object.fromEntries(ANATOMY[partType].map(p=>[p[0],newPart()]));partId=ANATOMY[partType][0][0];samImageBlob=null;samImageKey='';assistEvents=[];dragStart=dragEnd=null;renderAssisted();}
function samStatus(s){$('sam-status').textContent=s;}
function releaseSam(){samGeneration++;clearTimeout(samTimer);samWorker?.terminate();samWorker=null;samReady=false;samBusy=false;if(assistInitialized){samStatus('SAM session released — เตรียมโมเดลใหม่เมื่อต้องการใช้');updateAssisted();}}
function invalidate(p){p.candidates=[];p.choice=0;p.accepted=null;p.na=false;}
function remember(p){p.history.push({box:p.box?.slice()||null,points:p.points.map(q=>q.slice()),origin:p.origin});if(p.history.length>40)p.history.shift();}
function editPrompt(fn){const p=currentPart();if(!p||!img||samBusy||busy)return;remember(p);fn(p);invalidate(p);renderAssisted();}
function candidatesForPart(){return img&&result?.benchmark?matchingCandidates(result.benchmark,partDefinition()?.[2],Number($('view-threshold').value||$('threshold').value),img.width,img.height):[];}
function updateAssisted(){if(!assistInitialized)return;const p=currentPart(),locked=busy||samBusy||loading;const valid=p&&(validBox(p.box)||validPoints(p.points));const active=p?.candidates[p.choice];for(const id of ['anatomy-type','apply-anatomy','assist-tool','assist-undo','assist-clear','part-na','part-reset','part-candidate','use-candidate','mask-choice','mask-accept','mask-download','assist-export','sam-consent'])$(id).disabled=!!locked;
 $('sam-load').disabled=locked||samReady||isFile||!isSecureContext||!$('sam-consent').checked||!report?.wasm?.ok;
 $('sam-run').disabled=locked||!img||!samReady||!$('sam-consent').checked||!valid||p?.na;
 $('sam-stop').disabled=!samWorker;
 $('assist-undo').disabled=locked||!p?.history.length;$('assist-clear').disabled=locked||!img;$('part-na').disabled=locked||!img;$('part-reset').disabled=locked||!img;
 $('use-candidate').disabled=locked||!candidatesForPart().length;$('mask-choice').disabled=locked||!p?.candidates.length;$('mask-accept').disabled=locked||!active||active.area<=0;$('mask-download').disabled=locked||!p?.accepted;$('assist-export').disabled=locked||!img;
 if(samBusy){for(const id of ['prepare','run','probe','file','fountain','gel','device','dtype','threshold','mode','prompts','consent'])$(id).disabled=true;}
 const select=$('part-candidate'),cs=candidatesForPart(),prior=select.value;select.replaceChildren(...(cs.length?cs.map((d,i)=>option(i,`${d.label} · ${(d.score*100).toFixed(1)}%`)):[option('','ไม่พบ candidate จาก prompt นี้')]));if(cs.some((_,i)=>String(i)===prior))select.value=prior;
 $('part-info').textContent=p?`${partDefinition()?.[1]||partId} · ${p.na?'ไม่เห็น / ไม่มี':p.accepted?'ผู้ใช้ยืนยัน Mask แล้ว':p.candidates.length?'มี AI Mask รอตรวจ':p.box||p.points.length?'มีคำกำกับ ('+p.origin+')':'ยังไม่มีคำกำกับ'}${isFile?' · SAM ต้องเปิดผ่าน localhost/HTTPS':''}`:'';
 for(const b of $('part-list').querySelectorAll('button'))b.disabled=locked;
}
function renderAssisted(){if(!assistInitialized)return;const p=currentPart();$('part-list').replaceChildren(...ANATOMY[partType].map(([id,name])=>{const b=document.createElement('button');b.className='assist-part'+(id===partId?' active':'');b.textContent=name;const state=document.createElement('small'),v=parts[id];state.textContent=v.na?'N/A':v.accepted?'Confirmed':v.candidates.length?'AI mask':v.box||v.points.length?'Guided':'Unknown';b.append(state);b.onclick=()=>{if(busy||samBusy)return;partId=id;dragStart=dragEnd=null;renderAssisted();};return b;}));$('mask-choice').replaceChildren(...(p.candidates.length?p.candidates.map((m,i)=>option(i,`Mask ${i+1} · IoU ${Number.isFinite(m.score)?m.score.toFixed(3):'N/A'} · area ${(m.area*100).toFixed(2)}%`)):[option('','ยังไม่มี Mask')]));if(p.candidates.length)$('mask-choice').value=String(p.choice);paintAssist();updateAssisted();}
function paintAssist(){if(!img)return;const ratio=Math.min(1,1800/Math.max(img.width,img.height));const w=Math.max(1,Math.round(img.width*ratio)),h=Math.max(1,Math.round(img.height*ratio));if(assistCanvas.width!==w||assistCanvas.height!==h){assistCanvas.width=w;assistCanvas.height=h;}const z=Number($('assist-zoom').value),vp=assistCanvas.parentElement,base=Math.min(vp.clientWidth-4,(vp.clientHeight-4)*w/h);assistCanvas.style.width=`${Math.max(1,base)*z}px`;assistCanvas.style.height='auto';const ctx=assistCanvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);const p=currentPart();const candidate=p?.candidates[p.choice]||p?.accepted?.mask;if(candidate){const c=document.createElement('canvas');c.width=candidate.w;c.height=candidate.h;const cc=c.getContext('2d'),d=cc.createImageData(c.width,c.height);for(let i=0;i<candidate.pixels.length;i++)if(candidate.pixels[i]){d.data[i*4]=0;d.data[i*4+1]=180;d.data[i*4+2]=132;d.data[i*4+3]=110;}cc.putImageData(d,0,0);ctx.drawImage(c,0,0,w,h);}
 const box=dragStart&&dragEnd?normalizedBox(dragStart,dragEnd):p?.box;const unit=Math.max(2,w/300);if(box){ctx.strokeStyle='#ff6900';ctx.lineWidth=unit;ctx.strokeRect(box[0]*w,box[1]*h,(box[2]-box[0])*w,(box[3]-box[1])*h);}for(const [x,y,pos] of p?.points||[]){ctx.beginPath();ctx.arc(x*w,y*h,unit*2.5,0,Math.PI*2);ctx.fillStyle=pos?'#008765':'#e23939';ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=unit;ctx.stroke();}}
function pointer(e){const r=assistCanvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
assistCanvas.addEventListener('pointerdown',e=>{if(!img||busy||samBusy||loading||e.button!==0)return;const a=pointer(e),tool=$('assist-tool').value;if(tool==='box'){dragStart=dragEnd=a;assistCanvas.setPointerCapture(e.pointerId);paintAssist();}else{editPrompt(p=>{p.box=null;if(p.points.length<24)p.points.push([...a,tool==='positive'?1:0]);p.origin='user-points';});}});
assistCanvas.addEventListener('pointermove',e=>{if(dragStart){dragEnd=pointer(e);paintAssist();}});
assistCanvas.addEventListener('pointerup',e=>{if(!dragStart)return;const box=normalizedBox(dragStart,pointer(e));dragStart=dragEnd=null;if(validBox(box))editPrompt(p=>{p.box=box;p.points=[];p.origin='user-box';});else paintAssist();});
assistCanvas.addEventListener('pointercancel',()=>{dragStart=dragEnd=null;paintAssist();});
$('assist-zoom').onchange=paintAssist;window.addEventListener('resize',()=>{if(img)paintAssist();});
$('anatomy-type').onchange=()=>{if(Object.values(parts).some(p=>p.box||p.points.length||p.accepted||p.na)&&!confirm('เปลี่ยนประเภทสินค้าและล้างคำกำกับเดิม?')){$('anatomy-type').value=partType;return;}partType=$('anatomy-type').value;resetAssisted();$('prompts').value=partPrompts(partType);$('mode').value='individual';update();};
$('apply-anatomy').onclick=()=>{$('prompts').value=partPrompts(partType);$('mode').value='individual';update();};
$('assist-undo').onclick=()=>{const p=currentPart(),prev=p.history.pop();if(prev){Object.assign(p,prev);invalidate(p);renderAssisted();}};
$('assist-clear').onclick=()=>editPrompt(p=>{p.box=null;p.points=[];p.origin=null;});
$('part-reset').onclick=()=>{parts[partId]=newPart();renderAssisted();};
$('part-na').onclick=()=>{parts[partId]=newPart();parts[partId].na=true;renderAssisted();};
$('use-candidate').onclick=()=>{const d=candidatesForPart()[Number($('part-candidate').value)];if(d)editPrompt(p=>{p.box=d.box.slice();p.points=[];p.origin='dino-proposal';});};
$('view-threshold').addEventListener('change',updateAssisted);
$('sam-consent').onchange=updateAssisted;
function armSam(){clearTimeout(samTimer);samTimer=setTimeout(()=>{assistEvents.push({type:'error',stage:'timeout'});releaseSam();update();samStatus('SAM timeout — ไม่มีความคืบหน้าเกิน 10 นาที');},600000);}
function samError(stage,error){assistEvents.push({type:'error',stage,error});releaseSam();update();samStatus(`SAM FAILED [${stage}]: ${error}`);}
$('sam-load').onclick=()=>{if($('sam-load').disabled)return;release();finish();releaseSam();samBusy=true;const token=samGeneration;update();samStatus('กำลังโหลด SAM2.1 — WASM');try{samWorker=new Worker('./sam-worker.js?v=030',{type:'module'});armSam();samWorker.onerror=e=>{if(token===samGeneration)samError('worker',e.message||'Worker failed');};samWorker.onmessageerror=()=>{if(token===samGeneration)samError('worker','Invalid response');};samWorker.onmessage=({data:m})=>{if(token!==samGeneration)return;armSam();if(m.type==='progress')samStatus(`SAM ${m.status}: ${m.file||''} ${Number.isFinite(m.progress)?m.progress.toFixed(1)+'%':''}`);else if(m.type==='stage')samStatus('SAM — '+m.stage);else if(m.type==='ready'){clearTimeout(samTimer);samBusy=false;samReady=true;assistEvents.push({type:'sam-ready',device:'wasm'});update();samStatus('SAM ready — เลือกชิ้นส่วนแล้วกำกับกรอบ/จุด');}else if(m.type==='masks'){clearTimeout(samTimer);samBusy=false;const p=currentPart();p.candidates=m.candidates.map(x=>({...x,w:m.w,h:m.h}));p.choice=p.candidates.reduce((best,c,i,a)=>c.area>0&&(a[best].area<=0||c.score>a[best].score)?i:best,0);p.accepted=null;assistEvents.push({type:'sam-result',part:partId,origin:p.origin,w:m.w,h:m.h,ms:m.ms,scores:p.candidates.map(x=>({score:x.score,area:x.area}))});update();renderAssisted();samStatus(`SAM returned ${m.candidates.length} masks · ${(m.ms/1000).toFixed(2)} s — ตรวจ Overlay ก่อนยืนยัน`);}else if(m.type==='error')samError(m.stage,m.error);};samWorker.postMessage({type:'prepare'});}catch(e){samError('start',String(e));}};
$('sam-run').onclick=async()=>{if($('sam-run').disabled)return;samBusy=true;update();samStatus('เตรียมภาพสำหรับ SAM');const token=samGeneration;try{if(!samImageBlob){const s=Math.min(1,1600/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*s));c.height=Math.max(1,Math.round(img.height*s));c.getContext('2d').drawImage(img,0,0,c.width,c.height);samImageBlob=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('Image conversion failed')),'image/png'));samImageKey=String(seq);}if(token!==samGeneration||!samWorker)return;const p=currentPart();armSam();samWorker.postMessage({type:'segment',blob:samImageBlob,imageKey:samImageKey,box:p.box,points:p.points});}catch(e){if(token===samGeneration)samError('image',String(e));}};
$('sam-stop').onclick=()=>{releaseSam();update();};
$('mask-choice').onchange=()=>{const p=currentPart(),next=Number($('mask-choice').value);if(next!==p.choice)p.accepted=null;p.choice=next;renderAssisted();};
$('mask-accept').onclick=()=>{const p=currentPart(),m=p.candidates[p.choice];if(!m||!m.area)return;p.accepted={mask:m,confirmedAt:new Date().toISOString(),origin:p.origin};renderAssisted();};
function downloadBlob(b,name){const url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('mask-download').onclick=()=>{const m=currentPart().accepted?.mask;if(!m)return;const c=document.createElement('canvas');c.width=m.w;c.height=m.h;const cc=c.getContext('2d'),data=cc.createImageData(m.w,m.h);for(let i=0;i<m.pixels.length;i++){const v=m.pixels[i]?255:0;data.data.set([v,v,v,255],i*4);}cc.putImageData(data,0,0);c.toBlob(b=>{if(b)downloadBlob(b,`${partId}-mask.png`);},'image/png');};
function assistedReport(){return {version:'0.3.0',image:{name:imageName,width:img?.width,height:img?.height},anatomy:partType,model:SAM_MODEL,parts:ANATOMY[partType].map(([id,name,query])=>{const p=parts[id],m=p.accepted?.mask;return {id,name,query,origin:p.origin,box:p.box,points:p.points,status:p.na?'not-visible':m?'user-confirmed':p.candidates.length?'unvalidated-mask':p.box||p.points.length?'guided':'unknown',candidates:p.candidates.map(x=>({score:x.score,area:x.area,index:x.index})),accepted:m?{width:m.w,height:m.h,score:m.score,area:m.area,index:m.index,confirmedAt:p.accepted.confirmedAt,encoding:'row-major binary RLE starts with zero run',runs:encodeRLE(m.pixels)}:null};}),events:assistEvents};}
$('assist-export').onclick=()=>downloadBlob(new Blob([JSON.stringify(assistedReport(),null,2)],{type:'application/json'}),'scwork-v030-anatomy.json');
assistInitialized=true;resetAssisted();update();

})();
