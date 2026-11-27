from pathlib import Path
import json,xml.etree.ElementTree as ET
import pytest
from sc_outline.structured import structured
from fastapi.testclient import TestClient
from sc_outline.server import app
B=Path('examples/pen.jpg').read_bytes(); P=json.loads(Path('examples/pen_parts.json').read_text()); N={'s':'http://www.w3.org/2000/svg'}
def test_clean_annotated_lock():
 a=structured(B,P); b=structured(B,P,annotations=False); c=structured(B,[])
 roots=[ET.fromstring(r['svg']) for r in [a,b,c]]
 assert len({r.find('.//s:g[@id="outer-contour"]/s:path',N).get('d') for r in roots})==1
 assert a['paths']==11 and c['paths']==1
 assert roots[0].find('.//s:g[@id="annotations"]',N) is not None
 assert roots[1].find('.//s:g[@id="annotations"]',N) is None
 assert roots[0].find('.//s:image',N) is None
 assert len(roots[0].findall('.//s:text',N))==8
 assert b['width']==571 and b['height']==1157

def test_candidates():
 r=structured(B);assert r['auto_suggested'] and r['parts'];assert all(not p['reviewed'] and not p['label'] for p in r['parts'])

def test_invalid():
 p=dict(P[0],points=[[2,0],[0,0]])
 with pytest.raises(ValueError):structured(B,[p])
 with pytest.raises(ValueError):structured(B,[P[0],P[0]])

def test_api():
 c=TestClient(app);assert c.get('/structured').status_code==200
 r=c.post('/api/structured',files={'image':('pen.jpg',B,'image/jpeg')},data={'parts':json.dumps(P)});assert r.status_code==200;assert r.json()['paths']==11
 r=c.post('/api/structured',files={'image':('pen.jpg',B,'image/jpeg')},data={'parts':'[{}]'});assert r.status_code==400
