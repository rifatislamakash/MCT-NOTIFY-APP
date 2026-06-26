const fs = require('fs');
let content = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/main.js', 'utf8');

const replacement = `
// Deterministic Startup Queue
window.executeStartupQueue = function() {
    console.log('[STARTUP QUEUE] Executing deferred tasks...');
    const runQueue = (task) => {
        if (window.requestIdleCallback) {
            window.requestIdleCallback(task, { timeout: 2000 });
        } else {
            setTimeout(() => queueMicrotask(task), 50);
        }
    };

    runQueue(async () => {
        console.log('[STARTUP QUEUE] Fetching delayed profile...');
        if (window.authState && window.authState.user && typeof window.fetchUserProfile === 'function') {
            const profileData = await window.fetchUserProfile(window.authState.user.id).catch(e => null);
            if (profileData) {
                window.authState.profile = profileData;
                if (typeof window.updateGlobalAvatars === 'function') window.updateGlobalAvatars();
            }
        }
    });
};
`;

// Find everything from \n\n// Deterministic... to the end of the file.
const targetIdx = content.indexOf('\\n\\n// Deterministic Startup Queue');
if (targetIdx !== -1) {
    content = content.substring(0, targetIdx) + replacement;
    fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/main.js', content);
    console.log("Fixed main.js syntax error.");
} else {
    console.log("Could not find literal \\n\\n... string");
}
