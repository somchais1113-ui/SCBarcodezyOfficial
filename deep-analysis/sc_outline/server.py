import json
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .engine import Settings,extract
from .structured import structured
from .cloud import configured,vectorize
from PIL import UnidentifiedImageError
app=FastAPI(title='SC Technical Outline',version='0.4.0')
ROOT=Path(__file__).resolve().parent.parent
@app.get('/')
def home(): return FileResponse(ROOT/'web/index.html')
@app.get('/api/status')
def status(): return {'version':'0.4.0','cloud_configured':configured()}
@app.post('/api/trace')
def trace(image:UploadFile=File(...),settings:str=Form('{}'),engine:str=Form('local'),consent:bool=Form(False)):
    try:
        data=image.file.read(15*1024*1024+1)
        if len(data)>15*1024*1024: raise ValueError('Image exceeds 15 MB')
        s=Settings(**json.loads(settings))
        if engine=='local': return extract(data,s)
        if engine not in ('cloud','hybrid'): raise ValueError('Unknown engine')
        if not consent: raise ValueError('Explicit cloud upload and billing consent required')
        return vectorize(data,s,engine=='hybrid')
    except (ValueError,TypeError,UnidentifiedImageError,OverflowError) as e: raise HTTPException(400,str(e)) from e
    finally: image.file.close()
@app.get('/structured')
def structured_home(): return FileResponse(ROOT/'web/structured.html')
@app.post('/api/structured')
def structured_trace(image:UploadFile=File(...), parts:str=Form('null'), settings:str=Form('{}')):
    try:
        data=image.file.read(15*1024*1024+1)
        return structured(data,json.loads(parts),**json.loads(settings))
    except (ValueError,TypeError,UnidentifiedImageError,OverflowError) as e: raise HTTPException(400,str(e)) from e
    finally: image.file.close()
from .deep import analyze, reconstruct
import base64
import cv2
@app.get('/deep')
def deep_home(): return FileResponse(ROOT/'web/deep.html')
@app.post('/api/deep/analyze')
def deep_analyze(image:UploadFile=File(...), ocr:bool=Form(False)):
    try:
        report,_,_,_,aligned,_,_=analyze(image.file.read(15*1024*1024+1),ocr=ocr)
        ok,raw=cv2.imencode('.png',cv2.cvtColor(aligned,cv2.COLOR_RGB2BGR))
        if not ok:raise ValueError('Preview encoding failed')
        return {**report,'axis_preview':'data:image/png;base64,'+base64.b64encode(raw).decode()}
    except (ValueError,TypeError,UnidentifiedImageError,OverflowError) as e:raise HTTPException(400,str(e)) from e
    finally:image.file.close()
@app.post('/api/deep/reconstruct')
def deep_reconstruct(image:UploadFile=File(...),hints:str=Form('null'),ocr:bool=Form(False),tolerance:float=Form(1.5)):
    try:
        parsed=json.loads(hints)
        if parsed is not None and not isinstance(parsed,dict):raise ValueError('Hints must be an object')
        out,_,colors,_=reconstruct(image.file.read(15*1024*1024+1),parsed,ocr=ocr,tolerance=tolerance)
        ok,raw=cv2.imencode('.png',cv2.cvtColor(colors,cv2.COLOR_RGB2BGR))
        if not ok:raise ValueError('Mask encoding failed')
        return {**out,'mask_preview':'data:image/png;base64,'+base64.b64encode(raw).decode()}
    except (ValueError,TypeError,KeyError,UnidentifiedImageError,OverflowError) as e:raise HTTPException(400,str(e)) from e
    finally:image.file.close()
app.mount('/static',StaticFiles(directory=ROOT/'web'),name='static')
app.mount('/examples',StaticFiles(directory=ROOT/'examples'),name='examples')
