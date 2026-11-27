export const MODEL='onnx-community/grounding-dino-tiny-ONNX';
export const RUNTIME='https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
export function chooseBackend(requested, report){return requested==='auto'?(report?.gpu?.ok?'webgpu':report?.wasm?.ok?'wasm':null):requested;}
export function parsePrompts(s){return [...new Set(s.split(',').map(x=>x.trim().toLowerCase().replace(/\.+$/,'')).filter(Boolean))].slice(0,20).map(x=>x+'.');}
export function normalizeBoxes(items,w,h){return items.flatMap(r=>{const b=r.box||{};const v=[b.xmin,b.ymin,b.xmax,b.ymax];if(!v.every(Number.isFinite)||!Number.isFinite(r.score))return [];const [x1,y1,x2,y2]=v.map((n,i)=>Math.max(0,Math.min(i%2?h:w,n)));return x2>x1&&y2>y1?[{label:String(r.label),score:r.score,box:[x1,y1,x2,y2]}]:[];});}
export async function wasmProbe(){const t=performance.now();try{const bytes=new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]);const {instance}=await WebAssembly.instantiate(bytes);if(instance.exports.add(21,21)!==42)throw Error('Wrong output');return {ok:true,ms:performance.now()-t};}catch(e){return {ok:false,error:String(e)};}}
export async function gpuProbe(){const t=performance.now();let d;try{if(!navigator.gpu)throw Error('WebGPU unavailable');const a=await navigator.gpu.requestAdapter();if(!a)throw Error('No GPU adapter');d=await a.requestDevice();const b=d.createBuffer({size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});const read=d.createBuffer({size:4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const mod=d.createShaderModule({code:'@group(0) @binding(0) var<storage, read_write> out: array<u32>; @compute @workgroup_size(1) fn main(){out[0]=42u;}'});const p=await d.createComputePipelineAsync({layout:'auto',compute:{module:mod,entryPoint:'main'}});const group=d.createBindGroup({layout:p.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:b}}]});const enc=d.createCommandEncoder(),pass=enc.beginComputePass();pass.setPipeline(p);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();enc.copyBufferToBuffer(b,0,read,0,4);d.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const value=new Uint32Array(read.getMappedRange())[0];read.unmap();if(value!==42)throw Error('Wrong GPU result');return {ok:true,ms:performance.now()-t,maxBufferMB:Math.round(d.limits.maxBufferSize/1048576),shaderF16:a.features.has('shader-f16')};}catch(e){return {ok:false,error:String(e)};}finally{d?.destroy();}}
export function modelKey(device,dtype){return `${device}/${dtype}`;}
export function getReadiness(s){
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
export function buildGroundingText(prompts){
 const clean=Array.isArray(prompts)?prompts.map(x=>String(x).trim().toLowerCase().replace(/[.\s]+$/g,'')).filter(Boolean):[];
 if(!clean.length)throw Error('At least one part prompt is required');
 return [...new Set(clean)].join('. ')+'.';
}
export async function prepareGroundingInput(processor,image,prompts){
 const text=buildGroundingText(prompts);
 const inputs=await processor(image,text);
 const dims=Array.from(inputs?.input_ids?.dims??[]);
 if(dims.length!==2||dims[0]!==1||dims[1]<1)throw Error(`Grounding DINO input_ids must have shape [1, tokens]; received [${dims.join(', ')}]`);
 return {inputs,text,dims};
}
export function normalizeGroundedResult(results,w,h){
 if(!Array.isArray(results)||results.length!==1)throw Error('Grounding DINO postprocessor must return one image result');
 const r=results[0];const labels=r.text_labels??r.labels;
 if(!Array.isArray(r.boxes)||!Array.isArray(r.scores)||!Array.isArray(labels)||r.boxes.length!==r.scores.length||r.boxes.length!==labels.length)throw Error('Unexpected Grounding DINO postprocessor result format');
 return normalizeBoxes(r.boxes.map((b,i)=>({box:{xmin:b[0],ymin:b[1],xmax:b[2],ymax:b[3]},score:r.scores[i],label:labels[i]})),w,h);
}

// Phase 02: keep the successful single-batch contract, evaluate each prompt separately.
export function sweepThresholds(selected){
 if(!Number.isFinite(selected)||selected<.05||selected>.95)throw Error('Invalid detection threshold');
 return [...new Set([.2,.25,.3,.4,selected])].sort((a,b)=>a-b);
}
export function benchmarkPlan(prompts,mode,selected){
 const clean=parsePrompts(prompts.join(','));if(!clean.length)throw Error('At least one part prompt is required');
 if(!['individual','combined','compare'].includes(mode))throw Error('Invalid benchmark mode');
 const plan=[];if(mode!=='individual')plan.push({id:'combined',prompts:clean,kind:'combined'});
 if(mode!=='combined')clean.forEach((p,i)=>plan.push({id:`part-${i+1}`,prompts:[p],kind:'individual'}));
 return {passes:plan,thresholds:sweepThresholds(selected)};
}
export async function runRecognitionBenchmark({processor,model,image,prompts,mode,threshold,onProgress=()=>{},onDiagnostic=()=>{}}){
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
export function benchmarkRows(benchmark,threshold,passId='all'){
 return benchmark.passes.filter(p=>passId==='all'?p.kind==='individual'||benchmark.mode==='combined':p.id===passId).flatMap(p=>{
 const sweep=p.sweeps.find(s=>Math.abs(s.threshold-threshold)<1e-6);
 return (sweep?.detections??[]).map(d=>({...d,passId:p.id,query:p.prompts.join(' ')}));
 });
}
