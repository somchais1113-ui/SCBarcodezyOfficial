"""V0.6 multi-pass part recognition. No simulated or manual fallback in live inference.
Adapter follows Grounded-SAM-2 HF image demo + Transformers SAM2 API (see SOURCES.md).
All candidate masks are mapped to the original decoded image before fusion.
"""
from dataclasses import dataclass, asdict
import inspect, time, math
import cv2
import numpy as np
from PIL import Image
from .deep import analyze
from .recognition import NAMES, COLORS, vectorize_labels

# Single semantic class per prompt; separate synonyms on retry. IDs match V0.5.
PROMPTS={2:('pen cap. pen upper housing. push button of a retractable pen.','pen click button. pen cap.'),3:('pocket clip of a pen. pen clip.','metal pocket clip. plastic pen clip.'),4:('pen barrel. main pen body.','transparent pen barrel. cylindrical pen barrel.'),5:('pen grip. rubber finger grip.','grip section of a fountain pen. pen finger grip.'),6:('pen writing tip. fountain pen nib. pen nose cone.','pen nib. pen point. conical pen tip.'),7:('pen trim ring. pen metal collar.','decorative ring on pen. pen band.')}

@dataclass(frozen=True)
class Settings:
    det:float=.30
    text:float=.25
    sam:float=.70
    foreground:float=.85
    consensus:float=.45
    conflict:float=.08
    max_candidates:int=2
    max_unknown:float=.20
    retry:bool=True
    ocr:bool=False
    def __post_init__(self):
        for k in ('det','text','sam','foreground','consensus','conflict','max_unknown'):
            if not 0<=getattr(self,k)<=1: raise ValueError(k+' must be in [0,1]')
        if not 1<=self.max_candidates<=5: raise ValueError('max_candidates must be 1–5')

@dataclass
class View:
    name:str
    rgb:np.ndarray
    mask:np.ndarray
    to_source:np.ndarray # 2x3 affine, view pixel -> source pixel
    family:str

@dataclass
class Candidate:
    cls:int
    mask:np.ndarray
    score:float
    view:str
    family:str
    meta:dict

class HFBackend:
    """Local model paths / HF repo IDs; download is explicit. Models loaded once per process."""
    def __init__(self,dino='IDEA-Research/grounding-dino-tiny',sam='facebook/sam2.1-hiera-tiny',device='cpu',allow_download=False):
        import torch
        from transformers import AutoProcessor,AutoModelForZeroShotObjectDetection,Sam2Model,Sam2Processor
        self.torch=torch; self.device=device; self.ids=[dino,sam]; self.name='grounding_dino_sam2_hf';kw={'local_files_only':not allow_download}
        self.dp=AutoProcessor.from_pretrained(dino,**kw)
        self.dm=AutoModelForZeroShotObjectDetection.from_pretrained(dino,**kw).to(device).eval()
        self.sp=Sam2Processor.from_pretrained(sam,**kw)
        self.sm=Sam2Model.from_pretrained(sam,**kw).to(device).eval()
    def detect(self,rgb,prompt,s):
        image=Image.fromarray(rgb); h,w=rgb.shape[:2]
        with self.torch.inference_mode():
            batch=self.dp(images=image,text=prompt,return_tensors='pt').to(self.device)
            result=self.dm(**batch); post=self.dp.post_process_grounded_object_detection
            key='threshold' if 'threshold' in inspect.signature(post).parameters else 'box_threshold'
            r=post(result,batch['input_ids'],**{key:s.det,'text_threshold':s.text,'target_sizes':[(h,w)]})[0]
        ids=r['scores'].argsort(descending=True)[:s.max_candidates].cpu().tolist()
        labels=r.get('text_labels',r.get('labels',[]))
        return [(r['boxes'][i].detach().cpu().tolist(),float(r['scores'][i]),str(labels[i]) if len(labels)>i else '') for i in ids]
    def segment(self,rgb,boxes):
        if not boxes:return []
        with self.torch.inference_mode():
            x=self.sp(images=Image.fromarray(rgb),input_boxes=[boxes],return_tensors='pt').to(self.device)
            y=self.sm(**x,multimask_output=True)
            masks=self.sp.post_process_masks(y.pred_masks.cpu(),x['original_sizes'].cpu())[0].numpy()
            scores=y.iou_scores[0].cpu().numpy()
        if masks.ndim!=4 or scores.ndim!=2 or masks.shape[:2]!=scores.shape or masks.shape[0]!=len(boxes):
            raise RuntimeError(f'Unexpected SAM2 tensor shapes {masks.shape}, {scores.shape}')
        return [[(masks[i,j]>0,float(scores[i,j])) for j in range(scores.shape[1])] for i in range(len(boxes))]


