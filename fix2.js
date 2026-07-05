const fs = require('fs');
let code = fs.readFileSync('js/schedules.js', 'utf8');

const regex = /                    \} else \{\r?\n\s+targetTime = new Date\(eventDateTime\.getTime\(\) - offsetMinutes \* 60 \* 1000\);\r?\n\s+\}\r?\n\s+\}/;

const replaceStr =                     } else {
                        if (window.currentUserRole === 'cr' && window.currentUserCRBatches && window.currentUserCRBatches.length > 0) {
                            const targetLinks = window.currentUserCRBatches.map(batchId => ({
                                content_type: 'notice',
                                content_id: noticeData[0].id,
                                target_type: audience_type,
                                target_id: batchId
                            }));
                            await _supabase.from('content_targets').insert(targetLinks);
                        } else {
                            const targetLinks = [{
                                content_type: 'notice',
                                content_id: noticeData[0].id,
                                target_type: audience_type,
                                target_id: null
                            }];
                            await _supabase.from('content_targets').insert(targetLinks);
                        }
                    }

                    // Auto-queue notification for the notice ONLY after targets are inserted
                    const { NotificationQueueService } = await import('./services/NotificationQueueService.js');
                    const noticeQueueRes = await NotificationQueueService.queueNotification({
                        parentType: 'notice',
                        parentId: noticeData[0].id,
                        isNotifyEnabled: true,
                        audienceType: audience_type,
                        createdBy: window.authState.user?.id || null,
                        title: title,
                        message: window.stripRichText ? window.stripRichText(message) : message
                    });
                    if (!noticeQueueRes.success) console.error('[SCHEDULE] Notice push queue error:', noticeQueueRes.error);
                }

                // Task 3: Insert Reminders and Automatic Push Notification for Schedule AFTER targets are securely saved
                try {
                    const notifyAudience = document.getElementById('notify-audience-schedule')?.checked !== false;
                    const reminderRows = [];
                    
                    if (notifyAudience) {
                        const { NotificationQueueService } = await import('./services/NotificationQueueService.js');
                        const queueRes = await NotificationQueueService.queueNotification({
                            parentType: 'schedule',
                            parentId: newSchedule.id,
                            isNotifyEnabled: notifyAudience,
                            audienceType: audience_type,
                            createdBy: window.authState.user?.id || null,
                            courseName: selectedCourse ? selectedCourse.title : '',
                            message: window.stripRichText ? window.stripRichText(message) : message
                        });
                        if (!queueRes.success) console.error('[SCHEDULE] Schedule push queue error:', queueRes.error);
                    }

                    const reminderDivs = document.querySelectorAll('#schedule-reminders-list .reminder-row');
                    if (reminderDivs.length > 0) {
                        console.log(\[REMINDERS] Found \ schedule reminder rows to insert.\);
                        const eventDateTime = window.getSafariSafeDate();
                        
                        reminderDivs.forEach(div => {
                            const offsetSelect = div.querySelector('.reminder-offset');
                            const offsetVal = offsetSelect.value;
                            let targetTime;
                            
                            if (offsetVal === 'custom') {
                                const customInput = div.querySelector('.reminder-custom-time');
                                if (customInput && customInput.value) {
                                    targetTime = new Date(customInput.value);
                                }
                            } else {
                                const offsetMinutes = parseInt(offsetVal, 10);
                                if (!isNaN(offsetMinutes)) {
                                    targetTime = new Date(eventDateTime.getTime() - offsetMinutes * 60 * 1000);
                                }
                            };

if (regex.test(code)) {
    code = code.replace(regex, replaceStr);
    fs.writeFileSync('js/schedules.js', code);
    console.log("FIXED!");
} else {
    console.log("NOT MATCHED");
}
