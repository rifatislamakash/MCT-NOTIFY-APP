const fs = require('fs');
let js = fs.readFileSync('js/dashboard.js', 'utf8');

// Replace items mapping HTML
const oldHtmlMap = `container.innerHTML = items.map(item => \`
            <div class="flex items-center gap-2 px-2 flex-[0_0_33.333%] justify-center border-r border-slate-100 last:border-0 cursor-pointer transition-transform active:scale-95" onclick="\${item.action}">
                \${item.icon}
                <div class="flex flex-col items-start leading-none gap-1">
                    <span class="text-[8.5px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis max-w-full block">\${item.label}</span>
                    <span class="text-[14px] font-extrabold text-slate-800 leading-none">\${item.count > 99 ? '99+' : item.count}</span>
                </div>
            </div>\`).join('');`;

const newHtmlMap = `container.innerHTML = items.map(item => \`
            <div class="flex items-center justify-center gap-2 px-2 flex-[0_0_33.333%] h-full border-r border-slate-100 last:border-0 cursor-pointer transition-transform active:scale-95" onclick="\${item.action}">
                \${item.icon}
                <div class="flex flex-col items-start leading-none gap-0.5">
                    <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap overflow-hidden text-ellipsis max-w-full block">\${item.label}</span>
                    <span class="text-[14px] font-extrabold text-slate-800 leading-none">\${item.count > 99 ? '99+' : item.count}</span>
                </div>
            </div>\`).join('');`;

js = js.replace(oldHtmlMap, newHtmlMap);

// Replace startTAGAutoScroll
const oldScrollStart = 'window.startTAGAutoScroll = function() {';
const oldScrollEnd = '};';

let s = js.indexOf(oldScrollStart);
let e = js.indexOf(oldScrollEnd, js.indexOf('window._tagScrollRAF = requestAnimationFrame(step);', s));

const newScrollFunc = `window.startTAGAutoScroll = function() {
    const container = document.getElementById('tag-scroll-container');
    if (!container) return;

    if (window._tagScrollRAF) {
        cancelAnimationFrame(window._tagScrollRAF);
    }
    
    // We want perfectly smooth scrolling (CSS pixels). 
    let speed = 0.6; 
    let delayFrames = 90; // Wait 1.5 seconds at the start before scrolling
    let isPaused = false;
    let currentScroll = container.scrollLeft;
    let isResetting = false;

    container.addEventListener('touchstart', () => { isPaused = true; }, {passive: true});
    container.addEventListener('touchend', () => { isPaused = false; delayFrames = 60; currentScroll = container.scrollLeft; }, {passive: true});
    container.addEventListener('mousedown', () => { isPaused = true; });
    container.addEventListener('mouseup', () => { isPaused = false; delayFrames = 60; currentScroll = container.scrollLeft; });
    container.addEventListener('mouseleave', () => { isPaused = false; });
    container.addEventListener('scroll', () => { 
        if(isPaused && !isResetting) currentScroll = container.scrollLeft; 
    }, {passive: true});

    function step() {
        if (!isPaused && container.scrollWidth > container.clientWidth) {
            if (delayFrames > 0) {
                delayFrames--;
                currentScroll = container.scrollLeft;
            } else if (!isResetting) {
                currentScroll += speed;
                
                if (currentScroll >= (container.scrollWidth - container.clientWidth - 1)) {
                    // Jump back to the start smoothly 
                    delayFrames = 120; // Pause at the end for 2 seconds
                    isResetting = true;
                    container.scrollTo({ left: 0, behavior: 'smooth' });
                    // Wait for smooth scroll to finish
                    setTimeout(() => {
                        isResetting = false;
                        currentScroll = 0;
                    }, 400); // 400ms is enough for smooth scroll
                } else {
                    container.scrollLeft = currentScroll;
                }
            }
        }
        window._tagScrollRAF = requestAnimationFrame(step);
    }

    // Force scroll to left initially
    container.scrollLeft = 0;
    window._tagScrollRAF = requestAnimationFrame(step);
};`;

js = js.substring(0, s) + newScrollFunc + js.substring(e + 2);
fs.writeFileSync('js/dashboard.js', js);
console.log("Fixed dashboard tag layout and scroll");
