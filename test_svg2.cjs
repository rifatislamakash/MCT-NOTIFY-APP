
const { JSDOM } = require('jsdom');
const dom = new JSDOM(\<!DOCTYPE html><html><body><i data-lucide='home'></i></body></html>\);
global.window = dom.window;
global.document = dom.window.document;
import('node-fetch').then(fetch => {
  fetch.default('https://unpkg.com/lucide@latest/dist/umd/lucide.js')
    .then(r => r.text())
    .then(code => {
      eval(code);
      lucide.createIcons();
      console.log(document.body.innerHTML);
    });
});
