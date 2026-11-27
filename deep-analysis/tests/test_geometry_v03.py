from pathlib import Path
from io import BytesIO
import json, xml.etree.ElementTree as ET
import numpy as np
from PIL import Image, ImageDraw
import pytest
from sc_outline.structured import structured
from fastapi.testclient import TestClient
from sc_outline.server import app

B=Path('examples/pen.jpg').read_bytes(); P=json.loads(Path('examples/pen_parts_v03.json').read_text()); N={'s':'http://www.w3.org/2000/svg'}

def fixture(kind):
    im=Image.new('RGBA',(260,720),(255,255,255,0));d=ImageDraw.Draw(im)
    if kind=='ballpoint':
        d.rounded_rectangle((106,35,155,620),radius=12,fill='#496682');d.rectangle((112,12,149,44),fill='#273e52');d.polygon([(106,610),(155,610),(135,688),(126,688)],fill='#333333');d.rectangle((108,470,153,595),fill='#222222')
    elif kind=='gel':
        d.rounded_rectangle((96,25,164,665),radius=18,fill=(160,205,218,145));d.rectangle((126,75,133,610),fill='#152b45');d.rectangle((96,510,164,620),fill='#4d849d');d.polygon([(100,633),(160,633),(131,700)],fill='#334455')
    elif kind=='pencil':
        d.rounded_rectangle((108,35,151,630),radius=6,fill='#666666');d.rectangle((118,10,141,42),fill='#333333');d.polygon([(108,625),(151,625),(137,680),(122,680)],fill='#999999');d.rectangle((128,679,131,701),fill='#333333');d.line((117,46,117,510),fill='#dddddd',width=5)
    else:
        d.rounded_rectangle((83,80,177,660),radius=12,fill='#d9e34b');d.rounded_rectangle((77,20,183,220),radius=12,fill='#3b5962');d.rectangle((88,230,172,590),fill='#cbd845')
    out=BytesIO();im.save(out,format='PNG');return out.getvalue()

@pytest.mark.parametrize('kind',['ballpoint','gel','pencil','highlighter'])
def test_synthetic(kind):
    r=structured(fixture(kind),[]); g=r['geometry'];assert g['within_guard'];assert g['mask_iou']>=.98;assert g['max_boundary_error_px']<=2;assert r['paths']==1
    assert all(not p['reviewed'] for p in structured(fixture(kind))['parts'])

def test_levels_and_lock():
    rr=[structured(B,P,detail_level=l) for l in ('minimal','structural','detail')];assert [r['paths'] for r in rr]==[1,11,13];assert all(len(r['parts'])==len(P) for r in rr)
    roots=[ET.fromstring(r['svg']) for r in rr];assert len({r.find('.//s:g[@id="outer-contour"]/s:path',N).get('d') for r in roots})==1
    assert not roots[0].findall('.//s:text',N);assert len(roots[1].findall('.//s:text',N))==8
    assert all(r['geometry']['within_guard'] for r in rr)

def test_legacy_and_strict():
    a=structured(B,P,contour_style='legacy');b=structured(B,P,geometry_tolerance=1);assert a['geometry']['method']=='legacy';assert b['geometry']['within_guard'];assert b['geometry']['max_boundary_error_px']<=1
    original=ET.fromstring(Path('examples/pen_structured.svg').read_text());legacy=ET.fromstring(a['svg']);assert original.find('.//s:g[@id="outer-contour"]/s:path',N).get('d')==legacy.find('.//s:g[@id="outer-contour"]/s:path',N).get('d')

def test_invalid_v03():
    for kw in [{'geometry_tolerance':0},{'detail_level':'bad'},{'min_iou':float('nan')},{'contour_style':'bad'}]:
        with pytest.raises(ValueError):structured(B,P,**kw)

def test_api_v03():
    c=TestClient(app);assert c.get('/api/status').json()['version']=='0.4.0'
    r=c.post('/api/structured',files={'image':('pen.jpg',B,'image/jpeg')},data={'parts':json.dumps(P),'settings':json.dumps({'detail_level':'minimal'})});assert r.status_code==200;assert r.json()['paths']==1;assert r.json()['geometry']['within_guard']
    assert 'Overlay output silhouette' in c.get('/structured').text
