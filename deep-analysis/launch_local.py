"""Interactive local launcher; installs dependencies into an isolated venv, never system Python."""
import hashlib, json, os, subprocess, sys, time, urllib.request, venv, webbrowser
from pathlib import Path

HERE=Path(__file__).resolve().parent
URL='http://127.0.0.1:8766'

def health():
    try:
        with urllib.request.urlopen(URL+'/api/deep/health',timeout=1) as r:
            data=json.load(r)
        return data if data.get('service')=='sc-barcodezy-grounded-v06' else None
    except Exception:return None

def main():
    if sys.version_info[:2] not in ((3,11),(3,12)):
        raise RuntimeError('Use Python 3.11 or 3.12 (64-bit), from python.org. Older/newer builds may not support the AI dependencies.')
    active=health()
    if active:
        if active.get('api_version')!='2.4.2':raise RuntimeError('An older Barcodezy service is running on port 8766. Stop it first (Ctrl+C).')
        if not active.get('dependencies_present'):raise RuntimeError('The running service is missing AI dependencies. Stop it first (Ctrl+C), then run this launcher again.')
        print('Existing V2.4.2 service found. Opening browser.');webbrowser.open(URL+'/carton.html');return
    if sys.maxsize<2**32:raise RuntimeError('64-bit Python required.')
    envdir=HERE/'.venv'; python=envdir/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    if not python.exists():
        print('Creating local Python environment…',flush=True);venv.EnvBuilder(with_pip=True).create(envdir)
    version=subprocess.check_output([str(python),'-c','import sys;print(f"{sys.version_info.major}.{sys.version_info.minor}")'],text=True).strip()
    if version not in ('3.11','3.12'):raise RuntimeError('Existing .venv uses an unsupported Python version; rename .venv and reopen launcher.')
    files=[HERE/'requirements-grounded.txt',HERE/'requirements.txt']
    fingerprint=hashlib.sha256(b'\n'.join(p.read_bytes() for p in files)).hexdigest()
    stamp=envdir/'.sc-grounded-installed'
    if not stamp.exists() or stamp.read_text()!=fingerprint:
        print('First setup / dependency update: packages require internet and several GB of free disk space. This can take a while.',flush=True)
        subprocess.check_call([str(python),'-m','pip','install','-r',str(files[0])],cwd=HERE)
        stamp.write_text(fingerprint)
    print('Checking AI imports…',flush=True)
    try:subprocess.check_call([str(python),'-c','import torch, torchvision; from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection, Sam2Model, Sam2Processor; print("AI imports OK", torch.__version__)'],cwd=HERE)
    except subprocess.CalledProcessError:
        stamp.unlink(missing_ok=True);raise RuntimeError('AI import failed. See error above. Reopen launcher to retry dependency installation; use a compatible PyTorch build.')
    allow=input('Allow model downloads from Hugging Face when needed? [y/N]: ').strip().lower() in ('y','yes')
    env=os.environ.copy();env['SC_ALLOW_DOWNLOAD']='1' if allow else '0';env.setdefault('SC_DEVICE','cpu')
    for name in ('SC_ALLOWED_ORIGINS','SC_ALLOWED_HOSTS','SC_API_TOKEN'):env.pop(name,None)
    print('Starting local service. Keep this window open; Ctrl+C stops it.',flush=True)
    p=subprocess.Popen([str(python),'barcodezy_service.py'],cwd=HERE,env=env)
    try:
        deadline=time.monotonic()+45
        while time.monotonic()<deadline:
            if p.poll() is not None:raise RuntimeError('Service stopped during startup. See output above (port 8766 may be in use).')
            h=health()
            if h and h.get('api_version')=='2.4.2':
                print('Service connected: '+URL+'/carton.html',flush=True);webbrowser.open(URL+'/carton.html');break
            time.sleep(.5)
        else:raise RuntimeError('Service health check timed out. See terminal output.')
        p.wait()
    except KeyboardInterrupt:print('\nStopping service…')
    finally:
        if p.poll() is None:
            p.terminate()
            try:p.wait(timeout=10)
            except subprocess.TimeoutExpired:p.kill();p.wait()

if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'\nSETUP ERROR: {exc}',file=sys.stderr);sys.exit(1)
