"""V0.5 semantic experiment. Learned labels are proposals, never engineering ground truth."""
import json, time
from pathlib import Path
import cv2
import numpy as np
from .deep import analyze, _poly, _path, _root, _group, _svg
from .geometry import optimize_contour
import xml.etree.ElementTree as ET

NAMES = ['Background','Unknown','Upper housing / cap','Pocket clip','Barrel','Grip','Tip / nib','Ring / collar']
COLORS=np.array([[255,255,255],[165,165,165],[130,183,242],[247,190,90],[133,204,172],[203,164,224],[234,133,140],[114,194,204]],np.uint8)

def role(name):
    n=name.lower()
    if 'clip' in n:return 3
    if 'ring' in n or 'collar' in n:return 7
    if 'grip' in n:return 5
    if 'barrel' in n:return 4
    if 'tip' in n or 'nib' in n or 'nose' in n:return 6
    if 'cap' in n or 'housing' in n or 'button' in n:return 2
    return 1

def reference_mask(report, am, hints):
    if hints['source_sha256']!=report['source_sha256']:raise ValueError('Reference belongs to a different image')
    cuts=[0]+hints['cuts']+[am.shape[1]]
    labels=np.zeros_like(am)
    for a,b,name in zip(cuts,cuts[1:],hints['names']):labels[:,a:b]=role(name)
    for item in hints['overlays']:labels[_poly(item['polygon'],am.shape)>0]=role(item['name'])
    labels[am==0]=0
    return labels

def features(rgb, mask):
    h,w=mask.shape; yy,xx=np.indices((h,w)); valid=mask>0
    lab=cv2.cvtColor(rgb,cv2.COLOR_RGB2LAB).astype(np.float32)/255
    out=[lab]
    for sigma in (1.2,3.5,7):
        sm=cv2.GaussianBlur(lab,(0,0),sigma); out.extend([sm,np.abs(lab-sm)])
    g=lab[:,:,0]; gx=cv2.Sobel(g,cv2.CV_32F,1,0,ksize=3);gy=cv2.Sobel(g,cv2.CV_32F,0,1,ksize=3)
    width=valid.sum(0).astype(np.float32); center=(valid*yy).sum(0)/np.maximum(width,1)
    span=np.flatnonzero(width); extent=max(1,span[-1]-span[0]); peak=max(1,width.max())
    dist=cv2.distanceTransform(mask,cv2.DIST_L2,5)/peak
    out.extend([a[:,:,None] for a in [np.abs(gx),np.abs(gy),dist,(xx-span[0])/extent,(yy-center)/np.maximum(width,1),np.broadcast_to(width/peak,(h,w))]])
    return np.concatenate(out,axis=2).astype(np.float32)

def train_local(samples):
    from sklearn.ensemble import RandomForestClassifier
    rng=np.random.default_rng(42); X=[];Y=[]; hashes=[]
    for data,hints in samples:
        r,_,_,_,aligned,am,_=analyze(data); ref=reference_mask(r,am,hints); f=features(aligned,am)
        hashes.append(r['source_sha256'])
        for cls in np.unique(ref):
            if cls==0:continue
            y,x=np.nonzero(ref==cls); sel=rng.choice(len(x),min(3000,len(x)),replace=False);X.append(f[y[sel],x[sel]]);Y.append(np.full(len(sel),cls))
    if not X:raise ValueError('No labeled foreground training pixels')
    model=RandomForestClassifier(n_estimators=48,max_depth=15,min_samples_leaf=5,n_jobs=2,random_state=42,class_weight='balanced_subsample')
    model.fit(np.concatenate(X),np.concatenate(Y));return model,hashes

def predict_local(model, aligned,am,threshold=.65):
    if not 0<=threshold<=1:raise ValueError('Threshold must be between 0 and 1')
    f=features(aligned,am);valid=am>0; probs=model.predict_proba(f[valid]); idx=probs.argmax(1); scores=probs.max(1)
    raw=np.zeros_like(am);raw[valid]=model.classes_[idx]; labels=raw.copy();labels[valid]=np.where(scores>=threshold,model.classes_[idx],1)
    return labels,raw,{'score_threshold':threshold,'accepted_fraction':float(np.mean(scores>=threshold)),'score_note':'Uncalibrated random forest votes, not accuracy.'}

