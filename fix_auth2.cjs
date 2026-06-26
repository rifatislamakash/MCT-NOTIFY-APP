const fs = require('fs');
let content = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/js/auth.js', 'utf8');

const targetRegex = /console\.log\("\[PROFILE FETCH\] checkActiveSession: fetching fresh profile"\);\s*let profileData = await fetchUserProfile\(session\.user\.id\)\.catch\(e => \{\s*console\.warn\("\[PROFILE\] Fetch failed:", e\);\s*return null;\s*\}\);\s*console\.log\(`\[PROFILE URL\] checkActiveSession: profile_url is \$\{profileData\?\.profile_url \|\| 'null'\}\`\);/;

const replacement = `console.log("[PROFILE FETCH] checkActiveSession: skipping immediate fetch (deferred)");
                    let profileData = null;`;

if (targetRegex.test(content)) {
    content = content.replace(targetRegex, replacement);
    fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/js/auth.js', content);
    console.log("Successfully replaced profile fetch in checkActiveSession.");
} else {
    console.log("Target regex not found in auth.js");
}
