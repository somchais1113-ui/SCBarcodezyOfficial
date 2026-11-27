"""Loopback-only integration server. Serves Barcodezy and V0.6 jobs on one origin."""
import base64, io, os, threading, uuid, time, logging, hmac, shutil
from urllib.parse import urlsplit
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse
from PIL import Image
import numpy as np
from sc_outline.grounded import HFBackend, Settings, process
from sc_outline.recognition import COLORS

ROOT=Path(__file__).resolve().parent.parent
MAX_BYTES=15*1024*1024
class Jobs:
    def __init__(self, factory=None, runner=process):
        self.factory=factory or self.make_backend; self.runner=runner; self.backend=None; self.model_state="not_loaded"; self.model_error=None
        self.pool=ThreadPoolExecutor(max_workers=1); self.lock=threading.Lock(); self.jobs={}
    @staticmethod
    def make_backend():
        return HFBackend(os.getenv('SC_DINO','IDEA-Research/grounding-dino-tiny'),os.getenv('SC_SAM','facebook/sam2.1-hiera-tiny'),os.getenv('SC_DEVICE','cpu'),os.getenv('SC_ALLOW_DOWNLOAD')=='1')
    def start(self,data,ocr):
        with self.lock:
            if any(j['state'] in ('queued','running') for j in self.jobs.values()):raise HTTPException(409,'Another analysis is running. Check the current job first.')
            while len(self.jobs)>=3:del self.jobs[next(iter(self.jobs))]
            id=uuid.uuid4().hex;self.jobs[id]={'id':id,'state':'queued','stage':'queued','passes':[],'result':None}
        self.pool.submit(self.run,id,data,ocr);return id
    def update(self,id,**fields):
        with self.lock:self.jobs[id].update(fields)
    def run(self,id,data,ocr):
        try:
            self.update(id,state='running',stage='loading_models')
            if self.backend is None:
                self.model_state='loading'; self.model_error=None
                try:self.backend=self.factory()
                except Exception as e:
                    self.model_state='load_failed'; self.model_error=f'{type(e).__name__}: {str(e)[:350]}'
                    raise
                self.model_state='loaded' 
            self.update(id,stage='analyzing')
            def progress(event):
                with self.lock:self.jobs[id]['passes'].append(dict(event))
            out,labels,rgb=self.runner(data,self.backend,Settings(ocr=ocr),progress=progress)
            overlay=rgb.copy();valid=labels>0;overlay[valid]=(.55*rgb[valid]+.45*COLORS[labels[valid]]).astype(np.uint8)
            def png(a):
                f=io.BytesIO();Image.fromarray(a).save(f,format='PNG');return 'data:image/png;base64,'+base64.b64encode(f.getvalue()).decode('ascii')
            result={'svg':out['svg'],'parts_svg':out['parts_svg'],'report':out['report'],'export_status':out['export_status'],'source':png(rgb),'overlay':png(overlay),'mask':png(COLORS[labels])}
            self.model_state='inference_completed'; self.model_error=None
            self.update(id,state='completed',stage='review',result=result)
        except Exception as e:
            if self.backend is not None:self.model_state='inference_failed'; self.model_error=f'{type(e).__name__}: {str(e)[:350]}'
            logging.exception('Deep analysis failed');self.update(id,state='failed',stage='failed',error=f'{type(e).__name__}: {str(e)[:500]}')
    def get(self,id,include=False):
        with self.lock:
            if id not in self.jobs:raise HTTPException(404,'Job not found or expired')
            j=self.jobs[id];return {k:(list(v) if k=='passes' else v) for k,v in j.items() if include or k!='result'}

def remote_config():
    # Explicit opt-in only; exact HTTPS origins and hosts, no wildcard.
    origins=[x.strip() for x in os.getenv('SC_ALLOWED_ORIGINS','').split(',') if x.strip()]
    hosts=[x.strip() for x in os.getenv('SC_ALLOWED_HOSTS','').split(',') if x.strip()]
    token=os.getenv('SC_API_TOKEN','')
    if origins or hosts or token:
        if not origins or not hosts or len(token)<32:raise RuntimeError('Remote access requires SC_ALLOWED_ORIGINS, SC_ALLOWED_HOSTS and SC_API_TOKEN (32+ characters)')
        for x in origins:
            u=urlsplit(x)
            if u.scheme!='https' or not u.hostname or u.path or u.query or u.fragment or u.username or u.password or '*' in x:raise RuntimeError('Use exact HTTPS origins without trailing slash')
        if any('*' in x or '/' in x or '://' in x for x in hosts):raise RuntimeError('Use exact hostnames')
    return origins,hosts,token

