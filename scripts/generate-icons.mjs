import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
const png = await readFile(new URL('../public/noodle-master.png', import.meta.url));
for (const size of [180,192,512]) {
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>html,body{margin:0}img{display:block;width:100vw;height:100vh}</style><img src="data:image/png;base64,${png.toString('base64')}"/>`);
  await page.locator('img').evaluate(image => image.decode());
  await page.screenshot({path:new URL(`../public/noodle-${size}.png`,import.meta.url).pathname});
}
await browser.close();
