import { _supabase } from './supabase-client.js';
import { showGlobalToast, showLoader, forceHideLoader, fetchCachedOrDeduplicated, cancelActiveRequest, fetchWithRetry } from './utils.js';
import { CourseStore } from './stores/CourseStore.js';
import { FacultyStore } from './stores/FacultyStore.js';
import { crPermissionService } from './services/crPermissionService.js';
import { RoutineStore } from './stores/RoutineStore.js';
import { NotificationStore } from './stores/NotificationStore.js';
import { ProfileStore } from './stores/ProfileStore.js';

        // ==========================================
        // ROUTINE SYSTEM - COMPLETE ENGINE
        // ==========================================

        // Global state for routine system
        let routineData = []; // All weekly_routines rows (enriched)
        let routineCoursesList = [];
        let routineFacultyList = [];
        let routineBatchesList = [];
        let selectedRoutineId = null;
        let currentRoutineView = 'weekly'; // 'weekly' | 'daily'

        // Days order for the timetable columns — all 7 days
        const ROUTINE_DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        // Map JS day number → full day name (all 7 days)
        const JS_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        function getDayNameByIndex(idx) {
            return JS_DAY_NAMES[idx] || null;
        }

        // Get today's day name
        function getTodayRoutineDayName() {
            return JS_DAY_NAMES[new Date().getDay()];
        }

        // Get tomorrow's day name
        function getTomorrowRoutineDayName() {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return JS_DAY_NAMES[tomorrow.getDay()];
        }

        // Smart: returns { dayName, label } — after 6 PM shows tomorrow, else today
        function getSmartDashboardDay() {
            const now = new Date();
            const hour = now.getHours();
            if (hour >= 18) {
                // After 6 PM — show tomorrow
                return { dayName: getTomorrowRoutineDayName(), isToday: false };
            }
            return { dayName: getTodayRoutineDayName(), isToday: true };
        }

        // Handle Break selection in course dropdown
        function onRoutineCourseChange(sel, mode) {
            const isBreak = sel.value === '__BREAK__';
            const prefix = mode === 'add' ? 'add' : 'edit';
            
            const facSection = document.getElementById(`${prefix}-routine-faculty-section`);
            const roomSection = document.getElementById(`${prefix}-routine-room-section`);
            const breakInfo = document.getElementById(`${prefix}-routine-break-info`);
            const sectionContainer = document.getElementById(`${prefix}-routine-section-container`);
            const sectionSel = document.getElementById(`${prefix}-routine-section`);
            
            if (facSection) { facSection.style.opacity = isBreak ? '0.4' : '1'; const facSel = facSection.querySelector('select'); if (facSel) facSel.required = !isBreak; }
            if (roomSection) { roomSection.style.opacity = isBreak ? '0.4' : '1'; const roomIn = roomSection.querySelector('input'); if (roomIn) roomIn.required = !isBreak; }
            if (breakInfo) { isBreak ? breakInfo.classList.remove('hidden') : breakInfo.classList.add('hidden'); }
            
            // Section Logic
            if (isBreak) {
                if (sectionContainer) sectionContainer.classList.add('hidden');
                if (sectionSel) sectionSel.required = false;
            } else {
                const courseId = sel.value;
                const course = routineCoursesList.find(c => c.id === courseId);
                if (course && course.sections_name) {
                    try {
                        const sections = JSON.parse(course.sections_name);
                        if (Array.isArray(sections) && sections.length > 1) {
                            if (sectionContainer) sectionContainer.classList.remove('hidden');
                            if (sectionSel) {
                                sectionSel.required = true;
                                let opts = '<option value="" disabled selected hidden>Select section</option>';
                                sections.forEach(sec => opts += `<option value="${sec}">Section ${sec}</option>`);
                                const currVal = sectionSel.value;
                                sectionSel.innerHTML = opts;
                                if (sections.includes(currVal)) sectionSel.value = currVal;
                            }
                        } else {
                            if (sectionContainer) sectionContainer.classList.add('hidden');
                            if (sectionSel) sectionSel.required = false;
                        }
                    } catch(e) {
                        if (sectionContainer) sectionContainer.classList.add('hidden');
                        if (sectionSel) sectionSel.required = false;
                    }
                } else {
                    if (sectionContainer) sectionContainer.classList.add('hidden');
                    if (sectionSel) sectionSel.required = false;
                }
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // Format time: "08:30:00" → "08:30 AM"
        function formatRoutineTime(timeStr) {
            if (!timeStr) return '--';
            try {
                const [h, m] = timeStr.split(':').map(Number);
                const period = h >= 12 ? 'PM' : 'AM';
                const hh = h % 12 || 12;
                return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
            } catch (e) { return timeStr; }
        }

        // Fetch all routine dependencies in parallel
        export async function fetchRoutineDependencies(parentSignal) {
            try {
                const batches = await fetchCachedOrDeduplicated('batches', async () => {
                    const { data, error } = await _supabase.from('batches').select('*').order('created_at', { ascending: false }).abortSignal(parentSignal);
                    if (error) throw error;
                    return data || [];
                });
                
                const courses = await CourseStore.getCourses();
                
                const faculty = await FacultyStore.getFaculty();

                let finalBatches = batches;
                if (window.currentUserRole === 'cr' && !window.isAdminEmail(window.currentUserEmail) && window.currentUserCRBatches) {
                    finalBatches = batches.filter(b => window.currentUserCRBatches.includes(b.id));
                }

                routineBatchesList = finalBatches;
                routineCoursesList = courses;
                routineFacultyList = faculty;
            } catch (err) {
                console.error('[ROUTINE DEPS ERROR]', err);
            }
        }

        // Main loader: fetch weekly_routines with relational joins
        export async function loadWeeklyRoutine() {
            if (window.isModuleLoading('routine')) {
                console.log("[ROUTINE] Load already in progress, ignoring duplicate call.");
                return;
            }
            window.setModuleLoading('routine', true);
            cancelActiveRequest('routine');
            const localController = new AbortController();
            window.activeLoadControllers['routine'] = localController;

            window.showLoader(true, 'Loading routine...');
            console.log("[ROUTINE] Loading weekly routine list...");
            try {
                let routineList;

                if (crPermissionService.isCR()) {
                    routineList = await crPermissionService.getVisibleRoutines();
                } else {
                    routineList = await fetchCachedOrDeduplicated('weekly_routines', async () => {
                        return await fetchWithRetry(async (signal) => {
                            const { data, error } = await _supabase
                                .from('weekly_routines')
                                .select(`
                                        id,
                                        batch_id,
                                        day_name,
                                        start_time,
                                        section_name,
                                        room_number,
                                        course_id,
                                        faculty_id,
                                        courses ( id, course_name, short_name, sections_name ),
                                        faculty ( id, faculty_name, teacher_initial ),
                                        batches ( id, batch_name )
                                    `)
                                .order('start_time', { ascending: true })
                                .abortSignal(signal);

                            if (error) {
                                console.error("[ROUTINE] Fetch error:", error);
                                throw error;
                            }
                            return data || [];
                        }, 2, 1000, 8000, localController.signal);
                    });
                }

                if (localController.signal.aborted) {
                    console.log("[ROUTINE] Fetch aborted, ignoring state updates.");
                    return;
                }

                routineData = (routineList || []).filter(r => r.room_number !== 'Break');
                console.log(`[ROUTINE] Successfully loaded ${routineData.length} records.`);

                // batchLabel update moved to renderWeeklyTimetable / renderDailyRoutineView

                // Show admin Add button
                const adminAddBtn = document.getElementById('wr-admin-add-btn');
                const batchFilter = document.getElementById('admin-routine-batch-filter');
                if (adminAddBtn) {
                    if ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr')) {
                        adminAddBtn.classList.remove('hidden');
                        if (batchFilter) {
                            const isStrictAdmin = (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail));
                            if (isStrictAdmin) {
                                batchFilter.classList.remove('hidden');
                                console.log("[BATCH FILTER LOAD] Populating routine batch filter");
                                if (batchFilter.options.length <= 1) {
                                    try {
                                        const { data: batchesData } = await _supabase.from('batches').select('id, batch_name').order('batch_name');
                                        let optionsHTML = '<option value="" disabled selected class="text-black">Select Batch</option>';
                                        if (batchesData) {
                                            optionsHTML += batchesData.map(b => `<option value="${b.id}" class="text-black">${b.batch_name}</option>`).join('');
                                        }
                                        batchFilter.innerHTML = optionsHTML;
                                    } catch(e) { console.warn("Failed to load batches", e); }
                                }
                            } else {
                                batchFilter.classList.add('hidden');
                            }
                        }
                    } else {
                        adminAddBtn.classList.add('hidden');
                        if (batchFilter) batchFilter.classList.add('hidden');
                    }
                }

                if (currentRoutineView === 'weekly') {
                    renderWeeklyTimetable();
                } else {
                    renderDailyRoutineView();
                }

                // Also refresh dashboard today section silently
                loadDashboardTodayRoutine();

            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log("[ROUTINE] Abort detected, resetting to welcome screen to prevent deadlock.");
                    if (typeof window.forceHideLoader === 'function') window.forceHideLoader();
                    if (window.isScreenActive('screen-weekly-routine') && typeof window.navigate === 'function') {
                        /* window.navigate('screen-welcome'); (removed AbortError redirect) */
                    }
                    return;
                }
                console.error('[LOAD ROUTINE ERROR]', err);
                window.showGlobalToast('Error', 'Could not load routine data.');
            } finally {
                window.setModuleLoading('routine', false);
                if (window.activeLoadControllers['routine'] === localController) {
                    window.activeLoadControllers['routine'] = null;
                }
                window.showLoader(false);
            }
        }

        // Switch between weekly/daily view tabs
        function switchRoutineView(mode) {
            currentRoutineView = mode;

            const weeklyView = document.getElementById('routine-weekly-view');
            const dailyView = document.getElementById('routine-daily-view');
            const btnWeekly = document.getElementById('btn-view-weekly');
            const btnDaily = document.getElementById('btn-view-daily');
            const tabLabel = document.getElementById('daily-tab-label');

            // Update tab label to reflect Today / Tomorrow
            if (tabLabel) {
                const { isToday } = getSmartDashboardDay();
                tabLabel.textContent = isToday ? 'Today' : 'Tomorrow';
            }

            if (mode === 'weekly') {
                weeklyView.classList.remove('hidden');
                dailyView.classList.add('hidden');
                if (btnWeekly) { btnWeekly.classList.add('bg-white', 'text-slate-900'); btnWeekly.classList.remove('text-white/70'); }
                if (btnDaily) { btnDaily.classList.remove('bg-white', 'text-slate-900'); btnDaily.classList.add('text-white/70'); }
                renderWeeklyTimetable();
            } else {
                weeklyView.classList.add('hidden');
                dailyView.classList.remove('hidden');
                if (btnDaily) { btnDaily.classList.add('bg-white', 'text-slate-900'); btnDaily.classList.remove('text-white/70'); }
                if (btnWeekly) { btnWeekly.classList.remove('bg-white', 'text-slate-900'); btnWeekly.classList.add('text-white/70'); }
                renderDailyRoutineView();
            }
        }

        window.filterRoutinesByBatch = function() {
            if (currentRoutineView === 'weekly') {
                renderWeeklyTimetable();
            } else {
                renderDailyRoutineView();
            }
        };

        // ---- RENDER WEEKLY TIMETABLE ----
        function renderWeeklyTimetable() {
            const container = document.getElementById('weekly-timetable-container');
            if (!container) return;

            const batchFilterEl = document.getElementById('admin-routine-batch-filter');
            const batchVal = (batchFilterEl && !batchFilterEl.classList.contains('hidden')) ? batchFilterEl.value : 'all';

            if (batchFilterEl && !batchFilterEl.classList.contains('hidden')) {
                if (!batchVal || batchVal === '') {
                    console.log("[BATCH FILTER SELECT] Routine batch changed to: undefined");
                    console.log("[ROUTINE BATCH] No batch selected. Showing empty state.");
                    const title = document.getElementById('wr-header-title');
                    if (title) title.textContent = "Weekly Routine";
                    const batchLabel = document.getElementById('wr-batch-label');
                    if (batchLabel) batchLabel.textContent = "Select a batch";
                    
                    container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-16 px-4 text-center mt-4 bg-white rounded-3xl border border-slate-100 shadow-sm">
                            <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                <i data-lucide="layers" class="w-8 h-8 text-slate-400"></i>
                            </div>
                            <h3 class="text-lg font-bold text-slate-700">Please select a batch</h3>
                            <p class="text-sm text-slate-500 mt-1 max-w-[250px]">Select a batch from the dropdown above to view its routine.</p>
                        </div>
                    `;
                    if (window.lucide) window.lucide.createIcons();
                    return;
                }
                const opt = batchFilterEl.options[batchFilterEl.selectedIndex];
                const title = document.getElementById('wr-header-title');
                if (title && opt) title.textContent = "Weekly Routine " + opt.text.replace('Batch ', '');
                console.log(`[BATCH FILTER SELECT] Routine batch changed to: ${batchVal}`);
                console.log(`[ROUTINE BATCH] Rendering routines for batch: ${batchVal}`);
            } else {
                const title = document.getElementById('wr-header-title');
                if (title) title.textContent = "Weekly Routine";
            }

            if (routineData.length === 0) {
                container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-16 text-center text-slate-400 px-8">
                            <div class="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                                <i data-lucide="calendar-x" class="w-8 h-8 text-indigo-300"></i>
                            </div>
                            <p class="text-sm font-bold text-slate-500">No routine created yet.</p>
                            <p class="text-[11px] text-slate-400 mt-1">${(window.currentUserRole === 'admin' || window.currentUserRole === 'cr') ? 'Tap + to add classes to the routine.' : 'Check back when admin creates the routine.'}</p>
                        </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            // PART 11: Filter by student's enrolled courses (admins see all)
            let filteredRoutineData = routineData;
            if (!crPermissionService.isAdmin() && !crPermissionService.isCR()) {
                const enrolledCourses = window.currentUserCoursesList || [];
                const myCourseIds = enrolledCourses.map(uc => uc.course_id);
                
                const profileBatchId = window.authState?.profile?.batch_id;

                filteredRoutineData = routineData.filter(r => {
                    if (!r.course_id || r.room_number === 'Break') {
                        return String(r.batch_id) === String(profileBatchId);
                    }
                    if (!myCourseIds.includes(r.course_id)) return false;

                    const enrolledRecord = enrolledCourses.find(uc => uc.course_id === r.course_id);
                    if (r.section_name) {
                         if (!enrolledRecord || !enrolledRecord.section_name) return true;
                         const userSecs = window.parseSectionsName(enrolledRecord.section_name).map(s => s.toLowerCase());
                         const classSections = window.parseSectionsName(r.section_name).map(s => s.toLowerCase());
                         if (classSections.length > 0 && !userSecs.some(us => classSections.includes(us))) return false;
                     }
                    return true;
                });
            } else if (batchVal !== 'all') {
                filteredRoutineData = routineData.filter(r => r.batch_id === batchVal);
            }

            // Update batch label based on filtered data
            const batchLabel = document.getElementById('wr-batch-label');
            if (batchLabel) {
                if (window.currentUserRole === 'student') {
                    batchLabel.textContent = window.authState?.profile?.batches?.batch_name || 'Current Batch';
                } else {
                    const firstBatch = filteredRoutineData.find(r => r.batches)?.batches;
                    batchLabel.textContent = firstBatch?.batch_name || window.authState?.profile?.batches?.batch_name || 'Current Batch';
                }
            }

            // Build lookup map: day -> start_time -> array of entries
            const lookup = {};
            filteredRoutineData.forEach(r => {
                if (!lookup[r.day_name]) lookup[r.day_name] = {};
                const key = `${r.start_time}`;
                if (!lookup[r.day_name][key]) lookup[r.day_name][key] = [];
                lookup[r.day_name][key].push(r);
            });

            // Only show days that actually have data (dynamic columns)
            const daysWithData = ROUTINE_DAYS.filter(d => filteredRoutineData.some(r => r.day_name === d));
            const renderDays = daysWithData.length > 0 ? daysWithData : ROUTINE_DAYS;

            // Today highlight
            const todayName = getTodayRoutineDayName();

            // Day color palette — all 7 days
            const dayColors = {
                'Saturday': { header: 'bg-violet-500', badge: 'bg-violet-100 text-violet-800', today: 'bg-violet-50/50' },
                'Sunday': { header: 'bg-pink-500', badge: 'bg-pink-100 text-pink-800', today: 'bg-pink-50/50' },
                'Monday': { header: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-800', today: 'bg-indigo-50/50' },
                'Tuesday': { header: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800', today: 'bg-blue-50/50' },
                'Wednesday': { header: 'bg-sky-500', badge: 'bg-sky-100 text-sky-800', today: 'bg-sky-50/50' },
                'Thursday': { header: 'bg-teal-500', badge: 'bg-teal-100 text-teal-800', today: 'bg-teal-50/50' },
                'Friday': { header: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800', today: 'bg-emerald-50/50' },
            };

            // Dynamic cell width based on number of columns
            const cellW = renderDays.length <= 3 ? 'min-width:90px;' : renderDays.length <= 5 ? 'min-width:72px;' : 'min-width:60px;';

            let html = `
                    <div class="overflow-x-auto pb-2">
                    <div class="flex justify-center">
                    <table class="border-collapse" style="width:auto;">
                        <thead>
                            <tr>
                                <th class="bg-slate-100 border border-slate-200 p-2 text-[9px] font-black text-slate-500 text-center sticky left-0 z-10" style="min-width:56px;">
                                    <div class="text-slate-600 font-black text-[8px] uppercase leading-tight">Time</div>
                                </th>`;

            renderDays.forEach(day => {
                const isToday = day === todayName;
                const colors = dayColors[day] || { header: 'bg-slate-500', badge: 'bg-slate-100 text-slate-700', today: 'bg-slate-50' };
                html += `
                                <th class="border border-slate-200 p-0 ${isToday ? 'ring-2 ring-inset ring-[#4226E9]' : ''}" style="${cellW}">
                                    <div class="${colors.header} ${isToday ? 'opacity-100' : 'opacity-80'} py-2 px-2 text-center">
                                        <span class="text-white font-black text-[10px] uppercase tracking-wide">${day.substring(0, 3)}</span>
                                        ${isToday ? '<div class="w-1.5 h-1.5 bg-white rounded-full mx-auto mt-0.5 animate-pulse"></div>' : ''}
                                    </div>
                                </th>`;
            });

            html += `</tr></thead><tbody>`;

            // Collect unique time slots sorted by time
            const allSlots = [];
            const seenSlots = new Set();
            [...filteredRoutineData].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')).forEach(r => {
                const k = `${r.start_time}`;
                if (!seenSlots.has(k)) { seenSlots.add(k); allSlots.push({ start_time: r.start_time }); }
            });
            allSlots.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

            allSlots.forEach(slot => {
                const slotKey = `${slot.start_time}`;
                const timeDisplay = formatRoutineTime(slot.start_time);

                html += `<tr>
                        <td class="border border-slate-200 bg-amber-50 p-1.5 text-center align-middle sticky left-0 z-10" style="min-width:56px;">
                            <div class="text-[11px] font-black text-amber-700 leading-tight">${timeDisplay.split(' ')[0]}</div>
                            <div class="text-[8px] font-bold text-amber-500 uppercase">${timeDisplay.split(' ')[1] || ''}</div>
                        </td>`;

                renderDays.forEach(day => {
                    const entries = lookup[day]?.[slotKey] || [];
                    const isToday = day === todayName;
                    const colors = dayColors[day] || { header: 'bg-slate-500', badge: 'bg-slate-100 text-slate-700', today: 'bg-slate-50' };

                    if (entries.length > 0) {
                        html += `<td class="border ${isToday ? 'border-[#4226E9]/30' : 'border-slate-200'} p-1 align-top ${isToday ? colors.today : 'bg-white'}" style="${cellW}">`;
                        
                        entries.forEach((entry, idx) => {
                            const isBreakEntry = !entry.course_id && (entry.room_number === 'Break');
                            if (idx > 0) html += `<div class="w-full border-t border-slate-100 my-1"></div>`;
                            
                            const isAdmin = (window.currentUserRole === 'admin' || window.currentUserRole === 'cr');
                            if (isBreakEntry) {
                                html += `
                                    <div class="flex flex-col items-center gap-0.5 ${isAdmin ? 'cursor-pointer' : ''}" ${isAdmin ? `onclick="openRoutineDetails('${entry.id}')"` : ''}>
                                        <span class="text-[13px]">☕</span>
                                        <span class="text-[8px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-md w-full text-center">Break</span>
                                    </div>`;
                            } else {
                                const shortName = window.sanitizeHTML(entry.courses?.short_name || entry.courses?.course_name?.split(' ').map(w => w[0]).join('').substring(0, 3) || '???');
                                const initial = window.sanitizeHTML(entry.faculty?.teacher_initial || '??');
                                const room = window.sanitizeHTML(entry.room_number || '???');
                                const section = window.sanitizeHTML(entry.section_name || '');
                                const sectionHtml = section ? `<span class="text-[8px] font-bold text-slate-600 bg-slate-100 px-1.5 rounded-full mb-0.5 border border-slate-200">Sec: ${section}</span>` : '';
                                
                                let batchTagHtml = '';
                                if (window.currentUserRole === 'student' && entry.batch_id && String(entry.batch_id) !== String(window.authState?.profile?.batch_id)) {
                                    const bName = entry.batches?.batch_name ? window.sanitizeHTML(entry.batches.batch_name) : 'Other';
                                    batchTagHtml = `<span class="text-[7px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 mb-0.5 w-full text-center leading-none tracking-wide">${bName} Batch</span>`;
                                }

                                html += `
                                    <div class="flex flex-col gap-0.5 items-center py-0.5 ${isAdmin ? 'cursor-pointer active:scale-95 transition-transform' : ''}" ${isAdmin ? `onclick="openRoutineDetails('${entry.id}')"` : ''}>
                                        ${batchTagHtml}
                                        <span class="text-[10px] font-black text-slate-900 px-1.5 py-0.5 rounded-md ${colors.badge} leading-tight text-center w-full mb-0.5">${shortName}</span>
                                        ${sectionHtml}
                                        <span class="text-[9px] font-bold text-slate-500 px-1.5 py-0.5 rounded bg-white/80 w-full text-center leading-none">${initial}</span>
                                        <span class="text-[8px] font-medium text-slate-400 leading-none">${room}</span>
                                    </div>`;
                            }
                        });
                        html += `</td>`;
                    } else {
                        const isAdmin = (window.currentUserRole === 'admin' || window.currentUserRole === 'cr');
                        html += `<td class="border ${isToday ? 'border-[#4226E9]/20' : 'border-slate-200'} p-1 ${isToday ? colors.today : 'bg-white'}" style="${cellW}">
                                <div class="flex items-center justify-center h-full min-h-[52px] ${isAdmin ? 'cursor-pointer hover:bg-slate-50 transition' : ''}" ${isAdmin ? `onclick="openAddRoutine('${day}', '${slot.start_time}')" title="Add routine for ${day} at ${timeDisplay.split(' ')[0]}"` : ''}>
                                    <span class="text-slate-200 text-[16px]">${isAdmin ? '+' : '-'}</span>
                                </div>
                            </td>`;
                    }
                });

                html += `</tr>`;
            });

            html += `</tbody></table></div></div>
                <div class="px-4 mt-3 pb-2">
                    <div class="flex flex-wrap gap-1.5 justify-center">`;
            renderDays.forEach(day => {
                const colors = dayColors[day] || {};
                const isToday = day === getTodayRoutineDayName();
                const isTomorrow = day === getTomorrowRoutineDayName();
                html += `<span class="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-white border border-slate-100 px-2 py-1 rounded-full shadow-xs">
                        <span class="w-2 h-2 rounded-full ${colors.header || 'bg-slate-400'} inline-block"></span>
                        ${day}${isToday ? ' 📍' : isTomorrow ? ' ⏳' : ''}
                    </span>`;
            });
            html += `</div></div>`;

            container.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // ---- RENDER DAILY VIEW (always fetches fresh from Supabase) ----
        export async function renderDailyRoutineView() {
            const container = document.getElementById('daily-routine-container');
            const dayLabelEl = document.getElementById('daily-view-day-label');
            const dateLabelEl = document.getElementById('daily-view-date-label');
            if (!container) return;

            const batchFilterEl = document.getElementById('admin-routine-batch-filter');
            const batchVal = (batchFilterEl && !batchFilterEl.classList.contains('hidden')) ? batchFilterEl.value : 'all';

            if (batchFilterEl && !batchFilterEl.classList.contains('hidden')) {
                if (!batchVal || batchVal === '') {
                    console.log("[BATCH FILTER SELECT] Routine batch changed to: undefined");
                    console.log("[ROUTINE BATCH] No batch selected. Showing empty state.");
                    const title = document.getElementById('wr-header-title');
                    if (title) title.textContent = "Weekly Routine";
                    const batchLabel = document.getElementById('wr-batch-label');
                    if (batchLabel) batchLabel.textContent = "Select a batch";

                    container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-[20px] border border-slate-100 shadow-sm mt-4">
                            <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                <i data-lucide="layers" class="w-8 h-8 text-slate-400"></i>
                            </div>
                            <h3 class="text-lg font-bold text-slate-700">Please select a batch</h3>
                            <p class="text-sm text-slate-500 mt-1 max-w-[250px]">Select a batch from the dropdown above to view its routine.</p>
                        </div>
                    `;
                    if (window.lucide) window.lucide.createIcons();
                    return;
                }
                const opt = batchFilterEl.options[batchFilterEl.selectedIndex];
                const title = document.getElementById('wr-header-title');
                if (title && opt) title.textContent = "Weekly Routine " + opt.text.replace('Batch ', '');
            } else {
                const title = document.getElementById('wr-header-title');
                if (title) title.textContent = "Weekly Routine";
            }

            // Use smart logic: after 6 PM show tomorrow
            const { dayName: targetDay, isToday: showingToday } = getSmartDashboardDay();
            const now = new Date();
            const isAdmin = (window.currentUserRole === 'admin' || window.currentUserRole === 'cr');

            // Date label — show tomorrow's date if after 6 PM
            let displayDate = new Date(now);
            if (!showingToday) displayDate.setDate(displayDate.getDate() + 1);
            const dateStr = displayDate.toLocaleDateString('en-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            if (dayLabelEl) dayLabelEl.textContent = showingToday ? `Today \u2014 ${targetDay}` : `Tomorrow \u2014 ${targetDay}`;
            if (dateLabelEl) dateLabelEl.textContent = dateStr;

            if (!targetDay) {
                container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400 bg-white rounded-[20px] border border-slate-100 shadow-sm">
                            <div class="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
                                <i data-lucide="moon" class="w-7 h-7 text-slate-300"></i>
                            </div>
                            <p class="text-sm font-bold text-slate-500">No classes ${showingToday ? 'today' : 'tomorrow'}.</p>
                            <p class="text-[11px] text-slate-400 mt-1">Enjoy your ${showingToday ? 'day' : 'evening'} off! \ud83c\udf89</p>
                        </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            // Show spinner immediately
            container.innerHTML = `<div class="flex flex-col items-center justify-center py-12">
                    <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p class="text-xs font-semibold text-slate-400">Loading ${showingToday ? 'today' : 'tomorrow'}'s classes...</p>
                </div>`;

            // Always fetch fresh from Supabase — most reliable approach
            let todayClasses = [];
            try {
                const { data, error } = await _supabase
                    .from('weekly_routines')
                    .select(`
                            id, batch_id, day_name, start_time, section_name, room_number, course_id, faculty_id,
                            courses ( id, course_name, short_name ),
                            faculty ( id, faculty_name, teacher_initial ),
                            batches ( id, batch_name )
                        `)
                    .eq('day_name', targetDay)
                    .order('start_time', { ascending: true });

                if (error) throw error;

                todayClasses = (data || []).filter(r => r.room_number !== 'Break').sort((a, b) => {
                    return (a.start_time || '').localeCompare(b.start_time || '');
                });

                // PART 11: Filter by enrolled courses for students
                const enrolledCourses = window.currentUserCoursesList || [];
                if (window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') {
                    const myCourseIds = enrolledCourses.map(uc => uc.course_id);
                    const profileBatchId = window.authState?.profile?.batch_id;
                    todayClasses = todayClasses.filter(r => {
                        if (!r.course_id || r.room_number === 'Break') {
                            return String(r.batch_id) === String(profileBatchId);
                        }
                        if (!myCourseIds.includes(r.course_id)) return false;
                        
                        const enrolledRecord = enrolledCourses.find(uc => uc.course_id === r.course_id);
                        if (r.section_name) {
                            if (!enrolledRecord || !enrolledRecord.section_name) return true;
                            const userSecs = window.parseSectionsName(enrolledRecord.section_name).map(s => s.toLowerCase());
                            const classSections = window.parseSectionsName(r.section_name).map(s => s.toLowerCase());
                            if (classSections.length > 0 && !userSecs.some(us => classSections.includes(us))) return false;
                        }
                        return true;
                    });
                } else if (window.currentUserRole === 'cr' && !window.isAdminEmail(window.currentUserEmail)) {
                    const allowedCourseIds = window.currentCoursesList.map(c => c.id);
                    const crBatches = window.currentAssignedBatches || [];
                    todayClasses = todayClasses.filter(r => {
                        if (!r.course_id || r.room_number === 'Break') {
                            return crBatches.includes(r.batch_id);
                        }
                        return allowedCourseIds.includes(r.course_id);
                    });
                } else if (batchVal !== 'all') {
                    todayClasses = todayClasses.filter(r => r.batch_id === batchVal);
                }
            } catch (err) {
                container.innerHTML = `<div class="flex flex-col items-center justify-center py-10 text-center text-slate-400 bg-white rounded-[20px] border border-slate-100 shadow-sm">
                        <i data-lucide="wifi-off" class="w-8 h-8 text-slate-200 mb-2"></i>
                        <p class="text-xs font-bold text-slate-400">Could not load routine.</p>
                        <button onclick="renderDailyRoutineView()" class="mt-3 text-[11px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full">Retry</button>
                    </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                console.error('[DAILY VIEW FETCH ERROR]', err);
                return;
            }

            if (todayClasses.length === 0) {
                const dayLabel2 = showingToday ? targetDay : `tomorrow (${targetDay})`;
                container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400 bg-white rounded-[20px] border border-slate-100 shadow-sm">
                            <div class="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-3">
                                <i data-lucide="calendar-x" class="w-7 h-7 text-indigo-200"></i>
                            </div>
                            <p class="text-sm font-bold text-slate-500">No classes for ${dayLabel2}.</p>
                            <p class="text-[11px] text-slate-400 mt-1">The routine has not been set for ${showingToday ? 'today' : 'tomorrow'}.</p>
                        </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            // When showing tomorrow: use nowMins=-1 so all classes are Upcoming
            const nowMins = showingToday ? (now.getHours() * 60 + now.getMinutes()) : -1;
            const statusColors = ['bg-violet-500', 'bg-indigo-500', 'bg-sky-500', 'bg-teal-500', 'bg-emerald-500', 'bg-amber-500'];

            function getEndTime(startTimeStr, durationHrs) {
                if (!startTimeStr) return '00:00';
                const [hh, mm] = startTimeStr.split(':').map(Number);
                const totalMins = hh * 60 + mm + durationHrs * 60;
                const endHH = Math.floor(totalMins / 60) % 24;
                const endMM = Math.round(totalMins % 60);
                return `${String(endHH).padStart(2, '0')}:${String(endMM).padStart(2, '0')}`;
            }

            container.innerHTML = todayClasses.map((cls, idx) => {
                const timeDisplay = formatRoutineTime(cls.start_time);
                const endTimeStr = getEndTime(cls.start_time, 1.5);
                const endTimeDisplay = formatRoutineTime(endTimeStr);
                const [hh, mm] = (cls.start_time || '00:00').split(':').map(Number);
                const classMins = hh * 60 + mm;

                // Break slot detection
                const isBreakSlot = !cls.course_id || cls.room_number === 'Break';
                if (isBreakSlot) {
                    return `
                        <div class="flex gap-2 items-start relative min-w-0">
                            <div class="flex-1 min-w-0 bg-amber-50 p-3.5 rounded-[22px] border border-amber-100 shadow-sm flex items-center justify-between gap-2">
                                <div class="flex items-center gap-3 min-w-0 flex-1">
                                    <div class="text-center border-r border-amber-100 pr-3 shrink-0 min-w-[65px] flex flex-col items-center justify-center">
                                        <p class="text-[10px] font-black text-amber-600 leading-none whitespace-nowrap">${timeDisplay}</p>
                                        <p class="text-[9px] font-bold text-amber-200/60 my-0.5 leading-none">|</p>
                                        <p class="text-[10px] font-black text-amber-600 leading-none whitespace-nowrap">${endTimeDisplay}</p>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <h4 class="font-extrabold text-xs text-amber-800 leading-snug">\u2615 Break Time</h4>
                                        <p class="text-[10px] text-amber-500 font-semibold mt-0.5">Take a break!</p>
                                    </div>
                                </div>
                                <span class="bg-amber-100 text-amber-600 text-[8px] font-black px-2.5 py-1 rounded-full uppercase shrink-0">Break</span>
                            </div>
                        </div>`;
                }

                const isOngoing = showingToday && classMins <= nowMins && nowMins < classMins + 90;
                const isUpcoming = !showingToday || classMins > nowMins;
                const isPast = showingToday && classMins + 90 <= nowMins;

                const courseName = window.sanitizeHTML(cls.courses?.course_name || 'Unknown Course');
                const teacherName = window.sanitizeHTML(cls.faculty?.faculty_name || 'Unknown Teacher');
                const room = window.sanitizeHTML(cls.room_number || 'N/A');
                const shortName = window.sanitizeHTML(cls.courses?.short_name || courseName.split(' ').map(w => w[0]).join('').substring(0, 3));
                const initial = window.sanitizeHTML(cls.faculty?.teacher_initial || '??');
                const dotColor = statusColors[idx % statusColors.length];

                const statusBadge = isOngoing
                    ? `<span class="bg-[#F3E8FF] text-[#8B5CF6] text-[8px] font-black px-2.5 py-1 rounded-full uppercase animate-pulse">Ongoing</span>`
                    : isUpcoming
                        ? `<span class="bg-blue-50 text-blue-600 text-[8px] font-black px-2.5 py-1 rounded-full uppercase">Upcoming</span>`
                        : `<span class="bg-slate-100 text-slate-500 text-[8px] font-black px-2.5 py-1 rounded-full uppercase">Done</span>`;

                return `
                        <div class="flex gap-2 items-start relative min-w-0 group ${isAdmin ? 'cursor-pointer' : ''}" ${isAdmin ? `onclick="openRoutineDetails('${cls.id}')"` : ''}>
                            <div class="flex-1 min-w-0 bg-white p-3.5 rounded-[22px] border border-slate-100 shadow-sm flex items-center justify-between gap-2 hover:border-[#4226E9]/20 hover:shadow-md transition-all ${isPast ? 'opacity-60' : ''}">
                                <div class="flex items-center gap-3 min-w-0 flex-1">
                                    <div class="text-center border-r border-slate-100 pr-3 shrink-0 min-w-[65px] flex flex-col items-center justify-center">
                                        <p class="text-[10px] font-black text-[#4226E9] leading-none whitespace-nowrap">${timeDisplay}</p>
                                        <p class="text-[9px] font-bold text-slate-200 my-0.5 leading-none">|</p>
                                        <p class="text-[10px] font-black text-[#4226E9] leading-none whitespace-nowrap">${endTimeDisplay}</p>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-center flex-wrap gap-1.5 mb-0.5">
                                            ${(window.currentUserRole === 'student' && cls.batch_id && String(cls.batch_id) !== String(window.authState?.profile?.batch_id)) ? `<span class="text-[8px] font-black bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded border border-rose-200 whitespace-nowrap">${cls.batches?.batch_name ? window.sanitizeHTML(cls.batches.batch_name) : 'Other'} Batch</span>` : ''}
                                            <span class="text-[9px] font-black bg-indigo-50 text-[#4226E9] px-1.5 py-0.5 rounded">${shortName}</span>
                                            ${cls.section_name ? `<span class="text-[9px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">Sec: ${window.sanitizeHTML(cls.section_name)}</span>` : ''}
                                            <span class="text-[9px] text-slate-400">\u2022</span>
                                            <span class="text-[9px] text-slate-400 font-bold">${initial}</span>
                                        </div>
                                        <h4 class="font-extrabold text-xs text-slate-900 leading-snug truncate">${courseName}</h4>
                                        <p class="text-[10px] text-slate-500 font-semibold mt-0.5 truncate">Room ${room} \u2014 ${teacherName}</p>
                                    </div>
                                </div>
                                ${statusBadge}
                            </div>
                        </div>`;
            }).join('');

            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // ---- OPEN ADD ROUTINE FORM ----
        export async function openAddRoutine(prefillDay = null, prefillTime = null) {
            const role = String(window.currentUserRole || '').toLowerCase();
            if (role !== 'admin' && role !== 'cr') return;
            
            // Prevent event objects from being used as prefill values
            if (prefillDay && typeof prefillDay !== 'string') prefillDay = null;
            if (prefillTime && typeof prefillTime !== 'string') prefillTime = null;
            window.showLoader(true, 'Preparing form...');
            try {
                await fetchRoutineDependencies();

                // Populate batches
                const batchSel = document.getElementById('add-routine-batch');
                if (batchSel) {
                    batchSel.innerHTML = '<option value="" disabled selected hidden>Select batch</option>' +
                        routineBatchesList.map(s => `<option value="${s.id}">${window.sanitizeHTML(s.batch_name)}</option>`).join('');
                    
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
                        routineFacultyList.map(f => `<option value="${f.id}">${window.sanitizeHTML(f.faculty_name)}${f.teacher_initial ? ' [' + f.teacher_initial + ']' : ''}</option>`).join('');
                }

                // Reset form but keep break-info hidden
                const form = document.getElementById('form-add-routine');
                if (form) form.reset();
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
        }

        // ---- SAVE NEW ROUTINE ----
        let isSavingRoutine = false;
        export async function handleSaveRoutine(e) {
            e.preventDefault();
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            if (window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') return;
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
            }
            if (!isBreak && (!facultyId || !room)) {
                window.showGlobalToast('Validation Error', 'Please fill Faculty and Room for non-break slots.');
                isSavingRoutine = false;
                return;
            }

            if (window.crPermissionService && window.crPermissionService.isCR() && batchId) {
                if (!window.crPermissionService.canAccessBatch(batchId)) {
                    console.log(`[CR PERMISSION DENIED] Attempted to create routine for unassigned batch ${batchId}`);
                    window.showGlobalToast("Access Denied", "You can only manage routines for your assigned batches.");
                    isSavingRoutine = false;
                    return;
                }
                console.log(`[CR ACCESS CHECK] Validating routine create - PASSED`);
                console.log(`[CR CREATE] Routine`);
            }

            window.showLoader(true, 'Adding class to routine...');
            try {
                const insertPayload = {
                    batch_id: batchId,
                    day_name: day,
                    start_time: time,
                    section_name: section,
                    course_id: isBreak ? null : courseId,
                    faculty_id: facultyId,
                    room_number: isBreak ? 'Break' : room
                };
                // Store break marker in room_number if break
                const { error } = await _supabase.from('weekly_routines').insert([insertPayload]);

                if (error) throw error;

                window.showGlobalToast('Success', isBreak ? 'Break time added to routine!' : 'Class added to routine successfully!');
                window.navigate('screen-weekly-routine');
                await RoutineStore.refresh();
                await loadWeeklyRoutine();
            } catch (err) {
                console.error('[SAVE ROUTINE ERROR]', err);
                window.showGlobalToast('Error', err.message || 'Failed to add routine.');
            } finally {
                isSavingRoutine = false;
                window.showLoader(false);
            }
        }

        // ---- OPEN ROUTINE DETAILS/EDIT ----
        export async function openRoutineDetails(routineId) {
            window.showLoader(true, 'Loading details...');
            try {
                await fetchRoutineDependencies();

                // Find from cached data or fetch
                let entry = routineData.find(r => r.id === routineId);
                if (!entry) {
                    const { data, error } = await _supabase.from('weekly_routines').select('*').eq('id', routineId).single();
                    if (error) throw error;
                    entry = data;
                }

                selectedRoutineId = routineId;

                // Populate preview card
                const shortName = entry.courses?.short_name || routineCoursesList.find(c => c.id === entry.course_id)?.short_name || '??';
                const courseName = entry.courses?.course_name || routineCoursesList.find(c => c.id === entry.course_id)?.course_name || 'Course';
                document.getElementById('rd-course-badge').textContent = shortName;
                document.getElementById('rd-course-full-name').textContent = courseName;
                document.getElementById('rd-day-time').textContent = `${entry.day_name} • ${formatRoutineTime(entry.start_time)}`;

                // Populate batch dropdown
                const batchSel = document.getElementById('edit-routine-batch');
                if (batchSel) {
                    batchSel.innerHTML = routineBatchesList.map(s => `<option value="${s.id}" ${s.id === entry.batch_id ? 'selected' : ''}>${window.sanitizeHTML(s.batch_name)}</option>`).join('');
                    batchSel.value = entry.batch_id || '';
                    
                    if (routineBatchesList.length === 1) {
                        batchSel.parentElement.parentElement.classList.add('hidden');
                    } else {
                        batchSel.parentElement.parentElement.classList.remove('hidden');
                    }
                }

                // Populate day
                const daySel = document.getElementById('edit-routine-day');
                if (daySel) daySel.value = entry.day_name || 'Saturday';

                // Populate time
                const timeInput = document.getElementById('edit-routine-time');
                if (timeInput) timeInput.value = entry.start_time ? entry.start_time.substring(0, 5) : '';

                // Populate section
                const sectionContainer = document.getElementById('edit-routine-section-container');
                const sectionSel = document.getElementById('edit-routine-section');
                if (entry.course_id) {
                    const course = routineCoursesList.find(c => c.id === entry.course_id);
                    if (course && course.sections_name) {
                        try {
                            const sections = JSON.parse(course.sections_name);
                            if (Array.isArray(sections) && sections.length > 1) {
                                if (sectionContainer) sectionContainer.classList.remove('hidden');
                                if (sectionSel) {
                                    let opts = '<option value="" disabled selected hidden>Select section</option>';
                                    sections.forEach(sec => opts += `<option value="${sec}">Section ${sec}</option>`);
                                    sectionSel.innerHTML = opts;
                                    sectionSel.value = entry.section_name || '';
                                }
                            } else {
                                if (sectionContainer) sectionContainer.classList.add('hidden');
                            }
                        } catch(e) { if (sectionContainer) sectionContainer.classList.add('hidden'); }
                    } else {
                        if (sectionContainer) sectionContainer.classList.add('hidden');
                    }
                } else {
                    if (sectionContainer) sectionContainer.classList.add('hidden');
                }

                // Call batch change manually
                if (batchSel && batchSel.value) {
                    window.onRoutineBatchChange(batchSel, 'edit');
                    const courseSel = document.getElementById('edit-routine-course');
                    if (courseSel) {
                        if (!entry.course_id && entry.room_number === 'Break') {
                            courseSel.value = '__BREAK__';
                        } else {
                            courseSel.value = entry.course_id || '';
                        }
                        onRoutineCourseChange(courseSel, 'edit');
                    }
                }

                // Populate faculty
                const facSel = document.getElementById('edit-routine-faculty');
                if (facSel) {
                    facSel.innerHTML = routineFacultyList.map(f => `<option value="${f.id}" ${f.id === entry.faculty_id ? 'selected' : ''}>${window.sanitizeHTML(f.faculty_name)}${f.teacher_initial ? ' [' + f.teacher_initial + ']' : ''}</option>`).join('');
                    facSel.value = entry.faculty_id || '';
                }

                // Populate room
                const roomInput = document.getElementById('edit-routine-room');
                if (roomInput) roomInput.value = entry.room_number || '';

                // Admin controls visibility
                const adminActions = document.getElementById('routine-edit-admin-actions');
                const subtitle = document.getElementById('rd-subtitle');
                if ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr')) {
                    if (adminActions) adminActions.classList.remove('hidden');
                    if (subtitle) subtitle.textContent = 'Edit or delete this class';
                    // Enable all fields
                    ['edit-routine-batch', 'edit-routine-day', 'edit-routine-time', 'edit-routine-section', 'edit-routine-course', 'edit-routine-faculty', 'edit-routine-room'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.disabled = false;
                    });
                } else {
                    if (adminActions) adminActions.classList.add('hidden');
                    if (subtitle) subtitle.textContent = 'View class information';
                    // Disable all fields for read-only
                    ['edit-routine-batch', 'edit-routine-day', 'edit-routine-time', 'edit-routine-section', 'edit-routine-course', 'edit-routine-faculty', 'edit-routine-room'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.disabled = true;
                    });
                }

                window.navigate('screen-routine-details');
            } catch (err) {
                console.error('[OPEN ROUTINE DETAILS ERROR]', err);
                window.showGlobalToast('Error', 'Could not load routine details.');
            } finally {
                window.showLoader(false);
            }
        }

        // ---- UPDATE ROUTINE ----
        let isUpdatingRoutine = false;
        export async function handleUpdateRoutine(e) {
            e.preventDefault();
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            if ((window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') || !selectedRoutineId) return;
            if (isUpdatingRoutine) return;
            isUpdatingRoutine = true;

            const batchId = document.getElementById('edit-routine-batch')?.value;
            const day = document.getElementById('edit-routine-day')?.value;
            const time = document.getElementById('edit-routine-time')?.value;
            const section = document.getElementById('edit-routine-section')?.value || null;
            const courseId = document.getElementById('edit-routine-course')?.value;
            const facultyId = document.getElementById('edit-routine-faculty')?.value;
            const room = document.getElementById('edit-routine-room')?.value?.trim();

            if (window.crPermissionService && window.crPermissionService.isCR()) {
                const originalRoutine = routineData.find(r => r.id === selectedRoutineId);
                const originalBatchId = originalRoutine?.batch_id;
                
                if (originalBatchId && !window.crPermissionService.canAccessBatch(originalBatchId)) {
                    console.log(`[CR PERMISSION DENIED] Attempted to update routine for unassigned batch`);
                    window.showGlobalToast("Access Denied", "You can only edit routines from your assigned batches.");
                    isUpdatingRoutine = false;
                    return;
                }
                if (batchId && !window.crPermissionService.canAccessBatch(batchId)) {
                    console.log(`[CR PERMISSION DENIED] Attempted to move routine to unassigned batch`);
                    window.showGlobalToast("Access Denied", "You can only assign routines to your assigned batches.");
                    isUpdatingRoutine = false;
                    return;
                }
                console.log(`[CR ACCESS CHECK] Validating routine update - PASSED`);
                console.log(`[CR UPDATE] Routine ${selectedRoutineId}`);
            }

            window.showLoader(true, 'Updating routine...');
            try {
                const { error } = await _supabase.from('weekly_routines').update({
                    batch_id: batchId,
                    day_name: day,
                    start_time: time,
                    section_name: section,
                    course_id: courseId,
                    faculty_id: facultyId,
                    room_number: room
                }).eq('id', selectedRoutineId);

                if (error) throw error;

                window.showGlobalToast('Success', 'Routine updated successfully!');
                window.navigate('screen-weekly-routine');
                await RoutineStore.refresh();
                await loadWeeklyRoutine();
            } catch (err) {
                console.error('[UPDATE ROUTINE ERROR]', err);
                window.showGlobalToast('Error', err.message || 'Failed to update routine.');
            } finally {
                isUpdatingRoutine = false;
                window.showLoader(false);
            }
        }

        // ---- DELETE ROUTINE ----
        let isDeletingRoutine = false;
        export async function handleDeleteRoutine() {
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            if ((window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') || !selectedRoutineId) return;

            if (window.crPermissionService && window.crPermissionService.isCR()) {
                const originalRoutine = routineData.find(r => r.id === selectedRoutineId);
                const originalBatchId = originalRoutine?.batch_id;
                
                if (originalBatchId && !window.crPermissionService.canAccessBatch(originalBatchId)) {
                    console.log(`[CR PERMISSION DENIED] Attempted to delete routine for unassigned batch`);
                    window.showGlobalToast("Access Denied", "You can only delete routines from your assigned batches.");
                    return;
                }
                console.log(`[CR ACCESS CHECK] Validating routine delete - PASSED`);
                console.log(`[CR DELETE] Routine ${selectedRoutineId}`);
            }

            if (!confirm('Delete this class from routine? This action cannot be undone.')) return;
            if (isDeletingRoutine) return;
            isDeletingRoutine = true;

            window.showLoader(true, 'Deleting class...');
            try {
                // Delete content_reactions
                try {
                    await _supabase.from('content_reactions').delete().eq('content_type', 'routine').eq('content_id', selectedRoutineId);
                } catch (e) { console.warn("[ROUTINE DELETE] Reactions cleanup error:", e); }

                const { error } = await _supabase.from('weekly_routines').delete().eq('id', selectedRoutineId);
                if (error) throw error;

                window.showGlobalToast('Deleted', 'Class removed from routine.');
                selectedRoutineId = null;
                window.navigate('screen-weekly-routine');
                await RoutineStore.refresh();
                await loadWeeklyRoutine();
            } catch (err) {
                console.error('[DELETE ROUTINE ERROR]', err);
                window.showGlobalToast('Error', err.message || 'Failed to delete routine.');
            } finally {
                isDeletingRoutine = false;
                window.showLoader(false);
            }
        }

        window.onRoutineBatchChange = function(sel, mode) {
            const batchId = sel.value;
            const prefix = mode === 'add' ? 'add' : 'edit';
            const courseSel = document.getElementById(`${prefix}-routine-course`);
            if (courseSel) {
                const filteredCourses = routineCoursesList.filter(c => c.batch_id === batchId);
                const prevVal = courseSel.value;
                courseSel.innerHTML = '<option value="" disabled selected hidden>Select course</option>' +
                    filteredCourses.map(c => `<option value="${c.id}">${window.sanitizeHTML(c.course_name)}${c.short_name ? ' (' + c.short_name + ')' : ''}</option>`).join('');
                
                // Try to keep selection if still valid
                if (filteredCourses.some(c => c.id === prevVal)) {
                    courseSel.value = prevVal;
                } else {
                    courseSel.value = '';
                }
                onRoutineCourseChange(courseSel, mode);
            }
        };

export const RoutineService = {
    loadWeeklyRoutine: typeof loadWeeklyRoutine !== 'undefined' ? loadWeeklyRoutine : window.loadWeeklyRoutine,
    openRoutineDetails: typeof openRoutineDetails !== 'undefined' ? openRoutineDetails : window.openRoutineDetails,
    openAddRoutine: typeof openAddRoutine !== 'undefined' ? openAddRoutine : window.openAddRoutine,
    switchRoutineView: typeof switchRoutineView !== 'undefined' ? switchRoutineView : window.switchRoutineView,
    getSmartDashboardDay: typeof getSmartDashboardDay !== 'undefined' ? getSmartDashboardDay : window.getSmartDashboardDay,
    formatRoutineTime: typeof formatRoutineTime !== 'undefined' ? formatRoutineTime : window.formatRoutineTime,
    getDayNameByIndex: typeof getDayNameByIndex !== 'undefined' ? getDayNameByIndex : window.getDayNameByIndex,
    getTodayRoutineDayName: typeof getTodayRoutineDayName !== 'undefined' ? getTodayRoutineDayName : window.getTodayRoutineDayName,
    getTomorrowRoutineDayName: typeof getTomorrowRoutineDayName !== 'undefined' ? getTomorrowRoutineDayName : window.getTomorrowRoutineDayName,
    onRoutineCourseChange: typeof onRoutineCourseChange !== 'undefined' ? onRoutineCourseChange : window.onRoutineCourseChange,
    fetchRoutineDependencies: typeof fetchRoutineDependencies !== 'undefined' ? fetchRoutineDependencies : window.fetchRoutineDependencies,
    handleSaveRoutine: typeof handleSaveRoutine !== 'undefined' ? handleSaveRoutine : window.handleSaveRoutine,
    handleUpdateRoutine: typeof handleUpdateRoutine !== 'undefined' ? handleUpdateRoutine : window.handleUpdateRoutine,
    handleDeleteRoutine: typeof handleDeleteRoutine !== 'undefined' ? handleDeleteRoutine : window.handleDeleteRoutine,
    onRoutineBatchChange: typeof onRoutineBatchChange !== 'undefined' ? onRoutineBatchChange : window.onRoutineBatchChange
};

// Directly attach critical handlers to window to ensure HTML onclick bindings work immediately
window.openAddRoutine = openAddRoutine;
window.openRoutineDetails = openRoutineDetails;
window.switchRoutineView = switchRoutineView;

console.log("[ARCHITECTURE]\nroutines loaded");