def dependency_status():
    import importlib.util
    names=('torch','transformers','torchvision','huggingface_hub')
    return [m for m in names if importlib.util.find_spec(m) is None]

def create_app(jobs=None):
    jobs=jobs or Jobs();app=FastAPI(title='SC Barcodezy Deep Analysis V0.6',docs_url=None,redoc_url=None,openapi_url=None)
    origins,hosts,token=remote_config()
    app.add_middleware(TrustedHostMiddleware,allowed_hosts=['127.0.0.1','localhost','[::1]','testserver']+hosts)
    # Same origin only. Prevent drive-by requests to loopback; no CORS is enabled.
    @app.middleware('http')
    async def guard(request:Request,call_next):
        from starlette.responses import JSONResponse
        if request.url.path.startswith('/api/deep/'):
            origin=request.headers.get('origin');expected=f'{request.url.scheme}://{request.headers.get("host", "")}'
            if (origin and origin!=expected and origin not in origins) or (request.headers.get('sec-fetch-site')=='cross-site' and origin not in origins):return JSONResponse({'detail':'Cross-origin request denied'},status_code=403)
            if token and not hmac.compare_digest(request.headers.get('authorization','').encode(),('Bearer '+token).encode()):return JSONResponse({'detail':'API token required or invalid'},status_code=401)
            if request.method=='POST' and request.headers.get('x-sc-deep')!='1':return JSONResponse({'detail':'Missing client header'},status_code=403)
            try:
                if int(request.headers.get('content-length','0'))>MAX_BYTES+65536:return JSONResponse({'detail':'Image exceeds 15 MB'},status_code=413)
            except ValueError:return JSONResponse({'detail':'Invalid content length'},status_code=400)
        response=await call_next(request)
        if request.url.path.startswith('/api/deep/'):response.headers['Cache-Control']='no-store'
        return response
    if origins:app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=['GET','POST'],allow_headers=['Authorization','X-SC-Deep','Content-Type'],allow_credentials=False)
    @app.get('/api/deep/health')
    def health():
        missing=dependency_status()
        return {'service':'sc-barcodezy-grounded-v06','api_version':'2.4.2','dependencies_present':not missing,'missing_dependencies':missing,'models_loaded':jobs.backend is not None,'model_state':jobs.model_state,'model_error':jobs.model_error,'allow_download':os.getenv('SC_ALLOW_DOWNLOAD')=='1','device':os.getenv('SC_DEVICE','cpu'),'ocr_available':bool(shutil.which('tesseract')),'remote_enabled':bool(token),'warning':'Dependency presence is not import compatibility. Model readiness is verified only by actual inference.'}
    @app.post('/api/deep/jobs',status_code=202)
    async def submit(file:UploadFile=File(...),ocr:bool=Form(False)):
        data=await file.read(MAX_BYTES+1);await file.close()
        if len(data)>MAX_BYTES:raise HTTPException(413,'Image exceeds 15 MB')
        try:
            with Image.open(io.BytesIO(data)) as im:
                if im.format not in ('JPEG','PNG','WEBP') or im.width*im.height>24_000_000 or min(im.size)<8:raise ValueError('Invalid image format or dimensions')
                im.verify()
        except Exception:raise HTTPException(400,'Use valid JPEG, PNG or WebP, 8 px minimum, max 24 MP')
        return {'id':jobs.start(data,ocr)}
    @app.get('/api/deep/jobs/{id}')
    def status(id:str):return jobs.get(id)
    @app.get('/api/deep/jobs/{id}/result')
    def result(id:str):
        j=jobs.get(id,True)
        if j['state']!='completed':raise HTTPException(409,'No completed result')
        return j['result']
    @app.get('/')
    def index():return FileResponse(ROOT/'index.html')
    @app.get('/{page}.html')
    def page(page:str):
        if page not in ('index','carton','barcode','studio','sticker'):raise HTTPException(404)
        return FileResponse(ROOT/(page+'.html'))
    app.mount('/assets',StaticFiles(directory=ROOT/'assets'),name='assets')
    app.mount('/examples',StaticFiles(directory=ROOT/'examples'),name='examples')
    return app
app=create_app()
if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=8766)
