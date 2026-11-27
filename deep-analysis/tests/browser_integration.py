"""Manual Chromium integration test; fixture responses are NOT AI inference.
Run from deep-analysis: python tests/browser_integration.py (requires playwright, Chromium).
"""
import os, subprocess,sys,time,json,base64,io
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sc_outline.deep import analyze
from sc_outline.recognition import vectorize_labels,COLORS
ROOT=Path(__file__).resolve().parents[1]

def png(a):
    f=io.BytesIO();Image.fromarray(a).save(f,format='PNG');return 'data:image/png;base64,'+base64.b64encode(f.getvalue()).decode()

def fixture(blocked):
    # Controlled mask partition for UI/production transport tests only.
    data=(ROOT/'examples/deep/gel_source.jpg').read_bytes();r,rgb,fg,c,*_=analyze(data)
    y,x=np.indices(fg.shape);labels=np.where(fg>0,np.where(x<130,5,np.where(x<255,4,2)),0).astype(np.uint8)
    if blocked:labels=np.where(fg>0,1,0).astype(np.uint8)
    out=vectorize_labels(labels,fg,c);status='blocked_needs_review' if blocked else 'draft_needs_review'
    return {'svg':out['svg'],'parts_svg':out['parts_svg'],'report':{'provider':'TEST_FIXTURE_NOT_AI','unknown_fraction':1. if blocked else 0.,'parts':out['parts'],'block_reasons':['excess_unknown_area'] if blocked else []},'export_status':status,'source':png(rgb),'overlay':png(COLORS[labels])}

def main():
    proc=subprocess.Popen([sys.executable,'barcodezy_service.py'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox']);page=browser.new_page(accept_downloads=True,viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(7000);print('Browser launched',flush=True)
            import re
            html=(ROOT.parent/'carton.html').read_text(); scripts=re.findall(r'<script[^>]*src="([^"]+)"[^>]*></script>',html)
            html=re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>','',html);html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',html)
            page.set_content(html)
            for script in scripts:page.add_script_tag(content=(ROOT.parent/script.split('?')[0]).read_text())
            page.evaluate("""() => {const original=window.fetch;window.fetch=(url,options)=>String(url).startsWith('/api/deep/')?Promise.resolve(new Response(JSON.stringify({service:'sc-barcodezy-grounded-v06',dependencies_present:false,models_loaded:false,device:'cpu'}),{status:200})):original(url,options);}""")
            print('Page loaded by direct script injection (navigation blocked)')
            page.locator('#openTrace').click();page.locator('#structureSampleChoice').select_option('gel');page.locator('#structureSample').click();page.wait_for_function("document.querySelector('#traceResult svg path')!==null");assert page.locator('#traceResult svg path').count()>0
            print('PASS legacy Guided tracing')
            page.locator('#deepOpen').click();page.wait_for_function("!document.querySelector('#deepHealth').textContent.includes('ตรวจสอบบริการ')");print('Missing-dependencies UI fixture:',page.locator('#deepHealth').inner_text())
            page.evaluate("""([blocked,passed])=>{const original=window.fetch;window.__blocked=true;window.fetch=(url,options)=>{let s=String(url);if(!s.startsWith('/api/deep/'))return original(url,options);let j=s.endsWith('/health')?{service:'sc-barcodezy-grounded-v06',dependencies_present:true,models_loaded:true,device:'TEST_FIXTURE'}:s.endsWith('/jobs')?{id:'test'}:s.endsWith('/result')?(window.__blocked?blocked:passed):{state:'completed',stage:'review',passes:[{view:'full',seconds:.1,candidates:0}]};return Promise.resolve(new Response(JSON.stringify(j),{status:200}));};}""",[fixture(True),fixture(False)])
            page.locator('#deepCheck').click();page.locator('#deepRun').click();page.locator('#deepReport').wait_for(state='visible');page.locator('#deepReviewed').check();assert page.locator('#deepAdd').is_disabled();assert 'BLOCKED' in page.locator('#deepSummary').inner_text();print('PASS blocked result cannot enter carton')
            with page.expect_download() as info:page.locator('#deepDraft').click()
            assert info.value.suggested_filename=='SC_Deep_DRAFT.svg';print('PASS draft SVG download')
            page.evaluate('window.__blocked=false');page.locator('#deepRun').click();page.locator('#deepReport').wait_for(state='visible');assert page.locator('#deepAdd').is_disabled();page.locator('#deepReviewed').check();assert page.locator('#deepAdd').is_enabled();page.locator('#deepAdd').click();page.locator('#deepDialog').wait_for(state='hidden');assert 'Deep Technical Draft' in page.locator('#library').inner_text();print('PASS reviewed fixture added to carton library')
            page.locator('#openTrace').click();page.locator('#deepOpen').click();page.wait_for_function("!document.querySelector('#deepCheck').disabled")
            page.locator('#deepConfig summary').click();page.locator('#deepMode').select_option('remote');page.locator('#deepEndpoint').fill('http://ai.example.com');page.locator('#deepToken').fill('test-secret');page.locator('#deepConnect').click();assert 'HTTPS' in page.locator('#deepHealth').inner_text();assert page.locator('#deepRun').is_disabled()
            page.evaluate("""() => {const old=window.fetch;window.fetch=(url,opt)=>{if(String(url).startsWith('https://ai.example.com/api/deep/')){window.lastRemoteAuth=opt.headers.Authorization;return Promise.resolve(new Response(JSON.stringify({service:'sc-barcodezy-grounded-v06',api_version:'2.4.2',dependencies_present:true,model_state:'not_loaded',device:'cpu'}),{status:200}));}return old(url,opt)}}""")
            page.locator('#deepEndpoint').fill('https://ai.example.com');page.locator('#deepConnect').click();page.wait_for_function("document.querySelector('#deepServiceState').textContent.includes('2.4.2')");assert page.evaluate('window.lastRemoteAuth')=='Bearer test-secret';assert 'ยังไม่ได้โหลด' in page.locator('#deepModelState').inner_text();print('PASS remote config validation, authorization header and separate model state (fixture)')
            assert not errors,errors;print('PASS no browser page errors')
            browser.close()
    finally:proc.terminate();proc.wait(timeout=10)
if __name__=='__main__':main()
