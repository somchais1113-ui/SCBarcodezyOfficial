import numpy as np
import pytest
import cv2
from pathlib import Path
from sc_outline.deep import analyze
from sc_outline.grounded import View,Settings,Candidate,views,run_view,fuse,process
ROOT=Path(__file__).resolve().parents[1]/'examples/deep'

def test_views_map_back():
    for name in ('gel','fountain'):
        r,rgb,fg,c,aligned,am,M=analyze((ROOT/f'{name}_source.jpg').read_bytes())
        vv=list(views(rgb,fg,aligned,am,M));assert len(vv)==6
        assert len({v.name for v in vv})==6
        for v in vv[:3]:
            back=cv2.warpAffine(v.mask,v.to_source,(fg.shape[1],fg.shape[0]),flags=cv2.INTER_NEAREST)>0
            orig=fg>0;assert (back&orig).sum()/(back|orig).sum()>.96
        # union of 3 slices must reconstruct substantially all observed foreground
        union=np.zeros_like(fg,bool)
        for v in vv[3:]:union|=cv2.warpAffine(v.mask,v.to_source,(fg.shape[1],fg.shape[0]),flags=cv2.INTER_NEAREST)>0
        assert (union&(fg>0)).sum()/np.count_nonzero(fg)>.96

def candidate(cls,m,score=.7,view='full',family='full'):
    return Candidate(cls,m,score,view,family,{})

def test_consensus_requires_distinct_families():
    fg=np.ones((20,20),np.uint8);m=np.zeros_like(fg,bool);m[:,2:9]=1
    labels,_=fuse(fg,[candidate(3,m),candidate(3,m,view='full_retry')],Settings());assert np.all(labels==1)
    labels,qa=fuse(fg,[candidate(3,m),candidate(3,m,view='axis',family='axis')],Settings());assert np.all(labels[m]==3) and np.all(labels[~m]==1)
    assert qa['confirmed_classes']==[3]

def test_cross_class_conflict_unknown():
    fg=np.ones((20,20),np.uint8);a=np.zeros_like(fg,bool);a[:,2:12]=1;b=np.zeros_like(a);b[:,8:16]=1
    c=[candidate(3,a),candidate(3,a,view='axis',family='axis'),candidate(4,b),candidate(4,b,view='axis',family='axis')]
    lab,q=fuse(fg,c,Settings());assert np.all(lab[a&b]==1) and q['conflict_pixels']==80

class EmptyTestBackend:
    name='test_double_not_ai';ids=[]
    def __init__(self):self.calls=0
    def detect(self,rgb,prompt,s):self.calls+=1;return []
    def segment(self,*args):raise AssertionError('No boxes should never call SAM')

def test_empty_inference_blocked_and_retry():
    backend=EmptyTestBackend();out,lab,_=process((ROOT/'gel_source.jpg').read_bytes(),backend)
    assert out['export_status']=='blocked_needs_review';assert out['report']['unknown_fraction']==1
    assert len(out['report']['passes'])==8;assert backend.calls==48
    assert out['report']['provider']=='test_double_not_ai';assert not (lab>=2).any()

class BoxTestBackend:
    name='test_double_not_ai';ids=[]
    def detect(self,rgb,prompt,s):return [([3,3,10,12],.9,'clip')]
    def segment(self,rgb,boxes):
        mask=np.zeros(rgb.shape[:2],bool);mask[3:12,3:10]=1
        bad=np.ones(rgb.shape[:2],bool)
        return [[(bad,.99),(mask,.85)] for b in boxes]

def test_mask_quality_selection_and_source_offset():
    rgb=np.full((20,20,3),255,np.uint8);fg=np.zeros((20,20),np.uint8);fg[2:15,2:15]=255
    source=np.zeros((40,40),bool);source[7:20,9:22]=1
    v=View('crop',rgb,fg,np.array([[1.,0.,7.],[0.,1.,5.]]),'crop')
    c,log=run_view(v,BoxTestBackend(),[3],Settings(),source)
    assert len(c)==1;assert c[0].mask.sum()==63;assert c[0].mask[8,10];assert not c[0].mask[3,3]
    assert log[0]['sam_score']==.85

def test_invalid_settings():
    with pytest.raises(ValueError):Settings(det=1.1)
