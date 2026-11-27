from io import BytesIO
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image,ImageDraw
import pytest
from sc_outline.engine import extract,Settings
from sc_outline.cloud import vectorize
from fastapi.testclient import TestClient
from sc_outline.server import app

def sample():
    im=Image.new('RGB',(400,240),'white'); d=ImageDraw.Draw(im);d.rounded_rectangle((35,70,365,170),radius=25,fill='#717171');d.rectangle((200,72,207,168),fill='black'); b=BytesIO();im.save(b,'PNG');return b.getvalue()

def test_outer():
    r=extract(sample(),Settings(mode='outer'));assert r['paths']==1;assert '<image' not in r['svg'];assert ET.fromstring(r['svg']).tag.endswith('svg')
def test_internal():
    r=extract(sample());assert r['paths']>1;assert 'internal-detail' in r['svg']
def test_sample():
    r=extract(Path('examples/pen.jpg').read_bytes());assert r['paths']>1

def test_invalid():
    with pytest.raises(ValueError):Settings(sensitivity=101)

def test_api():
    c=TestClient(app);assert c.get('/').status_code==200;assert c.get('/api/status').status_code==200
    r=c.post('/api/trace',files={'image':('test.png',sample(),'image/png')},data={'engine':'local'});assert r.status_code==200;assert r.json()['paths']>1
    r=c.post('/api/trace',files={'image':('test.png',sample(),'image/png')},data={'engine':'cloud'});assert r.status_code==400

def test_cloud_credentials(monkeypatch):
    monkeypatch.delenv('VECTORIZER_API_ID',raising=False);monkeypatch.delenv('VECTORIZER_API_SECRET',raising=False)
    with pytest.raises(ValueError,match='VECTORIZER'):vectorize(sample(),Settings())

def test_cloud_mock(monkeypatch):
    monkeypatch.setenv('VECTORIZER_API_ID','fake');monkeypatch.setenv('VECTORIZER_API_SECRET','fake')
    class Response:
        status_code=200
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def iter_content(self,*args):yield b'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L1 1"/></svg>'
    def post(url,**kw):
        assert kw['data']['output.draw_style']=='stroke_edges';assert kw['data']['policy.retention_days']=='0';assert kw['auth']==('fake','fake');return Response()
    monkeypatch.setattr('sc_outline.cloud.requests.post',post)
    assert vectorize(sample(),Settings())['paths']==1
    assert vectorize(sample(),Settings(),True)['engine']=='hybrid'