def views(rgb,fg,aligned,am,M):
    """Original + axis + 3 overlapping axis crops; no arbitrary upsampling presented as new detail."""
    h,w=fg.shape; y,x=np.nonzero(fg); pad=max(8,int(.025*max(h,w)))
    x0=max(0,int(x.min())-pad);y0=max(0,int(y.min())-pad);x1=min(w,int(x.max())+pad+1);y1=min(h,int(y.max())+pad+1)
    identity=np.array([[1.,0.,0.],[0.,1.,0.]])
    yield View('full',rgb,fg,identity,'full')
    yield View('object_crop',rgb[y0:y1,x0:x1],fg[y0:y1,x0:x1],np.array([[1.,0.,x0],[0.,1.,y0]]),'crop')
    inv=cv2.invertAffineTransform(M)
    yield View('axis',aligned,am,inv,'axis')
    aw=am.shape[1]
    for i,(a,b) in enumerate(((0,.46),(.27,.73),(.54,1))):
        lo=int(aw*a);hi=math.ceil(aw*b);mat=inv.copy();mat[:,2]+=inv[:,0]*lo
        yield View(f'axis_slice_{i+1}',aligned[:,lo:hi],am[:,lo:hi],mat,'slice')


def iou(a,b):
    return float(np.count_nonzero(a&b)/max(1,np.count_nonzero(a|b)))


def run_view(view,backend,classes,settings,source_fg,retry=False):
    out=[]; records=[]; h,w=view.mask.shape; sh,sw=source_fg.shape
    for cls in classes:
        prompt=PROMPTS[cls][int(retry)]; det=backend.detect(view.rgb,prompt,settings)
        boxes=[]; meta=[]
        for box,score,label in det:
            if len(box)!=4 or not np.isfinite(box).all() or not np.isfinite(score) or not settings.det<=score<=1:continue
            x1,y1,x2,y2=box; b=[max(0.,min(w,float(x1))),max(0.,min(h,float(y1))),max(0.,min(w,float(x2))),max(0.,min(h,float(y2)))]
            if b[2]-b[0]<2 or b[3]-b[1]<2:continue
            boxes.append(b);meta.append((float(score),str(label)))
        if not boxes:
            records.append({'view':view.name,'class_id':cls,'prompt':prompt,'status':'no_detection','retry':retry});continue
        preds=backend.segment(view.rgb,boxes)
        if len(preds)!=len(boxes):raise RuntimeError('Segmentation count differs from boxes')
        for box,(score,label),variants in zip(boxes,meta,preds):
            valid=[]
            for m,ss in variants:
                m=np.asarray(m,dtype=bool);ss=float(ss)
                if m.shape!=(h,w) or not m.any() or not np.isfinite(ss) or not settings.sam<=ss<=1:continue
                support=np.count_nonzero(m&(view.mask>0))/m.sum()
                if support<settings.foreground:continue
                # Reject cropped masks cut off by a tile boundary; retry on whole product.
                if view.family=='slice' and (m[:,0].any() or m[:,-1].any()):continue
                src=cv2.warpAffine((m&(view.mask>0)).astype(np.uint8),view.to_source,(sw,sh),flags=cv2.INTER_NEAREST)>0
                src &= source_fg
                if src.sum()<3 or src.sum()>.80*source_fg.sum():continue
                valid.append((score*ss*support,src,ss,support))
            info={'view':view.name,'class_id':cls,'prompt':prompt,'label':label,'box_view_xyxy':box,'detector_score':score,'retry':retry}
            if not valid:records.append({**info,'status':'mask_rejected'});continue
            quality,src,ss,support=max(valid,key=lambda x:x[0]); info.update({'status':'candidate','sam_score':ss,'foreground_fraction':float(support),'quality':float(quality)})
            out.append(Candidate(cls,src,float(quality),view.name,view.family,info));records.append(info)
    return out,records


