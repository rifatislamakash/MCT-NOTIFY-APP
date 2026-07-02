const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');

// Find any class="..." containing "bg-white" but not "dark:"
const regex = /class="[^"]*?\bbg-white\b(?![\/\w])[^"]*"/g;
let count = 0;

c = c.replace(regex, (match) => {
    // If the match already has a dark variant for background, skip
    if (match.includes('dark:bg-')) return match;
    
    // Otherwise, replace 'bg-white' with 'bg-white dark:bg-dark-card'
    count++;
    return match.replace(/\bbg-white\b(?![\/\w])/g, 'bg-white dark:bg-dark-card');
});

fs.writeFileSync('index.html', c);
console.log(`Replaced ${count} missing bg-white instances.`);
