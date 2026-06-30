const fs = require('fs');

// 1. Fix polls.js sorting
let pollsJs = fs.readFileSync('js/polls.js', 'utf8');
const targetPolls = 'if (this.currentPolls.length === 0) {';
const replacementPolls = `            const now = new Date();
            const toDateStr = (d) => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
            this.currentPolls.sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;

                const dateA = new Date((a.notice_date || toDateStr(now)) + 'T' + (a.notice_time || '23:59:00'));
                const dateB = new Date((b.notice_date || toDateStr(now)) + 'T' + (b.notice_time || '23:59:00'));
                const aIsExpired = dateA < now;
                const bIsExpired = dateB < now;
                
                if (aIsExpired !== bIsExpired) {
                    return aIsExpired ? 1 : -1; // Active first, expired last
                }
                if (!aIsExpired) {
                    return dateA - dateB; // Upcoming: closest first
                } else {
                    return dateB - dateA; // Expired: most recent past first
                }
            });

        if (this.currentPolls.length === 0) {`;
if (pollsJs.includes(targetPolls) && !pollsJs.includes('this.currentPolls.sort(')) {
    pollsJs = pollsJs.replace(targetPolls, replacementPolls);
    fs.writeFileSync('js/polls.js', pollsJs);
    console.log('Fixed polls.js sorting');
}

// 2. Add smooth scrolling CSS to index.html
let indexHtml = fs.readFileSync('index.html', 'utf8');
const targetCSS = '</style>';
const replacementCSS = `
        /* Hardware Acceleration for TAG Auto Scroll */
        #tag-scroll-container {
            transform: translateZ(0);
            -webkit-transform: translateZ(0);
            will-change: scroll-position;
            perspective: 1000;
            backface-visibility: hidden;
        }
    </style>`;
if (indexHtml.includes(targetCSS) && !indexHtml.includes('will-change: scroll-position;')) {
    indexHtml = indexHtml.replace(targetCSS, replacementCSS);
    fs.writeFileSync('index.html', indexHtml);
    console.log('Added hardware acceleration CSS to index.html');
}

