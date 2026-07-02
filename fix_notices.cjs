const fs = require('fs');

let content = fs.readFileSync('js/notices.js', 'utf8');

// Replace background classes for cards
content = content.replace(/bg-white dark:bg-dark-card rounded-\[20px\]/g, 'bg-white dark:bg-gradient-to-br dark:from-[#0F1117] dark:to-[#1A1D26] rounded-[20px]');

// Replace title text colors
content = content.replace(/text-\[#111827\] dark:text-dark-text/g, 'text-[#111827] dark:text-indigo-50');

fs.writeFileSync('js/notices.js', content, 'utf8');
console.log('Updated js/notices.js');
