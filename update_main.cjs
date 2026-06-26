const fs = require('fs');
let content = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/main.js', 'utf8');

const target = `    runQueue(async () => {
        console.log('[STARTUP QUEUE] Fetching delayed profile...');
        if (window.authState && window.authState.user && typeof window.fetchUserProfile === 'function') {
            const profileData = await window.fetchUserProfile(window.authState.user.id).catch(e => null);
            if (profileData) {
                window.authState.profile = profileData;
                if (typeof window.updateGlobalAvatars === 'function') window.updateGlobalAvatars();
            }
        }
    });`;

const replacement = `    runQueue(async () => {
        console.log('[STARTUP QUEUE] Synchronizing DOM profiles...');
        if (typeof window.populateProfileDetails === 'function') {
            window.populateProfileDetails();
        }
    });`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/main.js', content);
    console.log("Successfully updated main.js executeStartupQueue.");
} else {
    console.log("Target string not found in main.js");
}
