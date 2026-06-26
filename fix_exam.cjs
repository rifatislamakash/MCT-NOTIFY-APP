const fs = require('fs');
let content = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', 'utf8');

const target = `                if (typeof window.switchToExamTab === 'function') {
                    window.switchToExamTab();
                } else {
                const examTabBtn = document.getElementById('btn-view-exams') || document.getElementById('tab-exams');
                if (examTabBtn) examTabBtn.click();
            }
        };`;

const replacement = `                if (typeof window.switchToExamTab === 'function') {
                    window.switchToExamTab();
                } else {
                    const examTabBtn = document.getElementById('btn-view-exams') || document.getElementById('tab-exams');
                    if (examTabBtn) examTabBtn.click();
                }
            } catch (error) {
                console.error("[ROUTER ERROR] Failed to navigate to Exam Panel:", error);
            } finally {
                // Release the lock after a safe delay
                if (window.openExamPanelTimer) clearTimeout(window.openExamPanelTimer);
                window.openExamPanelTimer = setTimeout(() => { isNavigatingToExams = false; }, 800);
            }
        };

        window.switchToExamTab = function() {
            if (typeof window.switchRoutineView === 'function') {
                window.switchRoutineView('exams');
            } else {
                const examTabBtn = document.getElementById('btn-view-exams') || document.getElementById('tab-exams');
                if (examTabBtn) examTabBtn.click();
            }
        };`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', content);
    console.log("Fixed openDedicatedExamPanel syntax error.");
} else {
    console.log("Could not find target to fix openDedicatedExamPanel.");
}
