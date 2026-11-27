"""V0.4 experimental part-first analysis. Local proposals are not semantic AI.
All geometry uses EXIF-corrected working-image pixels. Axis is an analysis frame only.
"""
import json, time, subprocess, shutil, csv, io, hashlib
from pathlib import Path
import xml.etree.ElementTree as ET
import cv2
import numpy as np
from .engine import decode, foreground, path_d
from .geometry import optimize_contour
from .structured import point

NS='http://www.w3.org/2000/svg'

def axis_frame(rgb, mask):
    y,x=np.nonzero(mask); xy=np.column_stack((x,y)).astype(float)
    c=xy.mean(0); vals,vec=np.linalg.eigh(np.cov(xy.T)); u=vec[:,-1]
    if vals[-1]/max(vals[0],1)<5: raise ValueError('Prototype requires one elongated product')
    if u[1]<0 or (abs(u[1])<.01 and u[0]<0): u=-u
    v=np.array([-u[1],u[0]]); t=(xy-c)@u; s=(xy-c)@v
    lo,hi=np.floor([t.min()-5,s.min()-5]); end,top=np.ceil([t.max()+5,s.max()+5]); origin=c+lo*u+hi*v
    # cv2 warp from source to axis frame; inverse is explicit
    M=np.array([[*u,-origin@u],[*v,-origin@v]],dtype=np.float64)
    size=(int(end-lo+1),int(top-hi+1))
    return cv2.warpAffine(rgb,M,size,flags=cv2.INTER_LINEAR,borderValue=(255,255,255)),cv2.warpAffine(mask,M,size,flags=cv2.INTER_NEAREST),M

