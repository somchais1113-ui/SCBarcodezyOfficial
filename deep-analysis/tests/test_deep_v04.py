from pathlib import Path
import json, xml.etree.ElementTree as ET
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sc_outline.deep import analyze,reconstruct
from sc_outline.server import app
P=Path(__file__).resolve().parents[1]/'examples/deep'
NS={'s':'http://www.w3.org/2000/svg'}
@pytest.mark.parametrize('name',['fountain','gel'])
def test_guided_partition(name):
    data=(P/f'{name}_source.jpg').read_bytes(); hints=json.loads((P/f'{name}_hints.json').read_text()); result,_,_,_=reconstruct(data,hints);r=result['report'];assert r['partition_coverage']==1 and r['partition_overlap_pixels']==0;assert r['outer_geometry']['mask_iou']>=.98;assert all(p['status']=='needs_review' for p in r['parts']);assert all(p['path_exists'] for p in r['parts']);root=ET.fromstring(result['parts_svg']);assert len(root.findall('.//s:image',NS))==0;assert len([x for x in root.findall('.//s:g',NS) if x.get('data-part-name')])==len(r['parts'])
@pytest.mark.parametrize('name',['fountain','gel'])
def test_auto_not_semantic(name):
    result,*_=reconstruct((P/f'{name}_source.jpg').read_bytes());r=result['report'];assert r['mode']=='automatic_candidates';assert all(p['name'].startswith('Unclassified') for p in r['parts']);assert r['export_status']=='draft_needs_review'
def test_wrong_source():
    data=(P/'gel_source.jpg').read_bytes(); h=json.loads((P/'fountain_hints.json').read_text());
    with pytest.raises(ValueError):reconstruct(data,h)
def test_invalid_cuts():
    data=(P/'gel_source.jpg').read_bytes();h=json.loads((P/'gel_hints.json').read_text());h['cuts']=[40,30];
    with pytest.raises(ValueError):reconstruct(data,h)
def test_provider_fallback():
    data=(P/'gel_source.jpg').read_bytes();h=json.loads((P/'gel_hints.json').read_text());r,*_=reconstruct(data,h,provider=lambda rgb,m,item:np.zeros_like(m));assert any('disagreed' in s for s in r['report']['warnings']);assert r['report']['parts'][-1]['source']=='manual_polygon'
def test_provider_contract():
    data=(P/'gel_source.jpg').read_bytes();h=json.loads((P/'gel_hints.json').read_text());r,*_=reconstruct(data,h,provider=lambda rgb,m,item:m);assert r['report']['parts'][-1]['source']=='provider_candidate'
def test_api():
    client=TestClient(app);data=(P/'gel_source.jpg').read_bytes();files={'image':('gel.jpg',data,'image/jpeg')};r=client.post('/api/deep/analyze',files=files);assert r.status_code==200;assert r.json()['axis_preview'].startswith('data:image/png');r=client.post('/api/deep/reconstruct',files=files);assert r.status_code==200;assert r.json()['report']['export_status']=='draft_needs_review';assert client.get('/deep').status_code==200
