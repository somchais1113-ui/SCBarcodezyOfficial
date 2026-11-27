from pathlib import Path
import json, sys
import numpy as np, cv2
from PIL import Image,ImageDraw
import cairosvg
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from sc_outline.deep import analyze,reconstruct
root=Path(__file__).parent
specs={
'fountain':{'cuts':[37,225,250,466,524,550,568,584], 'names':['Cap top','Cap body','Center ring','Barrel','Grip upper','Grip step','Grip lower','Nib collar','Nib'], 'overlays':[{'name':'Pocket clip','polygon':[[22,19],[30,20],[35,23],[219,23],[219,41],[35,43],[28,40],[22,44]],'details':[[[55,27],[161,28],[161,33],[55,33]],[[180,28],[216,25],[216,39],[180,34]]]}]},
'gel':{'cuts':[28,157,334,469,514], 'names':['Push button','Upper housing','Transparent barrel','Rubber grip','Nose cone','Writing tip'], 'overlays':[{'name':'Pocket clip','polygon':[[24,13],[29,16],[39,25],[57,33],[87,35],[145,35],[181,38],[201,41],[204,45],[203,51],[193,52],[174,52],[141,54],[102,57],[68,55],[47,50],[32,42],[25,34]]}]}}
for name,spec in specs.items():
    src=root/f'{name}_source.jpg'; data=src.read_bytes(); r,*_=analyze(data);spec['source_sha256']=r['source_sha256'];(root/f'{name}_hints.json').write_text(json.dumps(spec,indent=2))
    for mode,hints in [('auto',None),('guided',spec)]:
        out,aligned,colors,am=reconstruct(data,hints,ocr=True)
        for k in ('svg','parts_svg','annotated_svg'):
            p=root/f'{name}_{mode}_{k}.svg';p.write_text(out[k]);cairosvg.svg2png(bytestring=out[k].encode(),write_to=str(p.with_suffix('.png')),background_color='white')
        (root/f'{name}_{mode}_report.json').write_text(json.dumps(out['report'],indent=2));Image.fromarray(colors).save(root/f'{name}_{mode}_mask.png')
        im=Image.open(root/f'{name}_{mode}_svg.png').convert('RGB'); orig=Image.open(src).convert('RGB'); overlay=Image.blend(orig,im,.48);overlay.save(root/f'{name}_{mode}_overlay.png')
        print(name,mode,out['report']['outer_geometry']['mask_iou'],out['report']['partition_coverage'],len(out['report']['parts']),out['report']['ocr'])
# board showing original, automated, guided, source overlay with identical fit for each row
W,H=1600,1200; board=Image.new('RGB',(W,H),'#f4f6f8');d=ImageDraw.Draw(board)
from PIL import ImageFont
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
f=ImageFont.truetype(font,19);b=ImageFont.truetype(bold,26);title=ImageFont.truetype(bold,36)
d.text((35,23),'SCWork / Deep Analysis Engine V0.4',font=title,fill='#152435');d.text((35,71),'Real-photo benchmark  |  Guided polygons are human-authored, not AI predictions',font=f,fill='#526174')
for i,lab in enumerate(['01  SOURCE','02  AUTO CANDIDATES','03  GUIDED PARTS','04  SOURCE OVERLAY']):d.text((35+i*390,116),lab,font=b,fill='#152435')
for j,name in enumerate(specs):
    for i,file in enumerate([f'{name}_source.jpg',f'{name}_auto_svg.png',f'{name}_guided_svg.png',f'{name}_guided_overlay.png']):
        x=30+i*390;y=160+j*505;d.rounded_rectangle((x,y,x+370,y+450),radius=10,fill='white');im=Image.open(root/file).convert('RGB');im.thumbnail((355,425));board.paste(im,(x+(370-im.width)//2,y+(450-im.height)//2))
    d.text((35,614+j*505),('Fountain pen / metallic surface' if j==0 else 'Gel pen / transparent barrel'),font=f,fill='#526174')
board.save(root/'benchmark.png')
