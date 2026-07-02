const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<!DOCTYPE html><html><body><i data-lucide='home'></i><i data-lucide='calendar'></i><i data-lucide='calendar-clock'></i><i data-lucide='megaphone'></i></body></html>`);
global.window = dom.window;
global.document = dom.window.document;
const lucide = require('lucide');
lucide.createIcons();
console.log(document.body.innerHTML);
