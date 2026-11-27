"""Command line integration: python -m sc_outline.deep_cli image.jpg output-dir [--hints hints.json]."""
import argparse,json
from pathlib import Path
from PIL import Image
from .deep import reconstruct

def main():
    p=argparse.ArgumentParser();p.add_argument('image');p.add_argument('out');p.add_argument('--hints');p.add_argument('--ocr',action='store_true');p.add_argument('--sam-checkpoint');p.add_argument('--sam-type',default='vit_b');p.add_argument('--device',default='cpu');a=p.parse_args()
    provider=None
    if a.sam_checkpoint:
        if not a.hints:p.error('SAM requires explicit part hints')
        from .semantic import SAMProvider
        provider=SAMProvider(a.sam_checkpoint,a.sam_type,a.device)
    hints=json.loads(Path(a.hints).read_text()) if a.hints else None
    result,axis,mask,_=reconstruct(Path(a.image).read_bytes(),hints,ocr=a.ocr,provider=provider);out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    for k in ('svg','parts_svg','annotated_svg'):(out/(k+'.svg')).write_text(result[k])
    (out/'report.json').write_text(json.dumps(result['report'],indent=2));Image.fromarray(axis).save(out/'axis.png');Image.fromarray(mask).save(out/'masks.png')
if __name__=='__main__':main()
