const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'index.html');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Add initialization script to <head> to prevent flash of light mode
const initScript = `
    <!-- Dark Mode Init -->
    <script>
        if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    </script>
`;
if (!content.includes('<!-- Dark Mode Init -->')) {
    content = content.replace('<head>', '<head>' + initScript);
}

// 2. Add Tailwind Config
const tailwindConfig = `
    <!-- Tailwind Configuration -->
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        dark: {
                            bg: '#0F1117',
                            card: '#1A1D26',
                            nav: '#171A22',
                            text: '#F3F4F6',
                            textSecondary: '#9CA3AF',
                        }
                    }
                }
            }
        }
    </script>
`;
if (!content.includes('tailwind.config = {')) {
    content = content.replace('<script src="https://cdn.tailwindcss.com"></script>', '<script src="https://cdn.tailwindcss.com"></script>' + tailwindConfig);
}

// 3. Mass Class Replacements (Only replace if not already replaced)
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
    { target: 'bg-[#0F172A]', newText: 'bg-[#0F172A] dark:bg-dark-nav' }
];

replacements.forEach(rep => {
    const escapedTarget = rep.target.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    const escapedDarkPart = rep.newText.split(' ')[1].replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    
    const regex = new RegExp(escapedTarget + '(?![\\\\s]*' + escapedDarkPart + ')', 'g');
    content = content.replace(regex, rep.newText);
});

// 4. Update Nav Bar CSS for Dark Mode
const navBarCSS = `
        /* DARK MODE NAV BAR CSS */
        .dark .bottom-nav-bar {
            background: linear-gradient(135deg, rgba(23, 26, 34, 0.85), rgba(15, 17, 23, 0.65)) !important;
            border: 1px solid rgba(255, 255, 255, 0.05) !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.02) !important;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5) !important;
        }
`;
if (!content.includes('/* DARK MODE NAV BAR CSS */')) {
    content = content.replace('/* Override Tailwind sizing', navBarCSS + '\\n        /* Override Tailwind sizing');
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Mass replacements and config added.');
