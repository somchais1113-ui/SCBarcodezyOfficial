"""Local outline extraction. All output coordinates are image pixels, not CAD units."""
from dataclasses import dataclass
from io import BytesIO
import cv2, numpy as np
from PIL import Image, ImageOps
from skimage.morphology import skeletonize
import xml.etree.ElementTree as ET

@dataclass(frozen=True)
class Settings:
    mode: str = 'technical'
    sensitivity: int = 45
    min_length: int = 16
    simplify: float = 1.0
    outer_width: float = 2.0
    inner_width: float = 1.0
    background_tolerance: int = 24
    max_side: int = 1600
    def __post_init__(self):
        if self.mode not in ('outer','technical','detail'): raise ValueError('Unknown mode')
        for v,lo,hi in [(self.sensitivity,1,100),(self.min_length,2,200),(self.simplify,.1,8),(self.outer_width,.2,5),(self.inner_width,.2,5),(self.background_tolerance,5,100),(self.max_side,128,2000)]:
            if not lo<=v<=hi: raise ValueError('Setting out of range')

def decode(data, max_side=1600):
    if len(data)>15*1024*1024: raise ValueError('Image exceeds 15 MB')
    with Image.open(BytesIO(data)) as im:
        if im.format not in ('JPEG','PNG','WEBP'): raise ValueError('Use JPEG, PNG or WebP')
        if im.width*im.height>24_000_000: raise ValueError('Image exceeds 24 MP')
        im=ImageOps.exif_transpose(im).convert('RGBA'); im.thumbnail((max_side,max_side), Image.Resampling.LANCZOS)
        a=np.array(im); rgb=np.array(Image.alpha_composite(Image.new('RGBA',im.size,'white'),im).convert('RGB'))
    return rgb,a[:,:,3]

def foreground(rgb, alpha, tolerance):
    h,w=alpha.shape
    if min(h,w)<8: raise ValueError('Image too small')
    if np.any(alpha<32) and np.any(alpha>128):
        mask=(alpha>96).astype('uint8')*255
    else:
        lab=cv2.cvtColor(rgb,cv2.COLOR_RGB2LAB).astype(np.float32)
        border=np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])
        bg=np.median(border,axis=0)
        dist=np.linalg.norm(lab-bg,axis=2)
        mask=(dist>tolerance).astype('uint8')*255
    mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
    cs,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    if not cs: raise ValueError('No foreground detected. Use a contrasting plain background or transparent PNG.')
    c=max(cs,key=cv2.contourArea)
    if cv2.contourArea(c)<max(16,h*w*.0005): raise ValueError('Foreground too small')
    mask[:]=0; cv2.drawContours(mask,[c],-1,255,cv2.FILLED)
    return mask,c

def chains(skel):
    """Walk undirected skeleton edges exactly once; split at branch nodes."""
    ys,xs=np.nonzero(skel); pixels=set(zip(xs.tolist(),ys.tolist()))
    graph={}
    for x,y in sorted(pixels):
        adj=[]
        for dx,dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
            q=(x+dx,y+dy)
            if q not in pixels: continue
            if dx and dy and ((x+dx,y) in pixels or (x,y+dy) in pixels): continue
            adj.append(q)
        graph[(x,y)]=adj
    seen=set()
    def walk(a,b):
        pts=[a,b]; seen.add(tuple(sorted((a,b))))
        while len(graph[b])==2:
            c=next(q for q in graph[b] if q!=a); e=tuple(sorted((b,c)))
            if e in seen: break
            seen.add(e); pts.append(c); a,b=b,c
        return pts
    for p in graph:
        if len(graph[p])!=2:
            for q in graph[p]:
                if tuple(sorted((p,q))) not in seen: yield walk(p,q)
    for p in graph:
        for q in graph[p]:
            if tuple(sorted((p,q))) not in seen: yield walk(p,q)

def path_d(points,closed=False):
    p=np.asarray(points).reshape(-1,2)
    return 'M '+' L '.join(f'{x:.2f},{y:.2f}' for x,y in p)+(' Z' if closed else '')

def extract(data, s=Settings()):
    rgb,alpha=decode(data,s.max_side); h,w=alpha.shape
    mask,c=foreground(rgb,alpha,s.background_tolerance)
    warnings=[]
    if np.any(mask[0]) or np.any(mask[-1]) or np.any(mask[:,0]) or np.any(mask[:,-1]): warnings.append('Foreground touches image edge; contour may be clipped.')
    outer=cv2.approxPolyDP(c,s.simplify,True).reshape(-1,2)
    inner=[]
    if s.mode!='outer':
        gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
        gray=cv2.bilateralFilter(gray,7,40,40)
        low=max(8,100-int(s.sensitivity*.85)); high=low*2
        if s.mode=='detail': low=max(5,low//2); high=low*2
        edges=cv2.Canny(gray,low,high,L2gradient=True)
        eroded=cv2.erode(mask,np.ones((7,7),np.uint8)); edges[eroded==0]=0
        n,labs,stats,_=cv2.connectedComponentsWithStats(edges,8)
        keep=np.zeros(n,np.uint8); keep[1:]=((stats[1:,cv2.CC_STAT_AREA]>=s.min_length)*255).astype(np.uint8)
        edges=keep[labs]
        for pts in chains(skeletonize(edges>0)):
            if len(pts)<s.min_length: continue
            closed=pts[0]==pts[-1]; arr=np.array(pts,np.float32).reshape(-1,1,2)
            p=cv2.approxPolyDP(arr,s.simplify,closed).reshape(-1,2)
            if len(p)>=2: inner.append((p,closed))
        warnings.append('Internal lines are image edges, not recognized product parts. Review reflections and missing seams.')
    root=ET.Element('svg',{'xmlns':'http://www.w3.org/2000/svg','viewBox':f'0 0 {w} {h}','width':str(w),'height':str(h),'fill':'none','stroke':'#000000','stroke-linecap':'round','stroke-linejoin':'round'})
    g=ET.SubElement(root,'g',{'id':'outer-contour','stroke-width':str(s.outer_width)})
    ET.SubElement(g,'path',{'id':'outer-001','d':path_d(outer,True)})
    g=ET.SubElement(root,'g',{'id':'internal-detail','stroke-width':str(s.inner_width)})
    for i,(p,closed) in enumerate(inner): ET.SubElement(g,'path',{'id':f'inner-{i+1:04}','d':path_d(p,closed)})
    return {'svg':ET.tostring(root,encoding='unicode'),'engine':'local','width':w,'height':h,'paths':1+len(inner),'vertices':len(outer)+sum(len(p) for p,_ in inner),'warnings':warnings}

def hybrid_input(data,s):
    rgb,alpha=decode(data,s.max_side); mask,_=foreground(rgb,alpha,s.background_tolerance)
    gray=cv2.bilateralFilter(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY),9,55,55)
    rgba=np.dstack([gray,gray,gray,mask]); out=BytesIO(); Image.fromarray(rgba).save(out,format='PNG'); return out.getvalue()