def score(ref,pred):
    if ref.shape!=pred.shape:raise ValueError('Shape mismatch')
    mask=ref>0; rows={}
    for c in sorted(set(np.unique(ref))|set(np.unique(pred))):
        if c in (0,1):continue
        a,b=ref==c,pred==c;u=np.count_nonzero(a|b)
        if u:rows[NAMES[c]]={'iou':float(np.count_nonzero(a&b)/u),'reference_pixels':int(a.sum()),'predicted_pixels':int(b.sum())}
    return {'pixel_accuracy':float(np.mean(ref[mask]==pred[mask])),'macro_part_iou':float(np.mean([x['iou'] for x in rows.values()])) if rows else None,'unknown_fraction':float(np.mean(pred[mask]==1)),'parts':rows,'reference_note':'Manual V0.4 axis hints, approximate visible regions, not independently labeled ground truth.'}

def to_source(labels,M,mask):
    h,w=mask.shape; out=cv2.warpAffine(labels,cv2.invertAffineTransform(M),(w,h),flags=cv2.INTER_NEAREST)
    out[mask==0]=0;out[(mask>0)&(out==0)]=1;return out

def vectorize_labels(labels,mask,contour,tolerance=1.5):
    if labels.shape!=mask.shape or np.any(labels>7):raise ValueError('Invalid part map')
    h,w=mask.shape;root=_root(w,h); root.set('stroke-width','0.9'); assembly=_root(w,h)
    outer,qa=optimize_contour(contour,mask,tolerance=tolerance,min_iou=.98)
    outer_group=_group(assembly,'outer','Observed silhouette',**{'stroke-width':'1.4'});ET.SubElement(outer_group,'path',{'d':outer})
    # clip interior lines to observed silhouette to avoid double outer strokes.
    inner=cv2.erode(mask,np.ones((3,3),np.uint8)); ip,_=_path(inner,tolerance)
    defs=ET.SubElement(assembly,'defs'); cp=ET.SubElement(defs,'clipPath',{'id':'inside'}); ET.SubElement(cp,'path',{'d':ip,'fill':'black','stroke':'none','clip-rule':'evenodd'})
    rows=[]
    for cls in range(1,len(NAMES)):
        m=(labels==cls).astype(np.uint8)*255
        if not m.any():continue
        d,q=_path(m,tolerance); name=NAMES[cls]
        g=_group(root,f'part-{cls}',name,**{'data-status':'needs-review'}); 
        if d:ET.SubElement(g,'path',{'d':d,'fill':'white'})
        # Unknown region is not a named part and gets no inferred seam.
        if cls!=1 and d:
            g=_group(assembly,f'part-{cls}',name,**{'stroke-width':'.8','data-status':'needs-review'});ET.SubElement(g,'path',{'d':d,'clip-path':'url(#inside)'})
        rows.append({'name':name,'pixels':int(np.count_nonzero(m)),'contour_count':len(q),'geometry':q,'status':'needs_review'})
    return {'parts_svg':_svg(root),'svg':_svg(assembly),'outer_geometry':qa,'parts':rows,'export_status':'draft_needs_review','warning':'Closed paths are visible regions only; shared boundaries can have duplicate strokes. Unknown is not a named part.'}

def run_local(data,model,training_hashes,threshold=.65):
    t=time.perf_counter();r,rgb,mask,c,aligned,am,M=analyze(data)
    labels,raw,info=predict_local(model,aligned,am,threshold); source=to_source(labels,M,mask);out=vectorize_labels(source,mask,c)
    out['report']={**r,**info,'provider':'local_supervised_random_forest','training_hashes':training_hashes,'seen_training_image':r['source_sha256'] in training_hashes,'elapsed_total_s':time.perf_counter()-t,'outer_geometry':out.pop('outer_geometry'),'parts':out.pop('parts'),'export_status':out['export_status'],'warning':out['warning']}
    return out,labels,raw,source,aligned,am,rgb
