const fs = require('fs');
let content = fs.readFileSync('js/routines.js', 'utf8');

const replacement = `        export async function openAddRoutine(prefillDay = null, prefillTime = null) {
            const role = String(window.currentUserRole || '').toLowerCase();
            if (role !== 'admin' && role !== 'cr') return;
            
            // Prevent event objects from being used as prefill values
            if (prefillDay && typeof prefillDay !== 'string') prefillDay = null;
            if (prefillTime && typeof prefillTime !== 'string') prefillTime = null;
            window.showLoader(true, 'Preparing form...');
            try {
                await fetchRoutineDependencies();

                // Reset form first before setting dynamic values
                const form = document.getElementById('form-add-routine');
                if (form) form.reset();

                // Populate batches
                const batchSel = document.getElementById('add-routine-batch');
                if (batchSel) {
                    batchSel.innerHTML = '<option value="" disabled selected hidden>Select batch</option>' +
                        routineBatchesList.map(s => \`<option value="\${s.id}">\${window.sanitizeHTML(s.batch_name)}</option>\`).join('');
                    
                    if (routineBatchesList.length === 1) {
                        batchSel.value = routineBatchesList[0].id;
                        batchSel.parentElement.parentElement.classList.add('hidden');
                    } else {
                        batchSel.parentElement.parentElement.classList.remove('hidden');
                    }
                }

                // Call batch change manually to populate courses
                if (batchSel && batchSel.value) {
                    window.onRoutineBatchChange(batchSel, 'add');
                } else {
                    const courseSel = document.getElementById('add-routine-course');
                    if (courseSel) courseSel.innerHTML = '<option value="" disabled selected hidden>Select batch first</option>';
                }

                // Populate faculty
                const facSel = document.getElementById('add-routine-faculty');
                if (facSel) {
                    facSel.innerHTML = '<option value="" disabled selected hidden>Select faculty</option>' +
                        routineFacultyList.map(f => \`<option value="\${f.id}">\${window.sanitizeHTML(f.faculty_name)}\${f.teacher_initial ? ' [' + f.teacher_initial + ']' : ''}</option>\`).join('');
                }

                // After reset, force courseSel placeholder
                const cSel = document.getElementById('add-routine-course');
                if (cSel) cSel.value = '';
                
                if (prefillDay) document.getElementById('add-routine-day').value = prefillDay;
                if (prefillTime) document.getElementById('add-routine-time').value = prefillTime;

                const breakInfo = document.getElementById('add-routine-break-info');
                if (breakInfo) breakInfo.classList.add('hidden');

                window.navigate('screen-add-routine');
            } catch (err) {
                console.error('[OPEN ADD ROUTINE ERROR]', err);
                window.showGlobalToast('Error', 'Could not prepare form.');
            } finally {
                window.showLoader(false);
            }
        }`;

content = content.replace(/export async function openAddRoutine[\s\S]*?(?=\/\/ ---- SAVE NEW ROUTINE ----)/, replacement + '\n\n        ');
fs.writeFileSync('js/routines.js', content);
console.log('Fixed openAddRoutine');
