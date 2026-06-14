const fs = require('fs');
let c = fs.readFileSync('js/routines.js', 'utf8');

c = c.replace(
    /export async function handleSaveRoutine\(e\) \{\s*\}/,
`export async function handleSaveRoutine(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    try {
        if (!(await window.verifyAdminStatus())) { window.showGlobalToast('Error', 'Admin check failed.'); return; }
        const role = String(window.currentUserRole || '').toLowerCase();
        if (role !== 'admin' && role !== 'cr') return;
        if (isSavingRoutine) return;
        isSavingRoutine = true;

        const batchId = document.getElementById('add-routine-batch')?.value;
        const day = document.getElementById('add-routine-day')?.value;
        const time = document.getElementById('add-routine-time')?.value;
        const courseId = document.getElementById('add-routine-course')?.value;
        const isBreak = courseId === '__BREAK__';
        const section = isBreak ? null : (document.getElementById('add-routine-section')?.value || null);
        const facultyId = isBreak ? null : (document.getElementById('add-routine-faculty')?.value || null);
        const room = document.getElementById('add-routine-room')?.value?.trim() || null;

        if (!batchId || !day || !time || !courseId) {
            window.showGlobalToast('Validation Error', 'Please fill Batch, Day, Time and Course.');
            isSavingRoutine = false;
            return;
        }`
);

fs.writeFileSync('js/routines.js', c);
console.log('Fixed routines.js');
