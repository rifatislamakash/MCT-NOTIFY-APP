const fs = require('fs');

let c = fs.readFileSync('index.html', 'utf8');

// Fix bg-[#F5F6F8]
c = c.replace(/bg-\[#F5F6F8\](?! dark:bg-dark-bg)/g, 'bg-[#F5F6F8] dark:bg-dark-bg');

// Fix spacing from previous script error
c = c.replace(/bg-white\/20text-/g, 'bg-white/20 text-');
c = c.replace(/bg-white\/20rounded/g, 'bg-white/20 rounded');

// Let's also fix missing bg-white in JS template strings.
// A safe way is to find instances of `bg-white ` or `bg-white"` inside HTML or JS
// and add `dark:bg-dark-card` if it is not followed by `dark:bg-dark-card`.
// We have to be careful with `bg-white/` which we already fixed to `bg-white/20`.

c = c.replace(/\bbg-white(?![^\s]*dark:bg-dark-card)(?![\/\w])/g, 'bg-white dark:bg-dark-card');

fs.writeFileSync('index.html', c);
console.log('Fixed background and white card issues.');
