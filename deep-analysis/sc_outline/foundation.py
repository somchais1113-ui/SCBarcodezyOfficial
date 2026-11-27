"""Optional real Grounding DINO + SAM2 backend. Local weights only unless explicitly enabled.
Not a validated pretrained pen-parts model. No manual fallback or synthetic results.
"""
import inspect, time
import numpy as np
from PIL import Image
from .deep import analyze
from .recognition import vectorize_labels, NAMES
PROMPTS={2:'pen cap. pen upper housing. pen push button.',3:'pen pocket clip.',4:'pen barrel. pen body.',5:'pen grip. rubber grip.',6:'pen writing tip. fountain pen nib. pen nose cone.',7:'pen metal ring. pen collar.'}

class FoundationProvider:
    def __init__(self, dino='IDEA-Research/grounding-dino-tiny', sam='facebook/sam2.1-hiera-tiny', device='cpu', allow_download=False):
        import torch
        from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection, Sam2Model, Sam2Processor
        self.torch=torch; self.device=device; self.ids=[dino,sam]
        kw={'local_files_only':not allow_download}
        self.dp=AutoProcessor.from_pretrained(dino,**kw); self.dm=AutoModelForZeroShotObjectDetection.from_pretrained(dino,**kw).to(device).eval()
        self.sp=Sam2Processor.from_pretrained(sam,**kw);self.sm=Sam2Model.from_pretrained(sam,**kw).to(device).eval()
    def predict(self,rgb,foreground,det_threshold=.30,mask_threshold=.70):
        image=Image.fromarray(rgb);h,w=foreground.shape; candidates=[]; rejects=[]
        with self.torch.inference_mode():
            for cls,prompt in PROMPTS.items():
                inputs=self.dp(images=image,text=prompt,return_tensors='pt').to(self.device); outputs=self.dm(**inputs)
                post=self.dp.post_process_grounded_object_detection
                key='threshold' if 'threshold' in inspect.signature(post).parameters else 'box_threshold'
                result=post(outputs,inputs['input_ids'],**{key:det_threshold,'text_threshold':.25,'target_sizes':[(h,w)]})[0]
                if len(result['boxes'])==0:rejects.append({'class':NAMES[cls],'reason':'no_detection'});continue
                order=result['scores'].argsort(descending=True)[:3]
                boxes=result['boxes'][order].detach().cpu().tolist();ds=result['scores'][order].detach().cpu().tolist()
                inputs_s=self.sp(images=image,input_boxes=[boxes],return_tensors='pt').to(self.device)
                s=self.sm(**inputs_s,multimask_output=True)
                masks=self.sp.post_process_masks(s.pred_masks.cpu(),inputs_s['original_sizes'].cpu())[0].numpy(); scores=s.iou_scores[0].cpu().numpy()
                for i,box in enumerate(boxes):
                    j=int(scores[i].argmax()); m=masks[i,j]>0; confidence=float(scores[i,j]); overlap=float(np.count_nonzero(m&(foreground>0))/max(1,m.sum()))
                    entry={'class':NAMES[cls],'detector_score':float(ds[i]),'mask_score':confidence,'box':box,'foreground_fraction':overlap}
                    if confidence<mask_threshold or overlap<.85 or not m.any():rejects.append({**entry,'reason':'mask_quality_gate'});continue
                    m &= foreground>0
                    if m.sum()>.80*np.count_nonzero(foreground):rejects.append({**entry,'reason':'mask_covers_most_of_product'});continue
                    candidates.append((cls,m,float(ds[i])*confidence,entry))
        return resolve(foreground,candidates,rejects)

def resolve(foreground,candidates,rejects):
    labels=np.where(foreground>0,1,0).astype(np.uint8); best=np.zeros_like(foreground,dtype=float); runner=np.zeros_like(best)
    # Combine candidates of same class before comparing confidence across classes.
    maps={}
    for cls,m,s,_ in candidates:maps[cls]=np.maximum(maps.get(cls,np.zeros_like(best)),m*s)
    for cls,confidence in maps.items():
        higher=confidence>best;runner=np.where(higher,best,np.maximum(runner,confidence));labels[higher]=cls;best=np.maximum(best,confidence)
    ambiguous=(runner>0)&((best-runner)<.07);labels[ambiguous]=1;labels[foreground==0]=0
    return labels,{'candidates':[x[3] for x in candidates],'rejected':rejects,'ambiguous_pixels':int(ambiguous.sum()),'unknown_fraction':float(np.mean(labels[foreground>0]==1)),'score_note':'Detector and mask scores are uncalibrated; all candidates require review.'}

def run_foundation(data,provider):
    t=time.perf_counter();r,rgb,mask,c,*_=analyze(data); labels,info=provider.predict(rgb,mask);out=vectorize_labels(labels,mask,c)
    out['report']={**r,**info,'provider':'grounding_dino_sam2','model_ids':provider.ids,'elapsed_total_s':time.perf_counter()-t,'parts':out.pop('parts'),'outer_geometry':out.pop('outer_geometry'),'export_status':out['export_status'],'warning':out['warning']}
    return out,labels,rgb
