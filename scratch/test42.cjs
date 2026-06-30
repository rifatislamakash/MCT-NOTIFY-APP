const fs = require('fs');

// 1. Update index.html for qa-dots
let indexHtml = fs.readFileSync('index.html', 'utf8');
const targetDots = `<div class="flex justify-center items-center gap-1.5 mt-1" id="quick-access-dots">
                                    <div class="w-1.5 h-1.5 rounded-full bg-blue-600 transition-all duration-300 qa-dot" data-index="0"></div>
                                    <div class="w-1.5 h-1.5 rounded-full bg-slate-200 transition-all duration-300 qa-dot" data-index="1"></div>
                                    <div class="w-1.5 h-1.5 rounded-full bg-slate-200 transition-all duration-300 qa-dot" data-index="2"></div>
                                </div>`;
const replacementDots = `<div class="flex justify-center items-center gap-1.5 mt-1" id="quick-access-dots">
                                    <div onclick="window.scrollToQuickAccess(0)" class="w-2.5 h-2.5 sm:w-1.5 sm:h-1.5 rounded-full bg-blue-600 transition-all duration-300 qa-dot cursor-pointer" data-index="0"></div>
                                    <div onclick="window.scrollToQuickAccess(1)" class="w-2.5 h-2.5 sm:w-1.5 sm:h-1.5 rounded-full bg-slate-200 transition-all duration-300 qa-dot cursor-pointer" data-index="1"></div>
                                    <div onclick="window.scrollToQuickAccess(2)" class="w-2.5 h-2.5 sm:w-1.5 sm:h-1.5 rounded-full bg-slate-200 transition-all duration-300 qa-dot cursor-pointer" data-index="2"></div>
                                </div>`;
if (indexHtml.includes(targetDots)) {
    indexHtml = indexHtml.replace(targetDots, replacementDots);
    fs.writeFileSync('index.html', indexHtml);
    console.log('Fixed qa-dots in index.html');
}

// 2. Update dashboard.js for scrollToQuickAccess and mouse wheel
let js = fs.readFileSync('js/dashboard.js', 'utf8');

const targetScrollJS = `function initQuickAccessPagination() {
    const container = document.getElementById('quick-access-scroll-container');
    if (container) {
        container.addEventListener('scroll', updateQuickAccessPagination, { passive: true });
    }
}`;

const replacementScrollJS = `function initQuickAccessPagination() {
    const container = document.getElementById('quick-access-scroll-container');
    if (container) {
        container.addEventListener('scroll', updateQuickAccessPagination, { passive: true });
        
        // Mouse wheel scrolling for PC
        container.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                container.scrollBy({ left: e.deltaY > 0 ? container.clientWidth : -container.clientWidth, behavior: 'smooth' });
            }
        }, { passive: false });
    }
}

window.scrollToQuickAccess = function(index) {
    const container = document.getElementById('quick-access-scroll-container');
    if (!container) return;
    const width = container.clientWidth;
    container.scrollTo({ left: width * index, behavior: 'smooth' });
};`;

if (js.includes(targetScrollJS) && !js.includes('window.scrollToQuickAccess')) {
    js = js.replace(targetScrollJS, replacementScrollJS);
    fs.writeFileSync('js/dashboard.js', js);
    console.log('Added scrollToQuickAccess to dashboard.js');
}

