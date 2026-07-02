const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Fix Quick Access sizes
html = html.replace(/<i data-lucide="megaphone" class="w-5 h-5"><\/i>/g, '<i data-lucide="megaphone" class="w-5.5 h-5.5"></i>');
html = html.replace(/<i data-lucide="calendar-clock" class="w-5 h-5"><\/i>/g, '<i data-lucide="calendar-clock" class="w-5.5 h-5.5"></i>');
// Routine icon in quick access is 'calendar', but let's just do it globally for the one in quick access
html = html.replace(/<div class="w-\[52px\] h-\[52px\] bg-fuchsia-50 text-fuchsia-600 rounded-2xl flex items-center justify-center shadow-2xs transition-transform active:scale-95 relative">\s*<i data-lucide="calendar" class="w-5 h-5"><\/i>/g, '<div class="w-[52px] h-[52px] bg-fuchsia-50 text-fuchsia-600 rounded-2xl flex items-center justify-center shadow-2xs transition-transform active:scale-95 relative">\n                                                <i data-lucide="calendar" class="w-5.5 h-5.5"></i>');

// 2. Fix JS template sizes
// Calendar next to day_name
html = html.replace(/<i data-lucide="calendar" class="w-5 h-5"><\/i>\$\{r.day_name/g, '<i data-lucide="calendar" class="w-3.5 h-3.5"></i>${r.day_name');
// User next to facName in schedule card
html = html.replace(/<i data-lucide="user" class="w-5 h-5"><\/i>\$\{facName\}/g, '<i data-lucide="user" class="w-3.5 h-3.5"></i>${facName}');
// User next to facName in course details
html = html.replace(/<i data-lucide="user" class="w-5 h-5"><\/i> \$\{facName\}/g, '<i data-lucide="user" class="w-3.5 h-3.5"></i> ${facName}');

fs.writeFileSync('index.html', html);
console.log('Fixed sizes.');
