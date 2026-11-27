"""Fetch exact reviewed demo blob plus clone upstream repositories on an internet-connected machine.
Nothing is executed or installed by this script. Repositories are optional reference material.
"""
import argparse, hashlib, json, subprocess, urllib.request
from pathlib import Path
REPOS={'Grounded-SAM-2':'https://github.com/IDEA-Research/Grounded-SAM-2.git','GroundingDINO':'https://github.com/IDEA-Research/GroundingDINO.git','sam2':'https://github.com/facebookresearch/sam2.git'}
DEMO='https://raw.githubusercontent.com/IDEA-Research/Grounded-SAM-2/main/grounded_sam2_hf_model_demo.py'
SHA='0acde45f3cbbc8b08f5d3e908dac59c0bf471b25'
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--dest',default='upstream');p.add_argument('--clone',action='store_true');p.add_argument('--accept-updated-demo',action='store_true');a=p.parse_args();d=Path(a.dest);d.mkdir(parents=True,exist_ok=True)
    with urllib.request.urlopen(DEMO,timeout=60) as r:data=r.read()
    sha=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    if sha!=SHA and not a.accept_updated_demo:raise SystemExit(f'Demo changed: {sha}; reviewed {SHA}. Inspect before opting in.')
    (d/'grounded_sam2_hf_model_demo.py').write_bytes(data)
    with urllib.request.urlopen('https://raw.githubusercontent.com/IDEA-Research/Grounded-SAM-2/main/LICENSE',timeout=60) as r:(d/'Grounded-SAM-2-LICENSE').write_bytes(r.read())
    manifest={'demo_blob_sha':sha,'reviewed_blob_sha':SHA,'repositories':{}}
    if a.clone:
        for name,url in REPOS.items():
            target=d/name
            if target.exists():raise SystemExit(f'Already exists: {target}')
            subprocess.run(['git','clone','--depth','1',url,str(target)],check=True)
            manifest['repositories'][name]={'url':url,'commit':subprocess.check_output(['git','-C',str(target),'rev-parse','HEAD'],text=True).strip()}
    (d/'manifest.json').write_text(json.dumps(manifest,indent=2))
if __name__=='__main__':main()
