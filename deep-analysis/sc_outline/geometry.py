"""Bounded, raster-verified contour optimization. Units are working-image pixels."""
import cv2
import numpy as np
from .engine import path_d


def cubic_path(points, closed=True, max_bend=.7):
    """Interpolating cubic with limited normal displacement and monotone chord projection.
    Return SVG and sampled geometry for QA. Endpoints preserved; no rounding of sharp corners.
    """
    p=np.asarray(points,dtype=float); n=len(p); out=[f'M {p[0,0]:.4f},{p[0,1]:.4f}']; samples=[p[0]]
    for i in range(n if closed else n-1):
        a=p[(i-1)%n] if closed or i else p[i]; b=p[i]; c=p[(i+1)%n]; d=p[(i+2)%n] if closed or i+2<n else c
        delta=c-b; length=np.linalg.norm(delta)
        if length<1e-8:continue
        u=delta/length; v=np.array([-u[1],u[0]])
        def limit(q,lo,hi):
            t=q-b;return b+u*np.clip(t@u,lo*length,hi*length)+v*np.clip(t@v,-max_bend,max_bend)
        q=limit(b+(c-a)/6,0,.48); r=limit(c-(d-b)/6,.52,1)
        # At a pronounced corner do not create a tangent that rounds past the junction.
        for near,far,is_first in ((a,b,True),(d,c,False)):
            incoming=(far-near) if is_first else (near-far)
            if np.linalg.norm(incoming)>1e-8 and incoming@u/np.linalg.norm(incoming)<.65:
                if is_first:q=b+delta/3
                else:r=c-delta/3
        q=np.round(q,4);r=np.round(r,4); b=np.round(b,4);c=np.round(c,4)
        out.append(f'C {q[0]:.4f},{q[1]:.4f} {r[0]:.4f},{r[1]:.4f} {c[0]:.4f},{c[1]:.4f}')
        t=np.linspace(0,1,max(4,int(np.ceil(length/1.0))+1))[1:,None];samples.extend((1-t)**3*b+3*(1-t)**2*t*q+3*(1-t)*t*t*r+t**3*c)
    return ' '.join(out)+(' Z' if closed else ''),np.asarray(samples)


def _mask(poly,shape):
    m=np.zeros(shape,np.uint8);cv2.fillPoly(m,[np.rint(poly).astype(np.int32)],1);return m


def _edge(m):
    return m-cv2.erode(m,np.ones((3,3),np.uint8),borderType=cv2.BORDER_CONSTANT,borderValue=0)


def _metrics(reference, candidate, reference_edge, distance):
    edge=_edge(candidate); union=np.count_nonzero(reference|candidate)
    reverse=cv2.distanceTransform(1-edge,cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    return {'mask_iou':float(np.count_nonzero(reference&candidate)/max(1,union)),
            'max_boundary_error_px':float(max(distance[edge>0].max(initial=0),reverse[reference_edge>0].max(initial=0))),
            'area_change_pct':float((candidate.sum(dtype=float)-reference.sum(dtype=float))/max(1,reference.sum(dtype=float))*100)}


def optimize_contour(contour, mask, *, tolerance=2., min_iou=.98, style='optimized', legacy_epsilon=.65):
    if style not in ('optimized','legacy'):raise ValueError('Unknown contour style')
    if isinstance(tolerance,bool) or not isinstance(tolerance,(int,float)) or not .5<=tolerance<=4:raise ValueError('geometry_tolerance must be 0.5–4 px')
    if isinstance(min_iou,bool) or not isinstance(min_iou,(int,float)) or not .95<=min_iou<=1:raise ValueError('min_iou must be 0.95–1')
    reference=(mask>0).astype(np.uint8); edge=_edge(reference);dt=cv2.distanceTransform(1-edge,cv2.DIST_L2,cv2.DIST_MASK_PRECISE)
    raw=contour.reshape(-1,2); legacy=cv2.approxPolyDP(contour,legacy_epsilon,True).reshape(-1,2)
    legacy_metrics=_metrics(reference,_mask(legacy,reference.shape),edge,dt)
    chosen=None
    if style=='optimized':
        for eps in (tolerance*1.15,tolerance*.8,tolerance*.5,tolerance*.25):
            p=cv2.approxPolyDP(contour,eps,True).reshape(-1,2)
            if len(p)<3:continue
            for curve in (True,False):
                d,sampled=cubic_path(p,max_bend=min(.8,tolerance*.4)) if curve else (path_d(p,True),p)
                metrics=_metrics(reference,_mask(sampled,reference.shape),edge,dt)
                if metrics['mask_iou']>=min_iou and metrics['max_boundary_error_px']<=tolerance:
                    chosen=(d,p,metrics,'bounded-cubic' if curve else 'polygon');break
            if chosen:break
        if chosen is None:
            chosen=(path_d(raw,True),raw,_metrics(reference,_mask(raw,reference.shape),edge,dt),'source-fallback')
    else:chosen=(path_d(legacy,True),legacy,legacy_metrics,'legacy')
    d,p,m,method=chosen
    report={**m,'method':method,'vertices':len(p),'legacy_vertices':len(legacy),'source_vertices':len(raw),'legacy_metrics':legacy_metrics,'geometry_tolerance_px':tolerance,'min_iou':min_iou,'within_guard':m['mask_iou']>=min_iou and m['max_boundary_error_px']<=tolerance,'reference':'segmented source mask; raster-sampled curve; not physical dimensions'}
    return d,report
