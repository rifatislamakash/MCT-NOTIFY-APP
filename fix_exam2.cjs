const fs = require('fs');
let content = fs.readFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', 'utf8');

const targetRegex = /if \(typeof window\.switchToExamTab === 'function'\) \{\s*window\.switchToExamTab\(\);\s*\} else \{\s*const examTabBtn = document\.getElementById\('btn-view-exams'\) \|\| document\.getElementById\('tab-exams'\);\s*if \(examTabBtn\) examTabBtn\.click\(\);\s*\}\s*\};\s*export const DashboardService/;

const replacement = `if (typeof window.switchToExamTab === 'function') {
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
        };

export const DashboardService`;

if (targetRegex.test(content)) {
    content = content.replace(targetRegex, replacement);
    fs.writeFileSync('d:/MCT Notify - Antigravity/Notify/js/dashboard.js', content);
    console.log("Fixed openDedicatedExamPanel syntax error.");
} else {
    console.log("Could not find target to fix openDedicatedExamPanel.");
}
