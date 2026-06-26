const fs = require('fs');
let content = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/js/auth.js', 'utf8');

const target = `                    console.log("[PROFILE FETCH] checkActiveSession: fetching fresh profile");
                    let profileData = await fetchUserProfile(session.user.id).catch(e => {
                        console.warn("[PROFILE] Fetch failed:", e);
                        return null;
                    });
                    console.log(\`[PROFILE URL] checkActiveSession: profile_url is \${profileData?.profile_url || 'null'}\`);`;

const replacement = `                    console.log("[PROFILE FETCH] checkActiveSession: skipping immediate fetch (deferred)");
                    let profileData = null;`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/js/auth.js', content);
    console.log("Successfully replaced profile fetch in checkActiveSession.");
} else {
    console.log("Target string not found in auth.js");
}
