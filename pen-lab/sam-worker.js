import {RUNTIME} from './core.js?v=030';
import {SAM_MODEL,validBox,validPoints,maskCandidates} from './anatomy.js?v=030';
let runtime,model,processor,embeddings,inputs,imageKey='',busy=false;
const emit=(type,data={})=>self.postMessage({type,...data});
const dispose=o=>{for(const v of new Set(Object.values(o||{})))v?.dispose?.();};
self.onmessage=async({data:m})=>{if(busy)return;busy=true;let stage='prepare';try{
 if(m.type==='prepare'){
  runtime=await import(RUNTIME);runtime.env.allowLocalModels=false;runtime.env.useBrowserCache=true;if(runtime.env.backends?.onnx?.wasm&&!self.crossOriginIsolated)runtime.env.backends.onnx.wasm.numThreads=1;
  if(!runtime.Sam2Model||!runtime.Sam2Processor)throw Error('Runtime does not export Sam2Model / Sam2Processor');
  const progress_callback=p=>emit('progress',{file:p.file,status:p.status,progress:p.progress});
  processor=await runtime.Sam2Processor.from_pretrained(SAM_MODEL,{progress_callback});
  model=await runtime.Sam2Model.from_pretrained(SAM_MODEL,{device:'wasm',dtype:{vision_encoder:'fp16',prompt_encoder_mask_decoder:'fp32'},progress_callback});
  if(typeof model.get_image_embeddings!=='function')throw Error('SAM2 image encoder API missing');emit('ready');
 }else if(m.type==='segment'){
  if(!model)throw Error('SAM model not ready');const start=performance.now();const {box,points}=m;
  if(!validBox(box)&&!validPoints(points))throw Error('Provide valid box or positive point');
  if(imageKey!==m.imageKey){stage='encode';emit('stage',{stage});dispose(embeddings);dispose(inputs);embeddings=null;inputs=null;imageKey='';const image=await runtime.RawImage.fromBlob(m.blob);inputs=await processor(image);embeddings=await model.get_image_embeddings(inputs);imageKey=m.imageKey;}
  stage='decode';emit('stage',{stage});const [rh,rw]=inputs.reshaped_input_sizes[0];const prompt={};
  if(validBox(box))prompt.input_boxes=new runtime.Tensor('float32',box.map((v,i)=>v*(i%2?rh:rw)),[1,1,4]);
  else{prompt.input_points=new runtime.Tensor('float32',points.flatMap(p=>[p[0]*rw,p[1]*rh]),[1,1,points.length,2]);prompt.input_labels=new runtime.Tensor('int64',points.map(p=>BigInt(p[2])),[1,1,points.length]);}
  let out,masks;try{out=await model({...embeddings,...prompt});stage='postprocess';const [h,w]=inputs.original_sizes[0];masks=await processor.post_process_masks(out.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);const candidates=maskCandidates(masks[0],Array.from(out.iou_scores.data),w,h);self.postMessage({type:'masks',w,h,candidates,ms:performance.now()-start},candidates.map(c=>c.pixels.buffer));}finally{dispose(prompt);dispose(out);dispose(masks);}
 }
 }catch(e){emit('error',{stage,error:String(e?.message||e)});}finally{busy=false;}};
