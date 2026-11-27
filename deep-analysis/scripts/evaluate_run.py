"""Evaluate a completed V0.6 real-model run against approximate manual V0.4 reference hints."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import numpy as np
from PIL import Image
from sc_outline.deep import analyze
from sc_outline.recognition import reference_mask,to_source,score

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('image');p.add_argument('hints');p.add_argument('run');a=p.parse_args();d=Path(a.run)
    report=json.loads((d/'report.json').read_text());r,rgb,fg,c,aligned,am,M=analyze(Path(a.image).read_bytes())
    if report.get('provider')!='grounding_dino_sam2_hf' or report.get('source_sha256')!=r['source_sha256']:raise SystemExit('Expected matching live-model run, not preflight or test output.')
    ref=to_source(reference_mask(r,am,json.loads(Path(a.hints).read_text())),M,fg)
    pred=np.asarray(Image.open(d/'label_ids.png'))
    if pred.shape!=fg.shape or np.any(pred>7):raise SystemExit('Invalid label map')
    result=score(ref,pred);result['reference_note']='Approximate manual V0.4 hints, transformed to source coordinates. Not independent ground truth.'
    (d/'evaluation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
if __name__=='__main__':main()
