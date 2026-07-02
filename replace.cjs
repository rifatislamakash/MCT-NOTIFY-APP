const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const replacements = [
    { lucide: 'home', normal: 'home.png', fill: 'homefill.png' },
    { lucide: 'calendar', normal: 'routine.png', fill: 'routinefill.png' },
    { lucide: 'calendar-clock', normal: 'schedule.png', fill: 'schedulefill.png' },
    { lucide: 'megaphone', normal: 'notice.png', fill: 'noticefill.png' },
    { lucide: 'user', normal: 'profile.png', fill: 'profilefill.png' }
];

for (const rep of replacements) {
    const regex = new RegExp('<i data-lucide="' + rep.lucide + '"[^>]*></i>', 'g');
    const newHtml = '<img src="assets/' + rep.normal + '" class="w-5 h-5 nav-icon-normal transition"><img src="assets/' + rep.fill + '" class="w-5 h-5 nav-icon-active transition" style="display:none;">';
    html = html.replace(regex, newHtml);
}

fs.writeFileSync('index.html', html);
console.log('Replaced icons.');
