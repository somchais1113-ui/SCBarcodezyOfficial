// Install Playwright and its Chromium browser, then run: node tests/studio-errors.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');

async function check() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: process.env.CHROMIUM_PATH ? ['--no-sandbox','--single-process'] : []
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const open = name => page.goto(pathToFileURL(path.join(root,name+'.html')).href);

    await open('carton');
    await page.locator('#inkMode').selectOption('blue');
    assert(await page.locator('#pdf').isDisabled());
    assert(await page.locator('#svg').isDisabled());
    assert(await page.locator('#jpeg').isEnabled());
    await page.locator('#inkMode').selectOption('original');
    assert(await page.locator('#pdf').isEnabled());

    await open('studio');
    await page.locator('[data-add=text]').click();
    const state = () => page.evaluate(()=>[JSON.stringify(project), selected, history.length, future.length]);
    const before = await state();
    const broken = JSON.parse(before[0]);
    broken.fonts.Broken = 'YmFk';
    broken.layers[0].font = 'Broken';
    await page.locator('#projectFile').setInputFiles({
      name:'broken.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(broken))
    });
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Broken'));
    assert.deepEqual(await state(),before);

    await open('sticker');
    await page.waitForFunction(()=>job && master);
    // Red top, blue bottom. EXIF orientation 6 rotates this to blue left, red right.
    const encoded = await page.evaluate(()=>{
      const c=document.createElement('canvas'); c.width=100; c.height=60;
      const ctx=c.getContext('2d');
      ctx.fillStyle='red';ctx.fillRect(0,0,100,30);
      ctx.fillStyle='blue';ctx.fillRect(0,30,100,30);
      return c.toDataURL('image/jpeg').split(',')[1];
    });
    const raw = Buffer.from(encoded,'base64');
    const app1 = Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex');
    await page.locator('#file').setInputFiles({
      name:'camera.jpg', mimeType:'image/jpeg', buffer:Buffer.concat([raw.subarray(0,2),app1,raw.subarray(2)])
    });
    await page.waitForFunction(()=>job && master?.orientation===6);
    await page.locator('#qty').fill('1');
    await page.locator('#bleed').fill('0');
    await page.locator('#rotate').selectOption('0');
    const pixels = await page.evaluate(async()=>{
      const j=job;
      const blob=await production(j,'print');
      const c=await renderPdf(new Uint8Array(await blob.arrayBuffer()),1000);
      const ctx=c.getContext('2d');
      const read=x=>Array.from(ctx.getImageData(Math.floor(j.left+x*j.w),Math.floor(j.top+j.h/2),1,1).data);
      return [read(.25),read(.75)];
    });
    assert(pixels[0][2]>200 && pixels[1][0]>200,JSON.stringify(pixels));
    assert.deepEqual(errors,[]);
    console.log('Carton empty export, template rollback and oriented JPEG production passed.');
  } finally {
    await browser.close();
  }
}
check().catch(error=>{console.error(error);process.exitCode=1;});