def fuse(fg,candidates,s):
    """Same-class consensus across genuinely different views; conflict -> unknown, never invent parts."""
    fg=fg>0; labels=np.where(fg,1,0).astype(np.uint8); accepted=[]; summaries=[]; maps={}
    for cls in PROMPTS:
        pool=[c for c in candidates if c.cls==cls]; remaining=sorted(pool,key=lambda c:c.score,reverse=True)
        while remaining:
            lead=remaining.pop(0); group=[lead]+[c for c in remaining if iou(lead.mask,c.mask)>=s.consensus]; ids={id(c) for c in group};remaining=[c for c in remaining if id(c) not in ids]
            # Distinct view families, not repeated prompts on the same crop, count as evidence.
            families=sorted({c.family for c in group}); view_names=sorted({c.view for c in group})
            row={'class_id':cls,'families':families,'views':view_names,'max_score':lead.score,'status':'accepted' if len(families)>=2 else 'single_family_unverified'}
            summaries.append(row)
            if len(families)<2:continue
            # One vote per family; stable intersection for 2 views; majority for >=3.
            reps=[max((c for c in group if c.family==f),key=lambda c:c.score) for f in families]
            votes=np.sum([c.mask for c in reps],axis=0);stable=(votes>len(reps)/2)&fg
            if not stable.any():row['status']='empty_consensus';continue
            val=float(np.mean([c.score for c in reps])); maps[cls]=np.maximum(maps.get(cls,np.zeros(fg.shape,np.float32)),stable*val);accepted.append(cls)
    best=np.zeros(fg.shape,np.float32); second=best.copy()
    for cls,m in maps.items():
        higher=m>best;second=np.where(higher,best,np.maximum(second,m));labels[higher]=cls;best=np.maximum(best,m)
    conflict=(second>0)&((best-second)<s.conflict);labels[conflict]=1;labels[~fg]=0
    return labels,{'consensus_groups':summaries,'conflict_pixels':int(conflict.sum()),'unknown_fraction':float(np.mean(labels[fg]==1)),'confirmed_classes':sorted(set(int(x) for x in np.unique(labels) if x>=2))}


def process(data,backend,s=Settings(),progress=None):
    start=time.perf_counter(); report,rgb,fg,c,aligned,am,M=analyze(data,ocr=s.ocr); source_fg=fg>0; all_c=[]; logs=[]; vv=list(views(rgb,fg,aligned,am,M)); timings=[]
    for v in vv:
        t=time.perf_counter(); cc,rr=run_view(v,backend,PROMPTS,s,source_fg);all_c.extend(cc);logs.extend(rr);timings.append({'view':v.name,'seconds':round(time.perf_counter()-t,3),'candidates':len(cc)})
        if progress:progress(timings[-1])
    labels,qa=fuse(fg,all_c,s)
    missing=[k for k in PROMPTS if k not in qa['confirmed_classes']]
    if s.retry and missing:
        # Retry only unresolved classes, using alternate text and two distinct full views.
        for v in (vv[1],vv[2]):
            t=time.perf_counter();cc,rr=run_view(v,backend,missing,s,source_fg,retry=True);all_c.extend(cc);logs.extend(rr);timings.append({'view':v.name+'_retry','seconds':round(time.perf_counter()-t,3),'candidates':len(cc)})
            if progress:progress(timings[-1])
        labels,qa=fuse(fg,all_c,s)
    out=vectorize_labels(labels,fg,c); outer=out.pop('outer_geometry'); parts=out.pop('parts')
    reasons=[]
    if qa['unknown_fraction']>s.max_unknown:reasons.append('excess_unknown_area')
    if len(qa['confirmed_classes'])<3:reasons.append('insufficient_confirmed_part_classes')
    if not outer.get('within_guard',False):reasons.append('outer_geometry_guard_failed')
    # No automatic approval: IoU compares extracted mask, not semantic truth.
    status='blocked_needs_review' if reasons else 'draft_needs_review'
    out['export_status']=status
    out['report']={**report,**qa,'provider':backend.name,'model_ids':backend.ids,'settings':asdict(s),'passes':timings,'candidate_log':logs,'part_class_names':NAMES,'parts':parts,'outer_geometry':outer,'export_status':status,'block_reasons':reasons,'elapsed_total_s':round(time.perf_counter()-start,3),'warning':'Cross-view consensus is not semantic ground truth. All results require visual review; missing parts are not invented. Not engineering dimensions.'}
    return out,labels,rgb
