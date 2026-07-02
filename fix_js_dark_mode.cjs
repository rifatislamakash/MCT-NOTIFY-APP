const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, 'js');

function processDirectory(directory) {
    const files = fs.readdirSync(directory);
    for (const file of files) {
        const fullPath = path.join(directory, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            const replacements = [
                { target: 'bg-[#F5F6F8]', newText: 'bg-[#F5F6F8] dark:bg-dark-bg' },
                { target: 'bg-white', newText: 'bg-white dark:bg-dark-card' },
                { target: 'text-slate-900', newText: 'text-slate-900 dark:text-dark-text' },
                { target: 'text-slate-800', newText: 'text-slate-800 dark:text-dark-text' },
                { target: 'text-slate-700', newText: 'text-slate-700 dark:text-dark-textSecondary' },
                { target: 'text-slate-600', newText: 'text-slate-600 dark:text-dark-textSecondary' },
                { target: 'text-slate-500', newText: 'text-slate-500 dark:text-dark-textSecondary' },
                { target: 'text-slate-400', newText: 'text-slate-400 dark:text-dark-textSecondary' },
                { target: 'border-slate-100', newText: 'border-slate-100 dark:border-white/5' },
                { target: 'border-slate-200', newText: 'border-slate-200 dark:border-white/10' },
                { target: 'bg-slate-50', newText: 'bg-slate-50 dark:bg-dark-bg/50' },
                { target: 'bg-slate-100', newText: 'bg-slate-100 dark:bg-white/5' },
                { target: 'bg-slate-200', newText: 'bg-slate-200 dark:bg-white/10' },
                { target: 'bg-[#0F172A]', newText: 'bg-[#0F172A] dark:bg-dark-nav' },
                { target: 'text-[#111827]', newText: 'text-[#111827] dark:text-dark-text' },
                { target: 'text-[#4b5563]', newText: 'text-[#4b5563] dark:text-dark-textSecondary' }
            ];

            for (const rep of replacements) {
                // Find all matches for target
                // For Tailwind classes, they are usually bounded by \b or ["'\/]
                // We'll use a regex that matches the exact class string, not followed by ' dark:'
                
                // Let's manually write safe regex for each target.
                const escapedTarget = rep.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const darkClass = rep.newText.split(' ')[1];
                
                // Ensure the target is a full word (preceded and followed by space, quote, or other boundary)
                // For `#` containing classes, \b doesn't work well at the start because `[` is not a word char.
                // We use (?<=[\\s"'`]) and (?=[\\s"'`\/])
                const regex = new RegExp(`(?<=[\\s"'\\\`])${escapedTarget}(?=[\\s"'\\\`\\/])(?!\\s+${darkClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g');
                
                const matches = content.match(regex);
                if (matches) {
                    content = content.replace(regex, rep.newText);
                    modified = true;
                }
            }

            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated ${file}`);
            }
        }
    }
}

processDirectory(jsDir);
console.log('Finished updating JS files.');
