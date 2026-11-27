"""Train on only one photo and evaluate the other. No target labels in model fitting."""
import json,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
import cairosvg
root=Path(__file__).resolve().parents[2];sys.path.insert(0,str(root))
from sc_outline.recognition import *
from sc_outline.deep import analyze
out=Path(__file__).parent; deep=root/'examples/deep'; results={}; tiles=[]
for test,train in [('fountain','gel'),('gel','fountain')]:
    td=(deep/f'{train}_source.jpg').read_bytes(); th=json.loads((deep/f'{train}_hints.json').read_text()); model,hashes=train_local([(td,th)])
    data=(deep/f'{test}_source.jpg').read_bytes(); result,labels,raw,source,aligned,am,rgb=run_local(data,model,hashes)
    r,_,mask,_,_,_,M=analyze(data);ref=reference_mask(r,am,json.loads((deep/f'{test}_hints.json').read_text())); reference=to_source(ref,M,mask)
    report=result['report']; report['held_out']=True;report['trained_on']=train;report['tested_on']=test;report['raw_metrics']=score(ref,raw);report['gated_metrics']=score(ref,labels);results[test]=report
    for k in ('svg','parts_svg'):(out/f'{test}_{k}.svg').write_text(result[k]);
    (out/f'{test}_report.json').write_text(json.dumps(report,indent=2));Image.fromarray(source).save(out/f'{test}_label_ids.png');Image.fromarray(COLORS[source]).save(out/f'{test}_predicted.png');Image.fromarray(COLORS[reference]).save(out/f'{test}_reference.png');cairosvg.svg2png(bytestring=result['svg'].encode(),write_to=str(out/f'{test}_outline.png'),background_color='white')
    tiles.append((test,Image.fromarray(rgb),Image.fromarray(COLORS[reference]),Image.fromarray(COLORS[source]),Image.open(out/f'{test}_outline.png').convert('RGB'),report))
(out/'benchmark_report.json').write_text(json.dumps(results,indent=2))
W,H=1320,1050; canvas=Image.new('RGB',(W,H),'white');d=ImageDraw.Draw(canvas);font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'; f=lambda s:ImageFont.truetype(font,s); b=lambda s:ImageFont.truetype(bold,s)
d.text((32,20),'SCWork / V0.5  •  Semantic recognition experiment',font=b(29),fill='#192b3b');d.text((32,62),'Held-out photo: train on the other pen only. Gray = unknown. Draft output is NOT approved.',font=f(17),fill='#475569')
for i,h in enumerate(['Original photo','Approx. reference (manual)','Model prediction (held-out)','Draft vector output']):d.text((32+i*320,100),h,font=b(17),fill='#192b3b')
for j,(name,*rest) in enumerate(tiles):
    *imgs,rep=rest; y=135+j*405;d.text((32,y),f'{name.upper()}   |   part mIoU {rep["gated_metrics"]["macro_part_iou"]:.1%}   |   unknown {rep["gated_metrics"]["unknown_fraction"]:.1%}',font=b(18),fill='#192b3b');
    for i,im in enumerate(imgs):
        im=im.copy();im.thumbnail((302,353),Image.Resampling.LANCZOS);x=32+i*320+(302-im.width)//2;canvas.paste(im,(x,y+30+(353-im.height)//2));
    d.line((32,y+390,1288,y+390),fill='#dce2e9',width=1)
for i,n in enumerate(NAMES[1:]):
    x=32+(i%4)*320;y=965+(i//4)*30;d.rectangle((x,y,x+18,y+18),fill=tuple(COLORS[i+1]));d.text((x+25,y),n,font=f(15),fill='#192b3b')
canvas.save(out/'benchmark.png')
for name,r in results.items():print(name,r['raw_metrics']['macro_part_iou'],r['gated_metrics']['macro_part_iou'],r['gated_metrics']['unknown_fraction'],r['gated_metrics']['pixel_accuracy'])
