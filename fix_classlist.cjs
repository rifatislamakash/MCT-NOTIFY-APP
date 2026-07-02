const fs = require('fs');

function replaceClassList(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Fix classList.add or .remove with space-separated strings
    content = content.replace(/classList\.([a-zA-Z]+)\(([^)]+)\)/g, (match, method, args) => {
        if (method !== 'add' && method !== 'remove') return match;
        
        let newArgs = args;
        // Find strings that have spaces inside them, e.g. 'bg-white dark:bg-dark-card'
        newArgs = newArgs.replace(/['"]([^'"]+)['"]/g, (strMatch, innerStr) => {
            if (innerStr.includes(' ')) {
                // Split by space and quote each
                return innerStr.split(/\s+/).filter(Boolean).map(s => `'${s}'`).join(', ');
            }
            return strMatch;
        });
        
        return `classList.${method}(${newArgs})`;
    });

    fs.writeFileSync(filePath, content, 'utf8');
}

replaceClassList('js/dashboard.js');
replaceClassList('js/routines.js');
console.log('Fixed classList issues.');
