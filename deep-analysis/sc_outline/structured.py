"""Semi-automatic technical drawing: locked observed silhouette, reviewed part boundaries.
All user coordinates are normalized to the EXIF-corrected source image. No inferred CAD dimensions.
"""
import math
import xml.etree.ElementTree as ET
import cv2
import numpy as np
from .engine import Settings, decode, foreground, path_d
from .geometry import optimize_contour, cubic_path

NS='http://www.w3.org/2000/svg'

def point(p,w,h):
    if not isinstance(p,(list,tuple)) or len(p)!=2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=1 for v in p):
        raise ValueError('Points must be finite normalized [x,y] pairs in [0,1]')
    return np.array([p[0]*(w-1),p[1]*(h-1)])

def suggestions(rgb,mask, improved=True):
    """Find cross-axis transitions on elongated objects; candidate seams, not recognized parts."""
    h,w=mask.shape
    yy,xx=np.nonzero(mask); xy=np.column_stack([xx,yy]).astype(float)
    center=xy.mean(axis=0); vals,vec=np.linalg.eigh(np.cov(xy.T)); axis=vec[:,-1]
    if vals[-1]/max(vals[0],1)<5:return []
    if axis[1]<0 or (abs(axis[1])<.01 and axis[0]<0):axis=-axis
    perp=np.array([-axis[1],axis[0]])
    t=(xy-center)@axis; lo,hi=np.percentile(t,[0.5,99.5]); length=hi-lo
    if length<80:return []
    n=int(min(600,max(80,length))); ts=np.linspace(lo,hi,n)
    us=(xy-center)@perp; span=float(np.percentile(abs(us),98))*1.4
    offsets=np.linspace(-span,span,81)
    grid=center+ts[:,None,None]*axis+offsets[None,:,None]*perp
    mx=grid[:,:,0].astype('float32');my=grid[:,:,1].astype('float32')
    m=cv2.remap(mask,mx,my,cv2.INTER_NEAREST)>0
    lab=cv2.cvtColor(rgb,cv2.COLOR_RGB2LAB).astype('float32'); color=cv2.remap(lab,mx,my,cv2.INTER_LINEAR)
    features=[]; extents=[]
    for i in range(n):
        ids=np.flatnonzero(m[i]); extents.append(ids)
        if len(ids)<8: features.append([0,0,0]);continue
        q=ids[int(len(ids)*.2):max(int(len(ids)*.8),int(len(ids)*.2)+1)]
        features.append(np.median(color[i,q],axis=0))
    f=cv2.GaussianBlur(np.asarray(features,dtype='float32'),(1,5),0)
    delta=np.zeros(n);delta[3:-3]=np.linalg.norm(f[6:]-f[:-6],axis=1)
    if improved:
        # Prefer coherent transverse transitions across the interior over narrow axial glare.
        # Use width transitions as supporting evidence, not semantic recognition.
        width=np.array([len(ids) for ids in extents],dtype=np.float32)
        width=cv2.GaussianBlur(width[:,None],(1,5),0).ravel()
        for i in range(3,n-3):
            shared=m[i-3]&m[i+3]
            ids=np.flatnonzero(shared)
            if len(ids)<12:delta[i]=0;continue
            ids=ids[len(ids)//5:len(ids)-len(ids)//5]
            dif=color[i+3,ids]-color[i-3,ids]
            med=np.median(dif,axis=0); strength=np.linalg.norm(med)
            support=np.mean((dif@med)>max(16,strength*strength*.35))
            wd=abs(width[i+3]-width[i-3])/max(12,width[i])
            delta[i]=strength*(.25+.75*support)+min(10,wd*35)
    candidates=[]; selected=[]
    for i in sorted(range(int(n*.04),int(n*.97)),key=lambda k:delta[k],reverse=True):
        if delta[i]<12 or len(selected)>=8:break
        if len(extents[i])<12 or any(abs(i-j)<max(7,n*.024) for j in selected):continue
        selected.append(i)
    def norm(p):return [round(float(np.clip(p[0]/(w-1),0,1)),6),round(float(np.clip(p[1]/(h-1),0,1)),6)]
    for k,i in enumerate(sorted(selected)):
        ids=extents[i]; a,b=grid[i,ids[0]],grid[i,ids[-1]]
        candidates.append({'id':f'candidate-{k+1}','name':f'Seam {k+1}','kind':'seam','points':[norm(a),norm(b)],'anchor':norm((a+b)/2),'label':False,'reviewed':False})
    return candidates

def curve_d(p,closed=False):
    """Interpolate manually marked points, preserving endpoints. No smoothing of outer contour."""
    if len(p)<3:return path_d(p,closed)
    parts=[f'M {p[0][0]:.2f},{p[0][1]:.2f}']; n=len(p)
    for i in range(n if closed else n-1):
        a=p[(i-1)%n] if closed or i else p[i]; b=p[i]; c=p[(i+1)%n]; d=p[(i+2)%n] if closed or i+2<n else c
        q=b+(c-a)/6; r=c-(d-b)/6
        parts.append(f'C {q[0]:.2f},{q[1]:.2f} {r[0]:.2f},{r[1]:.2f} {c[0]:.2f},{c[1]:.2f}')
    return ' '.join(parts)+(' Z' if closed else '')

def structured(data, parts=None, *, annotations=True, outer_width=2.0, inner_width=1.15, background_tolerance=24, simplify=.65, detail_level="structural", contour_style="optimized", geometry_tolerance=2.0, min_iou=.98, detail_width=.7):
    s=Settings(mode='outer',outer_width=outer_width,inner_width=inner_width,background_tolerance=background_tolerance,simplify=simplify)
    rgb,alpha=decode(data,s.max_side);h,w=alpha.shape;mask,c=foreground(rgb,alpha,s.background_tolerance)
    if detail_level not in ("minimal","structural","detail"):raise ValueError("Unknown detail_level")
    if isinstance(detail_width,bool) or not isinstance(detail_width,(int,float)) or not .2<=detail_width<=5:raise ValueError("detail_width out of range")
    outer_d,geometry=optimize_contour(c,mask,tolerance=geometry_tolerance,min_iou=min_iou,style=contour_style,legacy_epsilon=s.simplify)
    auto=parts is None
    if auto:parts=suggestions(rgb,mask,improved=contour_style!="legacy")
    if not isinstance(parts,list) or len(parts)>64:raise ValueError('Parts must be a list of at most 64 entries')
    normalized=[];ids=set(); shapes=[];labels=[]
    for i,item in enumerate(parts):
        if not isinstance(item,dict):raise ValueError('Invalid part')
        name=item.get('name','Part '+str(i+1));kind=item.get('kind','seam'); ident=item.get('id',f'part-{i+1}')
        if not isinstance(name,str) or not name.strip() or len(name)>80:raise ValueError('Part name must be 1–80 characters')
        if not isinstance(ident,str) or not ident or len(ident)>80 or ident in ids or not all(x.isascii() and (x.isalnum() or x in '-_') for x in ident):raise ValueError('Part IDs must be unique ASCII identifiers')
        ids.add(ident)
        if kind not in ('seam','closed','line','label'):raise ValueError('Unknown part kind')
        raw=item.get('points',[])
        if not isinstance(raw,list) or len(raw)>160 or len(raw)<({'seam':2,'closed':3,'line':2,'label':0}[kind]):raise ValueError('Invalid point count')
        p=[point(v,w,h) for v in raw]; anchor=item.get('anchor',np.mean(raw,axis=0).tolist() if raw else None); a=point(anchor,w,h)
        show=item.get('label',True); smooth=item.get('smooth',False); reviewed=item.get('reviewed',False)
        if any(not isinstance(v,bool) for v in (show,smooth,reviewed)):raise ValueError('Flags must be boolean')
        tier=item.get('tier','structural')
        if tier not in ('structural','detail'):raise ValueError('Unknown part tier')
        item={'id':ident,'name':name,'kind':kind,'points':raw,'anchor':anchor,'label':show,'smooth':smooth,'reviewed':reviewed,'tier':tier};normalized.append(item)
        if detail_level=='minimal' or (detail_level=='structural' and tier=='detail'):continue
        shapes.append((item,p))
        if show:labels.append((item,a))
    has_labels=annotations and bool(labels); fs=max(12,min(25,h*.019));margin=fs*1.4; extra=max(w*.55,fs*24,max((len(i['name']) for i,a in labels),default=0)*fs*.65+fs*7) if has_labels else 0
    canvas_w=w+extra; canvas_h=max(h,margin*2+len(labels)*fs*2.0) if has_labels else h
    root=ET.Element('svg',{'xmlns':NS,'viewBox':f'0 0 {canvas_w:.3f} {canvas_h:.3f}','width':f'{canvas_w:.3f}','height':f'{canvas_h:.3f}','fill':'none','stroke':'#111827','stroke-linecap':'round','stroke-linejoin':'round'})
    g=ET.SubElement(root,'g',{'id':'outer-contour','stroke-width':str(outer_width)});ET.SubElement(g,'path',{'id':'outer-001','d':outer_d})
    structure=ET.SubElement(root,'g',{'id':'structural-parts','stroke-width':str(inner_width)})
    for item,p in shapes:
        g=ET.SubElement(structure,'g',{'id':'structure-'+item['id'],'data-part-name':item['name'],'data-reviewed':str(item['reviewed']).lower(),'data-tier':item['tier'],'stroke-width':str(detail_width if item['tier']=='detail' else inner_width)});ET.SubElement(g,'title').text=item['name']
        if item['kind']!='label':ET.SubElement(g,'path',{'d':(curve_d(p,item['kind']=='closed') if contour_style=='legacy' or item['reviewed'] else cubic_path(p,item['kind']=='closed',max_bend=geometry_tolerance*.5)[0]) if item['smooth'] and len(p)>=3 else path_d(p,item['kind']=='closed')})
    if has_labels:
        ag=ET.SubElement(root,'g',{'id':'annotations','stroke':'#64748b','stroke-width':str(max(.7,inner_width*.8))}); prev=-1e9
        order=sorted(labels,key=lambda t:t[1][1]); gap=fs*2; positions=[]
        for item,a in order:
            y=max(margin,float(a[1]),prev+gap);positions.append(y);prev=y
        if positions[-1]>canvas_h-margin:
            positions[-1]=canvas_h-margin
            for j in range(len(positions)-2,-1,-1):positions[j]=min(positions[j],positions[j+1]-gap)
        for (item,a),y in zip(order,positions):
            x=float(a[0]); ay=float(a[1]); end=w+fs*2.2; elbow=w+fs*.6
            g=ET.SubElement(ag,'g',{'id':'annotation-'+item['id']});ET.SubElement(g,'path',{'d':f'M {x:.2f},{ay:.2f} L {elbow:.2f},{ay:.2f} L {end:.2f},{y:.2f}'});ET.SubElement(g,'circle',{'cx':f'{x:.2f}','cy':f'{ay:.2f}','r':str(max(1.8,fs*.12)),'fill':'#64748b','stroke':'none'});ET.SubElement(g,'text',{'x':f'{end+fs*.5:.2f}','y':f'{y+fs*.32:.2f}','font-family':'Arial,sans-serif','font-size':str(fs),'fill':'#172b3a','stroke':'none'}).text=item['name']
    warnings=['Geometry is locked to the visible source silhouette, not engineering dimensions.','Part boundaries are user-authored or unverified cross-axis candidates. Review before use.']
    if any(mask[0]) or any(mask[-1]) or any(mask[:,0]) or any(mask[:,-1]):warnings.append('Foreground touches the image border; source may be clipped.')
    if not geometry['within_guard']:warnings.append('Contour exceeds requested geometry guard; inspect before use.')
    if auto:warnings.append('Auto suggestions do not identify named parts or detect clips reliably.')
    if any(not i['reviewed'] for i in normalized):warnings.append('One or more parts remain unreviewed.')
    return {'svg':ET.tostring(root,encoding='unicode'),'engine':'structured','width':w,'height':h,'canvas_width':canvas_w,'canvas_height':canvas_h,'paths':1+sum(i['kind']!='label' for i,p in shapes),'parts':normalized,'warnings':warnings,'coordinate_system':'normalized EXIF-corrected image, x/y in [0,1]','auto_suggested':auto,'detail_level':detail_level,'geometry':geometry}
