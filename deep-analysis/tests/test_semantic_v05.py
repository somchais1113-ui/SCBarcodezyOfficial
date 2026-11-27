import json
from pathlib import Path
import numpy as np
import pytest
import xml.etree.ElementTree as ET
from sc_outline.deep import analyze
from sc_outline.recognition import reference_mask,score,to_source,vectorize_labels,train_local,run_local
from sc_outline.foundation import resolve
ROOT=Path(__file__).resolve().parents[1]/'examples/deep'
def sample(name):return (ROOT/f'{name}_source.jpg').read_bytes(),json.loads((ROOT/f'{name}_hints.json').read_text())
def test_reference_is_bound_to_source():
    data,h=sample('gel'); r,_,_,_,_,am,_=analyze(data)
    with pytest.raises(ValueError):reference_mask(r,am,sample('fountain')[1])
    ref=reference_mask(r,am,h);assert np.array_equal(ref>0,am>0)
    assert score(ref,ref)['macro_part_iou']==1

def test_unknown_and_overlap():
    fg=np.ones((10,10),np.uint8)*255;a=np.zeros_like(fg,bool);b=a.copy();a[:,:6]=True;b[:,4:]=True
    labels,info=resolve(fg,[(3,a,.50,{}),(4,b,.52,{})],[])
    assert (labels[:,4:6]==1).all() and (labels[:,:4]==3).all() and (labels[:,6:]==4).all()
    assert info['ambiguous_pixels']==20
    labels,_=resolve(fg,[],[]);assert (labels==1).all()

def test_multiple_same_class_candidates_not_ambiguous():
    fg=np.ones((5,5),np.uint8)*255;m=fg>0
    labels,_=resolve(fg,[(3,m,.6,{}),(3,m,.58,{})],[]);assert (labels==3).all()

def test_unknown_svg_no_fabricated_seams():
    data,_=sample('gel');r,rgb,mask,c,aligned,am,M=analyze(data);labels=np.where(mask>0,1,0).astype(np.uint8)
    out=vectorize_labels(labels,mask,c);xml=ET.fromstring(out['svg']);assert len(xml.findall('.//{*}g'))==1
    assert out['export_status']=='draft_needs_review';assert 'image' not in [x.tag.split('}')[-1] for x in xml.iter()]

def test_learned_model_held_out():
    data,h=sample('gel');model,hashes=train_local([sample('fountain')]);out,labels,raw,source,*_=run_local(data,model,hashes)
    assert not out['report']['seen_training_image'];assert out['report']['provider']=='local_supervised_random_forest';assert out['report']['export_status']=='draft_needs_review'
    assert np.all((labels==raw)|(labels==1));assert ET.fromstring(out['parts_svg']) is not None
