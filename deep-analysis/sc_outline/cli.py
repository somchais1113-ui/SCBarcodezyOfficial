"""Local CLI. Example: python -m sc_outline.cli input.jpg -o result.svg"""
import argparse
from pathlib import Path
from .engine import extract,Settings

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input',type=Path);p.add_argument('-o','--output',type=Path,required=True);p.add_argument('--mode',choices=['outer','technical','detail'],default='technical');p.add_argument('--sensitivity',type=int,default=45);p.add_argument('--min-length',type=int,default=16);p.add_argument('--simplify',type=float,default=1);p.add_argument('--outer-width',type=float,default=2);p.add_argument('--inner-width',type=float,default=1);p.add_argument('--background-tolerance',type=int,default=24);p.add_argument('--width-mm',type=float,help='Explicit output page width; not inferred product dimensions');p.add_argument('--dpi',type=int,default=300,help='PNG rendering DPI if width-mm specified');a=p.parse_args()
    r=extract(a.input.read_bytes(),Settings(mode=a.mode,sensitivity=a.sensitivity,min_length=a.min_length,simplify=a.simplify,outer_width=a.outer_width,inner_width=a.inner_width,background_tolerance=a.background_tolerance)); svg=r['svg']; suffix=a.output.suffix.lower()
    if a.width_mm is not None:
        if not 0<a.width_mm<=1000 or not 36<=a.dpi<=1200: p.error('Invalid width or DPI')
        import xml.etree.ElementTree as ET
        ET.register_namespace('','http://www.w3.org/2000/svg'); root=ET.fromstring(svg);root.set('width',f'{a.width_mm}mm');root.set('height',f'{a.width_mm*r["height"]/r["width"]}mm');svg=ET.tostring(root,encoding='unicode')
    if suffix=='.svg':a.output.write_text(svg,encoding='utf-8')
    elif suffix in ('.png','.pdf'):
        try:import cairosvg
        except ImportError:p.error('Install optional CairoSVG: pip install -r requirements-export.txt')
        kw={'bytestring':svg.encode(),'write_to':str(a.output)}
        if suffix=='.png' and a.width_mm is not None:
            width=round(a.width_mm/25.4*a.dpi);height=round(width*r['height']/r['width'])
            if width*height>40_000_000:p.error('PNG exceeds 40 megapixels')
            kw.update(output_width=width,output_height=height)
        (cairosvg.svg2png if suffix=='.png' else cairosvg.svg2pdf)(**kw)
    else:p.error('Output must be .svg, .png or .pdf')
    print(f'{r["paths"]} paths; {r["vertices"]} vertices. Saved {a.output}')
if __name__=='__main__':main()
