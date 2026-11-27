import {MODEL,RUNTIME,modelKey,prepareGroundingInput,normalizeGroundedResult,runRecognitionBenchmark,benchmarkRows} from './core.js?v=030';
let model=null,processor=null,key='',runtime=null,busy=false;
const emit=(type,data={})=>self.postMessage({type,...data});
const progress_callback=p=>emit('download',{progress:{status:p.status,file:p.file,loaded:p.loaded,total:p.total,progress:p.progress}});
self.onmessage=async({data:m})=>{
 if(!['prepare','run'].includes(m.type)||busy)return;busy=true;
 let stage='runtime import';const start=performance.now();
 try{
  if(m.type==='prepare'){
   emit('stage',{stage});
   if(!runtime){runtime=await import(RUNTIME);runtime.env.allowLocalModels=false;runtime.env.useBrowserCache=true;if(runtime.env.backends?.onnx?.wasm&&!self.crossOriginIsolated)runtime.env.backends.onnx.wasm.numThreads=1;}
   const importMs=performance.now()-start;stage='model load';emit('stage',{stage});const load=performance.now();
   if(model){await model.dispose();model=null;}key='';processor=null;
   processor=await runtime.AutoProcessor.from_pretrained(MODEL,{progress_callback});
   model=await runtime.AutoModelForZeroShotObjectDetection.from_pretrained(MODEL,{device:m.device,dtype:m.dtype,progress_callback});
   if(typeof processor.post_process_grounded_object_detection!=='function')throw Error('Runtime lacks Grounding DINO postprocessor');
   key=modelKey(m.device,m.dtype);
   emit('ready',{device:m.device,dtype:m.dtype,model:MODEL,timing:{importMs,loadMs:performance.now()-load,totalMs:performance.now()-start}});
  }else{
   stage='input preparation';if(!model||!processor||key!==modelKey(m.device,m.dtype))throw Error('Model not prepared for this configuration');emit('stage',{stage});
   const begin=performance.now();const image=await runtime.RawImage.fromBlob(m.blob);
   const benchmark=await runRecognitionBenchmark({processor,model,image,prompts:m.prompts,mode:m.mode||'combined',threshold:m.threshold,
    onProgress:p=>{stage=p.stage;emit('benchmark-progress',p);},onDiagnostic:d=>emit('diagnostic',d)});
   const detections=benchmarkRows(benchmark,m.threshold);
   emit('result',{detections,benchmark,dimensions:[image.width,image.height],timing:{inferenceMs:benchmark.passes.reduce((a,p)=>a+p.inferenceMs,0),totalMs:performance.now()-start},reused:true,device:m.device,dtype:m.dtype,model:MODEL});
  }
 }catch(e){emit('failure',{stage,error:String(e?.message||e)});}finally{busy=false;}
};
