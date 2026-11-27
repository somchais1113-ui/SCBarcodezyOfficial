import argparse,json
from pathlib import Path
from PIL import Image
from .recognition import train_local,run_local,COLORS,NAMES

def main():
    p=argparse.ArgumentParser();p.add_argument('image');p.add_argument('out');p.add_argument('--backend',choices=['local','foundation'],required=True);p.add_argument('--training',nargs=2,action='append',metavar=('IMAGE','HINTS'));p.add_argument('--threshold',type=float,default=.65);p.add_argument('--dino',default='IDEA-Research/grounding-dino-tiny');p.add_argument('--sam',default='facebook/sam2.1-hiera-tiny');p.add_argument('--device',default='cpu');p.add_argument('--allow-download',action='store_true');a=p.parse_args(); data=Path(a.image).read_bytes()
    if a.backend=='local':
        if not a.training:p.error('Local backend requires labeled training images')
        model,hashes=train_local([(Path(x).read_bytes(),json.loads(Path(y).read_text())) for x,y in a.training]);out,_,_,labels,*_=run_local(data,model,hashes,a.threshold)
    else:
        from .foundation import FoundationProvider,run_foundation
        out,labels,_=run_foundation(data,FoundationProvider(a.dino,a.sam,a.device,a.allow_download))
    dst=Path(a.out);dst.mkdir(parents=True,exist_ok=True)
    for k in ('svg','parts_svg'):(dst/(k+'.svg')).write_text(out[k])
    (dst/'report.json').write_text(json.dumps(out['report'],indent=2)); Image.fromarray(labels).save(dst/'label_ids.png');Image.fromarray(COLORS[labels]).save(dst/'parts_preview.png');(dst/'labels.json').write_text(json.dumps(dict(enumerate(NAMES)),indent=2))
if __name__=='__main__':main()
