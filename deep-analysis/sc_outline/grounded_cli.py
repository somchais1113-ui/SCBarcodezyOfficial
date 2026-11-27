"""Run live V0.6 or geometry-only preflight. No fake AI results."""
import argparse,json,sys
from pathlib import Path
from PIL import Image
import numpy as np
from .grounded import HFBackend,Settings,process,views
from .deep import analyze
from .recognition import COLORS

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('image');p.add_argument('out');p.add_argument('--preflight',action='store_true');p.add_argument('--device',default='cpu');p.add_argument('--dino',default='IDEA-Research/grounding-dino-tiny');p.add_argument('--sam',default='facebook/sam2.1-hiera-tiny');p.add_argument('--allow-download',action='store_true');p.add_argument('--ocr',action='store_true');p.add_argument('--no-retry',action='store_true');p.add_argument('--det',type=float,default=.30);p.add_argument('--sam-score',type=float,default=.70);p.add_argument('--consensus',type=float,default=.45);a=p.parse_args()
    data=Path(a.image).read_bytes();dst=Path(a.out)
    if dst.exists() and any(dst.iterdir()):p.error('Output directory must be empty; use a new path for each run.')
    dst.mkdir(parents=True,exist_ok=True)
    if a.preflight:
        report,rgb,fg,c,aligned,am,M=analyze(data,ocr=a.ocr);vv=list(views(rgb,fg,aligned,am,M));report.update({'provider':'none','status':'preflight_only_no_model_inference','views':[{'name':v.name,'shape':list(v.mask.shape),'to_source':v.to_source.tolist()} for v in vv]})
        for v in vv:Image.fromarray(v.rgb).save(dst/(v.name+'.png'))
        (dst/'report.json').write_text(json.dumps(report,indent=2));return
    try:
        backend=HFBackend(a.dino,a.sam,a.device,a.allow_download)
        out,labels,rgb=process(data,backend,Settings(det=a.det,sam=a.sam_score,consensus=a.consensus,retry=not a.no_retry,ocr=a.ocr),progress=lambda x:print(json.dumps(x),flush=True))
    except Exception as e:
        (dst/'failure.json').write_text(json.dumps({'status':'inference_failed','error':str(e),'type':type(e).__name__},indent=2));print(f'Inference failed: {e}',file=sys.stderr);raise SystemExit(2)
    for k in ('svg','parts_svg'):(dst/('draft_'+k+'.svg')).write_text(out[k])
    Image.fromarray(labels).save(dst/'label_ids.png');Image.fromarray(COLORS[labels]).save(dst/'parts_preview.png')
    overlay=rgb.copy();valid=labels>0;overlay[valid]=(.55*rgb[valid]+.45*COLORS[labels[valid]]).astype(np.uint8);Image.fromarray(overlay).save(dst/'source_overlay.png')
    (dst/'report.json').write_text(json.dumps(out['report'],indent=2));print(out['export_status'])
if __name__=='__main__':main()
