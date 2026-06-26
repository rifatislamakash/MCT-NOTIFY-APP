const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// 1. Remove duplicate error listener
const errorListenerPattern = /window\.addEventListener\('error', \(event\) => \{\s*console\.warn\('\[LOADER FAILSAFE\] Global error encountered, force-hiding loader\.', event\.error\);\s*if \(typeof forceHideLoader === 'function'\) forceHideLoader\(\);\s*\}\);/;
if (errorListenerPattern.test(content)) {
    content = content.replace(errorListenerPattern, '');
    console.log('Removed duplicate error listener in index.html');
} else {
    console.log('Error listener not found');
}

// 2. Fix resendCooldownInterval
const resendPattern = /resendCooldownInterval = setInterval\(\(\) => \{\s*timeLeft--;\s*text\.innerText = `in \$\{timeLeft\}s`;\s*if \(timeLeft <= 0\) \{\s*clearInterval\(resendCooldownInterval\);\s*btn\.disabled = false;\s*text\.classList\.add\('hidden'\);\s*text\.innerText = "in 60s";\s*\}\s*\}, 1000\);/g;

const resendReplacement = `resendCooldownInterval = setInterval(() => {
                timeLeft--;
                if (text) text.innerText = \`in \${timeLeft}s\`;
                if (timeLeft <= 0) {
                    clearInterval(resendCooldownInterval);
                    if (btn) btn.disabled = false;
                    if (text) {
                        text.classList.add('hidden');
                        text.innerText = "in 60s";
                    }
                }
            }, 1000);`;

if (resendPattern.test(content)) {
    content = content.replace(resendPattern, resendReplacement);
    console.log('Fixed resendCooldownInterval in index.html');
} else {
    console.log('resendCooldownInterval block not found');
}

// 3. Clear resendCooldownInterval on closeForgotPassword
const closeForgotPattern = /function closeForgotPassword\(\) \{\s*document\.getElementById\('screen-forgot'\)\.classList\.remove\('active'\);/;
const closeForgotReplacement = `function closeForgotPassword() {
            if (resendCooldownInterval) clearInterval(resendCooldownInterval);
            document.getElementById('screen-forgot').classList.remove('active');`;

if (closeForgotPattern.test(content)) {
    content = content.replace(closeForgotPattern, closeForgotReplacement);
    console.log('Fixed closeForgotPassword in index.html');
} else {
    console.log('closeForgotPassword block not found');
}

fs.writeFileSync('index.html', content);
