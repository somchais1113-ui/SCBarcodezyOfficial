"""REST adapter using the multipart fields from the supplied Vectorizer.AI SDK."""
import os, requests
from defusedxml import ElementTree as ET
from .engine import decode,hybrid_input
from io import BytesIO
from PIL import Image
URL='https://api.vectorizer.ai/api/v1/vectorize'

def configured(): return bool(os.getenv('VECTORIZER_API_ID') and os.getenv('VECTORIZER_API_SECRET'))

def vectorize(data,s,hybrid=False):
    if not configured(): raise ValueError('Set VECTORIZER_API_ID and VECTORIZER_API_SECRET on server first.')
    if hybrid: payload=hybrid_input(data,s)
    else:
        rgb,alpha=decode(data,s.max_side); import numpy as np
        b=BytesIO(); Image.fromarray(np.dstack([rgb,alpha])).save(b,format='PNG'); payload=b.getvalue()
    fields={'mode':'production','policy.retention_days':'0','output.file_format':'svg','output.draw_style':'stroke_edges','output.strokes.use_override_color':'true','output.strokes.override_color':'#000000','output.strokes.stroke_width':str(s.inner_width),'output.gap_filler.enabled':'false','output.svg.adobe_compatibility_mode':'true','processing.max_colors':'8' if hybrid else '0','processing.shapes.min_area_px':str(s.min_length)}
    try:
        r=requests.post(URL,auth=(os.environ['VECTORIZER_API_ID'],os.environ['VECTORIZER_API_SECRET']),files={'image':('input.png',payload,'image/png')},data=fields,timeout=(10,90),allow_redirects=False,stream=True)
        with r:
            if r.status_code!=200: raise ValueError(f'Vectorizer API HTTP {r.status_code}; check credentials, credits or request settings.')
            buf=bytearray()
            for chunk in r.iter_content(65536):
                buf.extend(chunk)
                if len(buf)>20*1024*1024: raise ValueError('Cloud SVG too large')
    except requests.RequestException as e: raise ValueError('Vectorizer connection failed or timed out.') from e
    try: root=ET.fromstring(bytes(buf))
    except Exception as e: raise ValueError('Cloud response is not a valid SVG') from e
    if root.tag.split('}')[-1]!='svg': raise ValueError('Cloud response is not SVG')
    # Reject active or external content; image preview uses an isolated image URL, never innerHTML.
    allowed={'svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','clipPath','use','title','desc','metadata'}
    for el in root.iter():
        if el.tag.split('}')[-1] not in allowed: raise ValueError('Unsupported cloud SVG element; refusing unsafe or unsupported document')
        for k,v in el.attrib.items():
            key=k.split('}')[-1].lower(); val=v.strip().lower()
            if key.startswith('on') or key=='style' or (key=='href' and not val.startswith('#')) or ('url(' in val and not val.startswith('url(#')): raise ValueError('Unsupported SVG attribute')
    return {'svg':bytes(buf).decode('utf-8'),'engine':'hybrid' if hybrid else 'cloud','paths':sum(e.tag.split('}')[-1]=='path' for e in root.iter()),'vertices':None,'warnings':['Cloud mode uses paid external API. Outline follows detected color regions, not engineering parts.','Hybrid uses grayscale foreground preprocessing; no semantic reflection removal.'] if hybrid else ['Cloud outline follows detected color regions, not engineering parts.']}
