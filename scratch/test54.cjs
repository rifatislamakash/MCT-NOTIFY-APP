const fs = require('fs');
const txt = fs.readFileSync('index.html', 'utf8');

let depth = 0;
let results = [];
let currentScreen = null;

// Split by tags
const tags = txt.match(/<\/?(?:div|span|section|header|footer|nav|main|aside)[^>]*>/gi) || [];

for (const tag of tags) {
    if (tag.startsWith('</')) {
        depth--;
        if (currentScreen && depth < currentScreen.depth) {
            // Screen closed
            currentScreen = null;
        }
    } else {
        if (tag.includes('class="screen') || tag.includes("class='screen") || tag.includes('class="screen ')) {
            const match = tag.match(/id=["']([^"']+)["']/);
            const id = match ? match[1] : 'unknown';
            results.push({ id, depth });
            currentScreen = { id, depth };
        }
        
        // Don't increment depth for self-closing tags (though div etc rarely self-close, just in case)
        if (!tag.endsWith('/>')) {
            depth++;
        }
    }
}

console.log("Screen depths:");
results.forEach(r => console.log(`${r.id}: ${r.depth}`));
