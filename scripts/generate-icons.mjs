import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
const svg = await readFile(new URL('../public/icon.svg', import.meta.url),'utf8');
for (const size of [192,512]) {
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
  await page.screenshot({path:new URL(`../public/icon-${size}.png`,import.meta.url).pathname,omitBackground:true});
}
await browser.close();
