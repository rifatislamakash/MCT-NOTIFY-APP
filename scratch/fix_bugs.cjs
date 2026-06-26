const fs = require('fs');

// 1. Fix routines.js NotificationQueueService
let routines = fs.readFileSync('js/routines.js', 'utf8');
const searchBlock = `                    await window._supabase.functions.invoke('send-reminders', {
                        body: {
                            target_id: examId,
                            title: \`Knock knock...! '\${courseName}' exam is knocking at the door.\`,
                            body: \`'\${courseName}' Exam will be held on '\${examDate} & \${window.formatTimeIfPossible ? window.formatTimeIfPossible(startTime) : startTime}'.\`,
                            type: 'NEW_EXAM',
                            topic: targetTopic,
                            time: new Date().toISOString()
                        }
                    }).catch(err => console.warn('Failed to send push notification', err));`;

const replaceBlock = `                    const { NotificationQueueService } = await import('./services/NotificationQueueService.js?v=rescue2');
                    const queueRes = await NotificationQueueService.queueNotification({
                        parentType: 'exam',
                        parentId: examId,
                        isNotifyEnabled: true,
                        audienceType: 'batch_students',
                        createdBy: window.authState.user.id,
                        courseName: courseName,
                        date: examDate,
                        time: window.formatTimeIfPossible ? window.formatTimeIfPossible(startTime) : startTime
                    });
                    if (!queueRes.success) console.error("Exam Queue Error:", queueRes.error);`;

if (routines.includes(searchBlock)) {
    routines = routines.replace(searchBlock, replaceBlock);
    fs.writeFileSync('js/routines.js', routines);
    console.log("Fixed routines.js");
} else {
    console.log("Could not find routines.js block");
}

// 2. Fix index.html duplicate error listener
let indexHtml = fs.readFileSync('index.html', 'utf8');
const searchListener = `        // Loader Deadlock prevention global event handlers (Part 7)
        window.addEventListener('unhandledrejection', (event) => {
            console.warn('[LOADER FAILSAFE] Unhandled promise rejection, force-hiding loader.', event.reason);
            if (typeof forceHideLoader === 'function') forceHideLoader();
        });
        window.addEventListener('error', (event) => {
            console.warn('[LOADER FAILSAFE] Global error encountered, force-hiding loader.', event.error);
            if (typeof forceHideLoader === 'function') forceHideLoader();
        });`;

if (indexHtml.includes(searchListener)) {
    indexHtml = indexHtml.replace(searchListener, `        // Loader Deadlock prevention global event handlers (Part 7)\n        window.addEventListener('unhandledrejection', (event) => {\n            console.warn('[LOADER FAILSAFE] Unhandled promise rejection, force-hiding loader.', event.reason);\n            if (typeof forceHideLoader === 'function') forceHideLoader();\n        });`);
    fs.writeFileSync('index.html', indexHtml);
    console.log("Fixed index.html duplicate error listener");
} else {
    console.log("Could not find error listener in index.html");
}

// 3. Fix resendCooldownInterval in index.html
const searchResend = `            resendCooldownInterval = setInterval(() => {
                timeLeft--;
                text.innerText = \`in \${timeLeft}s\`;
                if (timeLeft <= 0) {
                    clearInterval(resendCooldownInterval);
                    btn.disabled = false;
                    text.classList.add('hidden');
                    text.innerText = "in 60s";
                }
            }, 1000);`;

const replaceResend = `            resendCooldownInterval = setInterval(() => {
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

if (indexHtml.includes(searchResend)) {
    indexHtml = indexHtml.replace(searchResend, replaceResend);
    
    // Also, clear interval on close
    const searchClose = `        function closeForgotPassword() {
            document.getElementById('screen-forgot').classList.remove('active');
            document.getElementById('forgot-email').value = '';
            document.getElementById('forgot-email-error').classList.add('hidden');`;
    
    const replaceClose = `        function closeForgotPassword() {
            if (resendCooldownInterval) clearInterval(resendCooldownInterval);
            document.getElementById('screen-forgot').classList.remove('active');
            document.getElementById('forgot-email').value = '';
            document.getElementById('forgot-email-error').classList.add('hidden');`;
            
    indexHtml = indexHtml.replace(searchClose, replaceClose);
    fs.writeFileSync('index.html', indexHtml);
    console.log("Fixed index.html resendCooldownInterval");
} else {
    console.log("Could not find resendCooldownInterval in index.html");
}
