const fs = require('fs');
let js = fs.readFileSync('js/dashboard.js', 'utf8');

const regex = /function initQuickAccessPagination\(\)\s*\{\s*const container = document\.getElementById\('quick-access-scroll-container'\);\s*if \(container\) \{\s*container\.addEventListener\('scroll', updateQuickAccessPagination, \{ passive: true \}\);\s*window\.addEventListener\('resize', updateQuickAccessPagination, \{ passive: true \}\);\s*\}\s*\}/;

const replacementScrollJS = `function initQuickAccessPagination() {
    const container = document.getElementById('quick-access-scroll-container');
    if (container) {
        container.addEventListener('scroll', updateQuickAccessPagination, { passive: true });
        window.addEventListener('resize', updateQuickAccessPagination, { passive: true });
        
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

if (!js.includes('window.scrollToQuickAccess')) {
    js = js.replace(regex, replacementScrollJS);
    fs.writeFileSync('js/dashboard.js', js);
    console.log('Added scrollToQuickAccess and mouse wheel to dashboard.js');
}
