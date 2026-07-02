const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const mapping = [
    { lucide: 'home', normal: 'home.png', fill: 'homefill.png' },
    { lucide: 'calendar', normal: 'routine.png', fill: 'routinefill.png' },
    { lucide: 'calendar-clock', normal: 'schedule.png', fill: 'schedulefill.png' },
    { lucide: 'megaphone', normal: 'notice.png', fill: 'noticefill.png' },
    { lucide: 'user', normal: 'profile.png', fill: 'profilefill.png' }
];

// Step 1: Revert ALL to lucide icons (defaulting to w-5 h-5, we'll fix Quick Access size via CSS if needed, or just let them be w-5 h-5)
for (const rep of mapping) {
    const regex = new RegExp('<img src="assets/' + rep.normal + '" class="w-6 h-6 object-contain nav-icon-normal transition"><img src="assets/' + rep.fill + '" class="w-6 h-6 object-contain nav-icon-active transition" style="display:none;">', 'g');
    html = html.replace(regex, '<i data-lucide="' + rep.lucide + '" class="w-5 h-5"></i>');
}

// Step 2: Now ONLY replace inside bottom-nav-bar buttons!
// The buttons have classes like `nav-home-btn`, `nav-routine-btn`, `nav-schedule-btn`, `nav-notices-btn`, `nav-profile-btn`
const btnMapping = [
    { btnClass: 'nav-home-btn', lucide: 'home', normal: 'home.png', fill: 'homefill.png' },
    { btnClass: 'nav-routine-btn', lucide: 'calendar', normal: 'routine.png', fill: 'routinefill.png' },
    { btnClass: 'nav-schedule-btn', lucide: 'calendar-clock', normal: 'schedule.png', fill: 'schedulefill.png' },
    { btnClass: 'nav-notices-btn', lucide: 'megaphone', normal: 'notice.png', fill: 'noticefill.png' },
    { btnClass: 'nav-profile-btn', lucide: 'user', normal: 'profile.png', fill: 'profilefill.png' }
];

for (const rep of btnMapping) {
    // We look for the button tag, and its inner lucide icon, and replace just the icon.
    // It's safer to use a regex with a replacer function.
    const btnRegex = new RegExp('(<button[^>]*class="[^"]*' + rep.btnClass + '[^"]*"[^>]*>\\s*)<i data-lucide="' + rep.lucide + '" class="w-5 h-5"></i>', 'g');
    
    html = html.replace(btnRegex, (match, buttonStart) => {
        return buttonStart + '<img src="assets/' + rep.normal + '" class="w-6 h-6 object-contain nav-icon-normal transition"><img src="assets/' + rep.fill + '" class="w-6 h-6 object-contain nav-icon-active transition" style="display:none;">';
    });
}

// Write back
fs.writeFileSync('index.html', html);
console.log('Reverted non-nav icons and correctly applied to nav icons.');