def _propose(rgb, mask):
    lab=cv2.cvtColor(rgb,cv2.COLOR_RGB2LAB).astype(float); mask=mask>0; w=mask.shape[1]
    width=mask.sum(0).astype(float); d=max(2,round(w*.006)); scores=np.zeros(w); support=np.zeros(w)
    for x in range(d+2,w-d-2):
        rows=np.flatnonzero(mask[:,x-d]&mask[:,x+d]);
        if len(rows)<8: continue
        rows=rows[len(rows)//5:len(rows)-len(rows)//5]; diff=lab[rows,x+d]-lab[rows,x-d]; med=np.median(diff,0); strength=np.linalg.norm(med)
        coherence=np.mean(diff@med>max(12,strength**2*.35)); support[x]=coherence
        width_change=abs(width[x+d]-width[x-d])/max(8,width[x]);scores[x]=strength*(.2+.8*coherence)+min(20,width_change*45)
    ids=[]
    for x in np.argsort(scores)[::-1]:
        if scores[x]<12 or len(ids)>=10:break
        if x<w*.025 or x>w*.985 or any(abs(x-y)<max(5,w*.022) for y in ids):continue
        ids.append(int(x))
    return [{'x':x,'score':round(float(scores[x]),2),'support':round(float(support[x]),3),'status':'unreviewed'} for x in sorted(ids)]

def _ocr(img):
    if not shutil.which('tesseract'): return {'status':'unavailable','items':[]}
    items=[]; errors=[]; h,w=img.shape[:2]; scale=3
    for rotation in (0,180):
        src=img if rotation==0 else cv2.rotate(img,cv2.ROTATE_180)
        src=cv2.resize(src,None,fx=scale,fy=scale,interpolation=cv2.INTER_CUBIC)
        ok,raw=cv2.imencode('.png',cv2.cvtColor(src,cv2.COLOR_RGB2BGR))
        if not ok:errors.append('encode_failed');continue
        try:
            p=subprocess.run(['tesseract','stdin','stdout','--psm','11','tsv'],input=raw.tobytes(),capture_output=True,timeout=12,check=True)
            rows=csv.DictReader(io.StringIO(p.stdout.decode('utf-8','replace')),delimiter='\t')
            for r in rows:
                if not r.get('text','').strip() or float(r['conf'])<40:continue
                x,y,bw,bh=[int(r[k])/scale for k in ('left','top','width','height')]
                if rotation==180:x,y=w-x-bw,h-y-bh
                items.append({'text':r['text'],'confidence':float(r['conf']),'box':[round(v,2) for v in (x,y,bw,bh)],'rotation':rotation})
        except (subprocess.SubprocessError,ValueError,KeyError) as e:errors.append(str(e)[:160])
    return {'status':'completed' if len(errors)<2 else 'failed','items':items,'errors':errors,'coordinate_system':'axis pixels','note':'Text candidates only; not proof of part geometry. No text paths are traced.'}

def analyze(data, *, ocr=False):
    start=time.perf_counter(); rgb,alpha=decode(data); mask,contour=foreground(rgb,alpha,24); aligned,am,M=axis_frame(rgb,mask)
    return {'source_sha256':hashlib.sha256(data).hexdigest(),'image_size':[rgb.shape[1],rgb.shape[0]],'axis_size':[aligned.shape[1],aligned.shape[0]],'source_to_axis':M.tolist(),'seam_candidates':_propose(aligned,am),'ocr':_ocr(aligned) if ocr else {'status':'disabled','items':[]},'elapsed_s':round(time.perf_counter()-start,3),'status':'needs_review','semantic_provider':'none (local geometric candidates only)'}, rgb,mask,contour,aligned,am,M

def _poly(points, shape):
    p=np.asarray(points,dtype=float)
    if p.ndim!=2 or p.shape[1]!=2 or len(p)<3 or len(p)>200 or not np.isfinite(p).all() or (p<0).any() or (p[:,0]>=shape[1]).any() or (p[:,1]>=shape[0]).any():raise ValueError('Invalid polygon in axis pixels')
    m=np.zeros(shape,np.uint8);cv2.fillPoly(m,[np.rint(p).astype(np.int32)],255);return m

def _path(mask, tolerance=1.5):
    cs,_=cv2.findContours(mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
    paths=[]; reports=[]
    for c in cs:
        if cv2.contourArea(c)<2:continue
        m=np.zeros_like(mask);cv2.drawContours(m,[c],-1,255,-1)
        d,qa=optimize_contour(c,m,tolerance=tolerance,min_iou=.98);paths.append(d);reports.append(qa)
    return ' '.join(paths),reports

def _root(w,h):return ET.Element('svg',{'xmlns':NS,'viewBox':f'0 0 {w} {h}','width':str(w),'height':str(h),'fill':'none','stroke':'#17212e','stroke-linejoin':'round','stroke-linecap':'round','fill-rule':'evenodd'})
def _group(root,id,name,**kwargs):
    g=ET.SubElement(root,'g',{'id':id,'data-part-name':name,**kwargs});ET.SubElement(g,'title').text=name;return g

def _svg(root):return ET.tostring(root,encoding='unicode')

def reconstruct(data, hints=None, *, ocr=False, tolerance=1.5, provider=None):
    report,rgb,mask,c,aligned,am,M=analyze(data,ocr=ocr); h,w=mask.shape; aw=am.shape[1]; ah=am.shape[0]; start=time.perf_counter()
    if hints is not None and not isinstance(hints,dict):raise ValueError('Hints must be an object')
    if hints is not None and hints.get('source_sha256')!=report['source_sha256']:raise ValueError('Hints belong to another source image')
    hints=hints or {}; guided=bool(hints); cuts=hints.get('cuts',[p['x'] for p in report['seam_candidates']]);
    if not isinstance(cuts,list) or len(cuts)>24 or any(type(x) not in (int,float) or not np.isfinite(x) or not 0<x<aw-1 for x in cuts):raise ValueError('Invalid seam cuts')
    cuts=[round(x) for x in cuts]
    if cuts!=sorted(set(cuts)):raise ValueError('Cuts must be strictly increasing and unique')
    names=hints.get('names',[f'Unclassified region {i+1}' for i in range(len(cuts)+1)])
    if not isinstance(names,list) or len(names)!=len(cuts)+1 or any(not isinstance(x,str) or not x.strip() or len(x)>80 for x in names):raise ValueError('One name required per axis region')
    inv=cv2.invertAffineTransform(M); mat=f'matrix({inv[0,0]} {inv[1,0]} {inv[0,1]} {inv[1,1]} {inv[0,2]} {inv[1,2]})'
    # partition in axis frame; overlay parts may occlude base. Original pose is retained.
    overlays=[]; occupied=np.zeros_like(am); warnings=[]
    items=hints.get('overlays',[])
    if not isinstance(items,list):raise ValueError('Overlays must be a list')
    for i,item in enumerate(items):
        if i>=16:raise ValueError('Too many overlays')
        if not isinstance(item,dict) or not isinstance(item.get('name'),str) or not item['name'].strip():raise ValueError('Overlay needs name and polygon')
        raw=_poly(item['polygon'],am.shape); name=str(item['name'])[:80]; source='manual_polygon'; m=raw
        if provider is not None:
            proposed=provider(aligned,raw,item)
            if proposed.shape!=raw.shape:raise ValueError('Provider mask shape mismatch')
            proposed=(proposed>0).astype(np.uint8)*255
            iou=np.count_nonzero((raw>0)&(proposed>0))/max(1,np.count_nonzero((raw>0)|(proposed>0)))
            if iou>=.65:m=proposed;source='provider_candidate'
            else:warnings.append(f'{name}: provider disagreed with hint; retained manual polygon')
        m=cv2.bitwise_and(m,am);m[occupied>0]=0;occupied|=m
        if not np.any(m):warnings.append(f'{name}: empty mask');continue
        # holes are drawn as visible details, not guessed as physical through-holes
        details=[]
        for hole in item.get('details',[]):
            dm=_poly(hole,am.shape); dm=cv2.bitwise_and(dm,m); dd,_=_path(dm,tolerance); 
            if dd:details.append(dd)
        overlays.append((name,m,source,details))
    regions=[]
    bounds=[0]+cuts+[aw]
    for i,(a,b) in enumerate(zip(bounds,bounds[1:])):
        m=np.zeros_like(am);m[:,a:b]=am[:,a:b];m[occupied>0]=0
        if np.any(m):regions.append((names[i],m,'manual_axis_cut' if guided else 'unreviewed_axis_candidate',[]))
        else:warnings.append(f'{names[i]}: empty region')
    regions.extend(overlays); sum_masks=np.sum([m>0 for _,m,_,_ in regions],axis=0); coverage=np.count_nonzero((sum_masks>0)&(am>0))/max(1,np.count_nonzero(am)); overlap=int(np.count_nonzero(sum_masks>1))
    # outer path remains in source coordinates. Assembly draws shared boundaries once.
    outer,outerqa=optimize_contour(c,mask,tolerance=tolerance,min_iou=.98)
    root=_root(w,h);ET.SubElement(_group(root,'outer','Observed outer contour',**{'stroke-width':'1.4'}),'path',{'d':outer})
    aroot=ET.SubElement(root,'g',{'transform':mat,'id':'axis-assembly','stroke-width':'0.9'}); proot=_root(w,h); pg=ET.SubElement(proot,'g',{'transform':mat,'id':'visible-parts','stroke-width':'0.8'}); meta=[]; colors=np.zeros_like(aligned); palette=[(124,185,240),(246,200,120),(150,207,170),(203,167,230),(236,155,155),(123,207,205)]
    for i,(name,m,source,details) in enumerate(regions):
        d,qa=_path(m,tolerance); g=_group(pg,f'part-{i+1}',name,**{'data-source':source});
        if d:ET.SubElement(g,'path',{'d':d,'fill':'white'})
        for dd in details:ET.SubElement(g,'path',{'d':dd})
        yy,xx=np.nonzero(m); anchor=np.array([xx.mean(),yy.mean()]); xy=inv[:,:2]@anchor+inv[:,2];
        meta.append({'id':f'part-{i+1}','name':name,'source':source,'status':'needs_review','pixel_area':len(xx),'anchor_source_px':xy.tolist(),'geometry_contours':qa,'path_exists':bool(d)})
        colors[m>0]=palette[i%len(palette)]
    for x in cuts:
        ys=np.flatnonzero((am[:,x]>0)&(occupied[:,x]==0));
        for segment in np.split(ys,np.flatnonzero(np.diff(ys)>1)+1):
            if len(segment)>1:ET.SubElement(aroot,'path',{'d':f'M {x},{segment[0]} L {x},{segment[-1]}'})
    for i,(name,m,source,details) in enumerate(overlays):
        d,_=_path(m,tolerance);g=_group(aroot,f'overlay-{i+1}',name)
        if d:
            # Closed overlay touching the silhouette: retain the independent closed path in parts SVG,
            # but suppress coincident outer stroke in the assembled drawing using an interior clip.
            cid=f'interior-clip-{i+1}'; defs=ET.SubElement(g,'defs'); cp=ET.SubElement(defs,'clipPath',{'id':cid}); inner=cv2.erode(am,np.ones((3,3),np.uint8)); idd,_=_path(inner,tolerance);
            if idd:ET.SubElement(cp,'path',{'d':idd,'fill':'black','stroke':'none'})
            ET.SubElement(g,'path',{'d':d,'clip-path':f'url(#{cid})'})
        for dd in details:ET.SubElement(g,'path',{'d':dd})
    # annotation copy, with collision-separated labels in a separate margin
    extra=max(180,max((len(p['name']) for p in meta),default=0)*7+35); annotated=ET.fromstring(_svg(root)); annotated.set('width',str(w+extra));annotated.set('viewBox',f'0 0 {w+extra} {max(h,25*(len(meta)+1))}');annotated.set('height',str(max(h,25*(len(meta)+1))))
    ag=ET.SubElement(annotated,'g',{'id':'annotations','stroke':'#64748b','stroke-width':'.7'}); last=0
    order=sorted(meta,key=lambda x:x['anchor_source_px'][1]); positions=[]
    for p in order:
        y=p['anchor_source_px'][1]; last=max(last+20,y,14);positions.append(last)
    if positions and positions[-1]>max(h,25*(len(meta)+1))-14:
        positions[-1]=max(h,25*(len(meta)+1))-14
        for i in range(len(positions)-2,-1,-1):positions[i]=min(positions[i],positions[i+1]-20)
    for p,ly in zip(order,positions):
        x,y=p['anchor_source_px']
        ET.SubElement(ag,'path',{'d':f'M {x:.2f},{y:.2f} L {w+6},{y:.2f} L {w+15},{ly:.2f}'});ET.SubElement(ag,'circle',{'cx':str(x),'cy':str(y),'r':'2','fill':'#64748b'});ET.SubElement(ag,'text',{'x':str(w+19),'y':str(ly+3),'font-size':'11','font-family':'Arial,sans-serif','fill':'#17212e','stroke':'none'}).text=p['name']
    report.update({'mode':'guided' if guided else 'automatic_candidates','parts':meta,'outer_geometry':outerqa,'partition_coverage':coverage,'partition_overlap_pixels':overlap,'part_vector_guard_pass_count':sum(bool(p['geometry_contours']) and all(g['within_guard'] for g in p['geometry_contours']) for p in meta),'reconstruction_s':round(time.perf_counter()-start,3),'warnings':warnings+['Mask coverage is not semantic accuracy. All parts require review.','Only visible 2D regions; hidden geometry and physical dimensions are unknown.','Cuts are straight in analysis frame; curved or oblique joints need manual refinement.'],'export_status':'draft_needs_review'})
    return {'svg':_svg(root),'parts_svg':_svg(proot),'annotated_svg':_svg(annotated),'report':report}, aligned, colors, am
