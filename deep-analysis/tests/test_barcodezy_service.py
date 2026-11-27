"""API contract tests with explicitly labelled test doubles; no AI accuracy claims."""
import sys,time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from barcodezy_service import Jobs,create_app
from sc_outline.grounded import process
ROOT=Path(__file__).resolve().parents[1]
IMAGE=(ROOT/'examples/deep/gel_source.jpg').read_bytes()
class Empty:
    name='test_double_not_ai';ids=[]
    def detect(self,*args):return []
    def segment(self,*args):raise AssertionError('unexpected segmentation')

def wait(c,id,headers=None):
    for _ in range(150):
        j=c.get('/api/deep/jobs/'+id,headers=headers).json()
        if j['state'] in ('failed','completed'):return j
        time.sleep(.03)
    pytest.fail('job not completed')

def submit(c,data=IMAGE):return c.post('/api/deep/jobs',files={'file':('pen.jpg',data,'image/jpeg')},headers={'X-SC-Deep':'1'})

def test_health_and_static():
    with TestClient(create_app(Jobs(factory=Empty))) as c:
        assert c.get('/api/deep/health').json()['models_loaded'] is False
        assert 'V2.4.2' in c.get('/carton.html').text
        assert c.get('/deep-analysis/barcodezy_service.py').status_code==404

def test_invalid_and_cross_origin():
    with TestClient(create_app(Jobs(factory=Empty))) as c:
        assert submit(c,b'bad').status_code==400
        assert c.post('/api/deep/jobs',files={'file':('pen.jpg',IMAGE)}).status_code==403
        assert c.post('/api/deep/jobs',files={'file':('pen.jpg',IMAGE)},headers={'X-SC-Deep':'1','Origin':'https://evil.invalid'}).status_code==403
        assert c.get('/api/deep/health',headers={'Host':'evil.invalid'}).status_code==400

def test_real_pipeline_empty_backend_is_blocked():
    with TestClient(create_app(Jobs(factory=Empty))) as c:
        r=submit(c);assert r.status_code==202;id=r.json()['id'];j=wait(c,id)
        assert j['state']=='completed' and len(j['passes'])==8 and 'result' not in j
        q=c.get('/api/deep/jobs/'+id+'/result').json()
        assert q['report']['provider']=='test_double_not_ai' and q['report']['unknown_fraction']==1
        assert q['export_status']=='blocked_needs_review' and '<path' in q['svg'] and q['overlay'].startswith('data:image/png;')

def test_missing_model_no_fallback():
    def fail():raise RuntimeError('test: checkpoint missing')
    with TestClient(create_app(Jobs(factory=fail))) as c:
        id=submit(c).json()['id'];j=wait(c,id);assert j['state']=='failed' and 'checkpoint missing' in j['error'];assert c.get('/api/deep/jobs/'+id+'/result').status_code==409

def test_health_details_and_model_state():
    def fail():raise RuntimeError('test checkpoint absent')
    with TestClient(create_app(Jobs(factory=fail))) as c:
        h=c.get('/api/deep/health').json();assert h['api_version']=='2.4.2' and h['model_state']=='not_loaded';assert isinstance(h['missing_dependencies'],list) and isinstance(h['ocr_available'],bool)
        id=submit(c).json()['id'];wait(c,id);h=c.get('/api/deep/health').json();assert h['model_state']=='load_failed' and 'checkpoint absent' in h['model_error']

def test_remote_requires_explicit_configuration(monkeypatch):
    monkeypatch.setenv('SC_ALLOWED_ORIGINS','https://app.example.com')
    with pytest.raises(RuntimeError):create_app()

def test_remote_token_and_origin(monkeypatch):
    monkeypatch.setenv('SC_ALLOWED_ORIGINS','https://app.example.com');monkeypatch.setenv('SC_ALLOWED_HOSTS','ai.example.com');token='a'*40;monkeypatch.setenv('SC_API_TOKEN',token)
    with TestClient(create_app(Jobs(factory=Empty)),base_url='https://ai.example.com') as c:
        origin={'Origin':'https://app.example.com','Sec-Fetch-Site':'cross-site'}
        r=c.options('/api/deep/jobs',headers={**origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,x-sc-deep'});assert r.status_code==200 and r.headers['access-control-allow-origin']==origin['Origin']
        assert c.get('/api/deep/health',headers=origin).status_code==401
        auth={**origin,'Authorization':'Bearer '+token}
        r=c.get('/api/deep/health',headers=auth);assert r.status_code==200 and r.json()['remote_enabled'] and r.headers['access-control-allow-origin']==origin['Origin']
        assert c.get('/api/deep/health',headers={**auth,'Origin':'https://bad.example.com'}).status_code==403
        assert c.get('/api/deep/health',headers={**auth,'Host':'bad.example.com'}).status_code==400
        assert c.post('/api/deep/jobs',files={'file':('pen.jpg',IMAGE)},headers=auth).status_code==403
        r=c.post('/api/deep/jobs',files={'file':('pen.jpg',IMAGE)},headers={**auth,'X-SC-Deep':'1'});assert r.status_code==202;assert wait(c,r.json()['id'],auth)['state']=='completed'
        assert c.get('/api/deep/jobs/'+r.json()['id']+'/result',headers=origin).status_code==401
