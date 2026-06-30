const fs = require('fs');
let txt = fs.readFileSync('index.html', 'utf8');

const target = `@supports (-webkit-touch-callout: none) {
            .backdrop-blur-sm, .backdrop-blur-md, .backdrop-blur-lg, .backdrop-blur-xl, .backdrop-blur-2xl, .backdrop-blur,
            [class*="backdrop-blur-"], .modal-overlay, .frosted-glass-element, .dropdown-backdrop {
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
            }`;

const replacement = `@supports (-webkit-touch-callout: none) {
            .backdrop-blur-sm, .backdrop-blur-md, .backdrop-blur-lg, .backdrop-blur-xl, .backdrop-blur-2xl, .backdrop-blur,
            [class*="backdrop-blur-"], .modal-overlay, .frosted-glass-element, .dropdown-backdrop {
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
            }
        }`;

if (txt.includes(target)) {
    txt = txt.replace(target, replacement);
    fs.writeFileSync('index.html', txt);
    console.log('Fixed CSS syntax error in index.html');
} else {
    console.log('Target not found');
}
