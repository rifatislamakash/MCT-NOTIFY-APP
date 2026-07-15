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
        let filteredRoutineData = []; // Store the filtered list
        let selectedRoutineId = null;
        let currentRoutineView = 'weekly'; // 'weekly' | 'daily'
        let currentRoutineFilter = 'All'; // 'All', 'My Section', or 'A', 'B', etc.
        let unsubscribeFaculty = null;
        let unsubscribeProfile = null;

        // Safari-safe Date parser (Strict WebKit compatibility)
        function getSafariSafeDate(dateInput) {
            if (!dateInput) return new Date();
            if (dateInput instanceof Date) return dateInput;
            const nativeDate = new Date(dateInput);
            if (!isNaN(nativeDate.getTime())) return nativeDate;
            const safeString = String(dateInput).replace(/-/g, '/').replace(/T/g, ' '); 
            const parsedDate = new Date(safeString);
            return isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        }

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
                if (crPermissionService.isCR()) {
                    await crPermissionService.initializePermissions();
                }
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
                window.routineBatchesList = finalBatches;
                routineCoursesList = courses;
                routineFacultyList = faculty;
            } catch (err) {
                console.error('[ROUTINE DEPS ERROR]', err);
            }
        }

        export async function renderExamRoutineView() {
            const container = document.getElementById('exams-routine-container');
            if (!container) return; // Exit if not in DOM
            container.innerHTML = ''; // CACHE BUSTER: Instantly clear stale UI
            
            if (typeof window.showLoader === 'function') {
                window.showLoader(true, 'Loading exams...');
            }
            
            try {
                  if (!window.authState || !window.authState.profile) {
                      console.warn("Auth state missing inside routines. Assuming unauthenticated.");
                      return;
                  }

                  let query = _supabase.from('exam_schedules').select('*').order('exam_date', { ascending: true }).order('start_time', { ascending: true });
                  if (window.currentUserRole !== 'admin') {
                       console.log('[EXAM ROUTINE] Fetching data for Batch ID:', window.authState.profile.batch_id);
                       query = query.eq('target_batch', window.authState.profile.batch_id);
                  }
                  const { data: exams, error } = await query;
                  if (error) throw error;

                  if (exams && exams.length > 0 && window.ReactionService) {
                      const examIds = exams.map(e => e.id);
                      try {
                          await window.ReactionService.fetchReactionsForContent('exam_schedules', examIds);
                      } catch (rxErr) {
                          console.warn("Failed to fetch reactions for exams:", rxErr);
                      }
                  }
                
                if (!exams || exams.length === 0) {
                    if (container) {
                        container.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-center text-slate-400 dark:text-dark-textSecondary bg-white dark:bg-dark-card rounded-3xl border border-slate-100 dark:border-white/5 shadow-sm px-6 mt-2">
                            <i data-lucide="calendar-check" class="w-12 h-12 text-indigo-300 mb-4 opacity-50"></i>
                            <h3 class="text-[16px] font-bold text-slate-700 dark:text-dark-textSecondary mb-2">No Exams Scheduled</h3>
                            <p class="text-[13px] leading-relaxed max-w-[250px]">You have no upcoming or past exams listed for your batch.</p>
                        </div>`;
                    }
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                    return;
                }
                
                let html = `<div class="space-y-4">`;
                const isAdminOrCR = (window.currentUserRole === 'admin' || window.currentUserRole === 'cr');
                let firstUpcomingFound = false;
                const now = new Date();
                const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
                const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
                
                exams.forEach(exam => {
                     let isPast = false;
                     if (exam.exam_date < todayStr) {
                         isPast = true;
                     } else if (exam.exam_date === todayStr) {
                         if (exam.end_time) {
                             const [h, m] = exam.end_time.split(':').map(Number);
                             if ((h * 60 + m) <= currentTotalMinutes) {
                                 isPast = true;
                             }
                         } else if (exam.start_time) {
                             const [h, m] = exam.start_time.split(':').map(Number);
                             if ((h * 60 + m) <= currentTotalMinutes) {
                                 isPast = true;
                             }
                         }
                     }
                     exam._isPast = isPast;
                });

                exams.sort((a, b) => {
                    if (a._isPast !== b._isPast) {
                        return a._isPast ? 1 : -1;
                    }
                    // If both are past, show the most recent past exam first
                    if (a._isPast) {
                        return new Date(b.exam_date) - new Date(a.exam_date);
                    }
                    // If both are upcoming, show the nearest upcoming exam first (ascending)
                    return 0; // Already sorted ascending by Supabase
                });

                exams.forEach(exam => {
                     let examDateStr = 'Date unset';
                     if (exam.exam_date) {
                         const examDateObj = getSafariSafeDate(exam.exam_date + 'T00:00:00');
                         examDateStr = examDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                     }
                     
                     let isPast = false;
                     if (exam.exam_date < todayStr) {
                         isPast = true;
                     } else if (exam.exam_date === todayStr) {
                         if (exam.end_time) {
                             const [h, m] = exam.end_time.split(':').map(Number);
                             if ((h * 60 + m) <= currentTotalMinutes) {
                                 isPast = true;
                             }
                         } else if (exam.start_time) {
                             const [h, m] = exam.start_time.split(':').map(Number);
                             if ((h * 60 + m) <= currentTotalMinutes) {
                                 isPast = true;
                             }
                         }
                     }

                     let isNextUpcoming = false;
                     if (!isPast && !firstUpcomingFound) {
                         isNextUpcoming = true;
                         firstUpcomingFound = true;
                     }
                     
                     let facultyName = '';
                     let courseCodeText = exam.course_code || '';
                     const cList = routineCoursesList || window.currentCoursesList || [];
                     const fList = routineFacultyList || window.currentFacultiesList || [];
                     const matchedCourse = cList.find(c => 
                         c.course_code === exam.course_code || 
                         c.course_name.toLowerCase() === exam.course_name.toLowerCase()
                     );
                     if (matchedCourse) {
                         if (!courseCodeText && matchedCourse.course_code) {
                             courseCodeText = matchedCourse.course_code;
                         }
                         if (matchedCourse.faculty_id) {
                             const matchedFaculty = fList.find(f => f.id === matchedCourse.faculty_id);
                             if (matchedFaculty) {
                                 facultyName = matchedFaculty.faculty_name;
                             }
                         }
                     }

                     const facultySub = facultyName ? ` • <span class="text-slate-500 dark:text-dark-textSecondary font-semibold text-xs">${window.sanitizeHTML(facultyName)}</span>` : '';
                     const codeSub = courseCodeText ? `<span class="bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-dark-textSecondary px-2 py-0.5 rounded text-[11px] font-bold">${window.sanitizeHTML(courseCodeText)}</span>` : '';
                     const subtitleHtml = codeSub || facultySub ? `<div class="flex items-center gap-2 mt-1 flex-wrap">${codeSub}${facultySub}</div>` : '';
                     
                     html += `<div id="exam-card-${exam.id}" class="bg-gradient-to-br from-indigo-50 to-white dark:from-[#0F1117] dark:to-[#1A1D26] rounded-[24px] p-4 shadow-sm border ${isNextUpcoming ? 'border-orange-500 ring-1 ring-orange-500 dark:border-orange-500/50 dark:ring-orange-500/50' : 'border-indigo-100 dark:border-white/5'} relative ${isPast ? 'opacity-50' : ''}">
                          ${isAdminOrCR ? `
                          <div class="absolute top-4 right-4 flex items-center gap-2 z-10">
                              <button onclick="event.stopPropagation(); window.openEditExamSchedule('${exam.id}')" class="w-8 h-8 flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition active:scale-95" title="Edit Exam">
                                  <i data-lucide="edit-2" class="w-4 h-4"></i>
                              </button>
                              <button onclick="event.stopPropagation(); window.executeGlobalDelete('exam_schedules', '${exam.id}', 'exam-card-${exam.id}')" class="w-8 h-8 flex items-center justify-center bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 rounded-full hover:bg-red-100 dark:hover:bg-red-500/20 transition active:scale-95" title="Delete Exam">
                                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                              </button>
                          </div>
                          ` : ''}
                          <div class="flex items-start gap-4">
                              <div class="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border border-indigo-100/40 dark:border-white/5">
                                  <i data-lucide="graduation-cap" class="w-6 h-6"></i>
                              </div>
                              <div class="flex-1 min-w-0 pr-6">
                                  <h3 class="text-[17px] font-extrabold text-slate-800 dark:text-dark-text leading-tight">${window.sanitizeHTML(exam.course_name)}</h3>
                                  ${subtitleHtml}
                                  
                                  <div class="flex items-center gap-1.5 mt-2.5 text-[11px] font-bold text-slate-500 dark:text-dark-textSecondary whitespace-nowrap overflow-hidden">
                                      <span class="flex items-center gap-1 text-indigo-600 shrink-0">
                                          <i data-lucide="calendar" class="w-3.5 h-3.5"></i>
                                          ${examDateStr}
                                      </span>
                                      <span class="text-slate-300 shrink-0">•</span>
                                      <span class="flex items-center gap-1 text-orange-600 shrink-0">
                                          <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                                          ${window.formatTimeIfPossible(exam.start_time)} - ${window.formatTimeIfPossible(exam.end_time)}
                                      </span>
                                      ${isPast ? `
                                      <span class="text-slate-300 shrink-0">•</span>
                                      <span class="text-slate-400 dark:text-dark-textSecondary font-extrabold text-[10px] uppercase shrink-0">PAST</span>
                                      ` : ''}
                                  </div>
                              </div>
                          </div>
                          
                          <div class="mt-4 flex items-center justify-between gap-3">
                              <div>
                                  ${exam.syllabus_desc ? `
                                  <button onclick="event.stopPropagation(); window.toggleExamSyllabus('${exam.id}', this)" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50/50 dark:bg-indigo-500/10 border border-indigo-100/50 dark:border-white/5 hover:bg-indigo-100/60 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold rounded-lg transition active:scale-95">
                                      <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                                      <span>Show Syllabus</span>
                                  </button>
                                  ` : ''}
                              </div>
                              <div class="shrink-0">
                                  ${window.ReactionService ? window.ReactionService.renderReactionBlock('exam_schedules', exam.id) : ''}
                              </div>
                          </div>
                          
                          ${exam.syllabus_desc ? `
                          <div id="exam-syllabus-${exam.id}" class="hidden mt-3 bg-white dark:bg-dark-card/70 rounded-xl p-4 text-[13px] text-slate-600 dark:text-dark-textSecondary border border-slate-100 dark:border-white/5 font-medium rich-text-content transition-all duration-300">
                              ${window.safeFormatRichText ? window.safeFormatRichText(exam.syllabus_desc) : window.sanitizeHTML(exam.syllabus_desc)}
                          </div>
                          ` : ''}
                      </div>`;
                });
                html += `</div>`;
                if (container) container.innerHTML = html;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            } catch(e) {
                console.error("[EXAMS FETCH ERROR]", e);
                if (container) {
                    container.innerHTML = `<div class="p-8 text-center text-red-500 font-bold bg-white dark:bg-dark-card rounded-3xl border border-red-100 shadow-sm mt-2">Failed to load exams. Please try again.</div>`;
                }
            } finally {
                if (typeof window.showLoader === 'function') {
                    window.showLoader(false);
                }
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
                if (!window.authState || !window.authState.profile) {
                    console.warn("Auth state missing inside routines. Assuming unauthenticated.");
                    return;
                }

                // Wait for dependencies (batches, etc.) to ensure we have batch names
                try {
                    await fetchRoutineDependencies(localController.signal);
                } catch (e) {
                    console.warn("Failed to prefetch routine dependencies", e);
                }

                // Global helper for Batch Label — works for ALL roles
                window.updateRoutineBatchLabel = function() {
                    const batchLabel = document.getElementById('wr-batch-label');
                    if (!batchLabel) return;
                    
                    const profile = window.authState?.profile;
                    if (!profile) return;
                    const bList = routineBatchesList || window.routineBatchesList || [];
                    
                    if (window.currentUserRole === 'student') {
                        let labelText = 'Your Batch';
                        if (bList.length > 0) {
                            const mainBatch = bList.find(b => b.id === profile.batch_id);
                            const secBatch = bList.find(b => b.id === profile.secondary_batch_id);
                            if (mainBatch) {
                                labelText = mainBatch.batch_name;
                                if (secBatch) {
                                    labelText += " & " + secBatch.batch_name;
                                }
                            }
                        } else {
                            labelText = profile.batches?.batch_name || 'Your Batch';
                        }
                        batchLabel.textContent = labelText;
                    } else if (window.currentUserRole === 'cr') {
                        // CR: show their assigned batches
                        if (bList.length > 0) {
                            const batchNames = bList.map(b => b.batch_name).join(' & ');
                            batchLabel.textContent = batchNames;
                        } else {
                            batchLabel.textContent = profile.batches?.batch_name || 'Your Batch';
                        }
                    } else {
                        // Admin: show 'All Batches' or the filtered batch
                        const batchFilterEl = document.getElementById('admin-routine-batch-filter');
                        if (batchFilterEl && !batchFilterEl.classList.contains('hidden') && batchFilterEl.value) {
                            const opt = batchFilterEl.options[batchFilterEl.selectedIndex];
                            batchLabel.textContent = opt ? opt.text : 'All Batches';
                        } else {
                            batchLabel.textContent = 'All Batches';
                        }
                    }
                };

                // UI BATCH TEXT UPDATE (Now using accurate lookup)
                try {
                    window.updateRoutineBatchLabel();
                } catch (err) {
                    console.warn("Non-fatal error updating batch text:", err);
                }

                // EXAM MODE SHORT-CIRCUIT
                const contentSettings = window.contentSettings || {};
                const isExamModeOn = (contentSettings.is_exam_mode === true || String(contentSettings.is_exam_mode).toLowerCase() === 'true' || contentSettings.is_exam_mode === '1' || contentSettings.is_exam_mode === 1);
                
                if (isExamModeOn) {
                    console.log("[ROUTINE] Exam Mode is ON. Skipping weekly routine fetch.");
                    // Ensure the UI visually updates to lock tabs
                    const btnWeekly = document.getElementById('btn-view-weekly');
                    const btnDaily = document.getElementById('btn-view-daily');
                    const btnExams = document.getElementById('btn-view-exams');
                    if (btnWeekly) btnWeekly.classList.add('opacity-40', 'cursor-not-allowed');
                    if (btnDaily) btnDaily.classList.add('opacity-40', 'cursor-not-allowed');
                    if (btnExams) btnExams.classList.remove('opacity-40', 'cursor-not-allowed');
                    
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

                    // Switch view to exams (handles container display and renders exams)
                    switchRoutineView('exams');
                    
                    loadDashboardTodayRoutine();
                    
                    // Clean up loader and module loading state
                    window.setModuleLoading('routine', false);
                    if (window.activeLoadControllers['routine'] === localController) {
                        window.activeLoadControllers['routine'] = null;
                    }
                    window.showLoader(false);
                    return;
                }

                // STEP 3: EXAM MODE OFF: RUN LEGACY FETCH
                let routineList;

                if (crPermissionService.isCR()) {
                    routineList = await crPermissionService.getVisibleRoutines();
                } else {
                    routineList = await fetchCachedOrDeduplicated('weekly_routines', async () => {
                        try {
                            return await fetchWithRetry(async (signal) => {
                                let query = _supabase
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
                                        `);
                                
                                const isAdmin = window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail);
                                if (!isAdmin) {
                                    console.log('[WEEKLY ROUTINE] Fetching data for Batch ID:', window.authState.profile.batch_id);
                                    query = query.eq('batch_id', window.authState.profile.batch_id);
                                }

                                const { data, error } = await query
                                    .order('start_time', { ascending: true })
                                    .abortSignal(signal);

                                if (error) {
                                    console.error("[ROUTINE] Fetch error:", error);
                                    throw error;
                                }
                                return data || [];
                            }, 2, 1000, 30000, localController.signal);
                        } catch (fetchErr) {
                            console.error("[ROUTINE] Fallback fetch failed:", fetchErr);
                            return [];
                        }
                    });
                }

                if (localController.signal.aborted) {
                    console.log("[ROUTINE] Fetch aborted, ignoring state updates.");
                    return;
                }

                routineData = (routineList || []).filter(r => r.room_number !== 'Break');
                console.log(`[ROUTINE] Successfully loaded ${routineData.length} records.`);

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
                
                // Sync tab states based on Exam Mode for when it's OFF
                const btnExams = document.getElementById('btn-view-exams');
                const btnWeekly = document.getElementById('btn-view-weekly');
                const btnDaily = document.getElementById('btn-view-daily');
                if (btnExams) btnExams.classList.add('opacity-40', 'cursor-not-allowed');
                if (btnWeekly) btnWeekly.classList.remove('opacity-40', 'cursor-not-allowed');
                if (btnDaily) btnDaily.classList.remove('opacity-40', 'cursor-not-allowed');
                
                if (currentRoutineView === 'exams') {
                    currentRoutineView = 'weekly';
                }

                // Filter data globally first
                refreshFilteredRoutineData();

                // Now render
                if (currentRoutineView === 'weekly') {
                    renderWeeklyTimetable(filteredRoutineData);
                } else if (currentRoutineView === 'exams') {
                    renderExamRoutineView();
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
            const contentSettings = window.contentSettings || {};
            const isExamModeOn = (contentSettings.is_exam_mode === true || String(contentSettings.is_exam_mode).toLowerCase() === 'true' || contentSettings.is_exam_mode === '1' || contentSettings.is_exam_mode === 1);
            
            if (isExamModeOn && (mode === 'weekly' || mode === 'daily')) {
                window.showGlobalToast('Exam Mode is Active', 'Weekly and Daily routines are currently disabled.', 'info');
                return;
            } else if (!isExamModeOn && mode === 'exams') {
                window.showGlobalToast('Exam Mode is Disabled', 'Exams tab is currently disabled.', 'info');
                return;
            }

            currentRoutineView = mode;

            const weeklyView = document.getElementById('routine-weekly-view');
            const dailyView = document.getElementById('routine-daily-view');
            const examsView = document.getElementById('routine-exams-view');
            
            const btnWeekly = document.getElementById('btn-view-weekly');
            const btnDaily = document.getElementById('btn-view-daily');
            const btnExams = document.getElementById('btn-view-exams');
            const tabLabel = document.getElementById('daily-tab-label');

            // Update tab label to reflect Today / Tomorrow
            if (tabLabel) {
                const { isToday } = getSmartDashboardDay();
                tabLabel.textContent = isToday ? 'Today' : 'Tomorrow';
            }

            // Reset all classes
            [weeklyView, dailyView, examsView].forEach(v => v?.classList.add('hidden'));
            
            // Reset buttons
            const resetBtn = (btn) => {
                if(btn) {
                    btn.classList.remove('bg-white', 'dark:bg-dark-card', 'text-slate-900', 'dark:text-dark-text');
                    btn.classList.add('text-slate-300');
                }
            };
            const activateBtn = (btn) => {
                if(btn) {
                    btn.classList.remove('text-slate-300');
                    btn.classList.add('bg-white', 'dark:bg-dark-card', 'text-slate-900', 'dark:text-dark-text');
                }
            };
            
            [btnWeekly, btnDaily, btnExams].forEach(resetBtn);

            const dynBtn = document.getElementById('wr-admin-dynamic-btn');
            const dynIcon = document.getElementById('wr-admin-dynamic-icon');
            const dynText = document.getElementById('wr-admin-dynamic-text');

            // Strictly hide controls from standard students
            const actualRole = window.authState?.profile?.role;
            const hasAdminControls = (actualRole === 'cr' || actualRole === 'admin' || actualRole === 'CR' || actualRole === 'ADMIN');
            
            if (dynBtn) {
                if (!hasAdminControls) {
                    dynBtn.style.display = 'none';
                } else {
                    dynBtn.style.display = 'flex';
                }
            }

            if (mode === 'weekly') {
                if(weeklyView) weeklyView.classList.remove('hidden');
                activateBtn(btnWeekly);
                if(dynBtn) {
                    dynBtn.onclick = () => { if(window.openAddRoutine) window.openAddRoutine(); };
                    dynBtn.className = 'px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-100 rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-sm';
                }
                if(dynIcon) dynIcon.setAttribute('data-lucide', 'plus');
                if(dynText) dynText.textContent = 'Class';
                refreshFilteredRoutineData();
                renderWeeklyTimetable(filteredRoutineData);
            } else if (mode === 'exams') {
                if(examsView) examsView.classList.remove('hidden');
                activateBtn(btnExams);
                if(dynBtn) {
                    dynBtn.onclick = () => { if(window.openAddExamSchedule) window.openAddExamSchedule(); };
                    dynBtn.className = 'px-3 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-100 rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-sm';
                }
                if(dynIcon) dynIcon.setAttribute('data-lucide', 'calendar-plus');
                if(dynText) dynText.textContent = 'Exam';
                renderExamRoutineView();
            } else {
                if(dailyView) dailyView.classList.remove('hidden');
                activateBtn(btnDaily);
                if(dynBtn) {
                    dynBtn.onclick = () => { if(window.openAddRoutine) window.openAddRoutine(); };
                    dynBtn.className = 'px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-100 rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-sm';
                }
                if(dynIcon) dynIcon.setAttribute('data-lucide', 'plus');
                if(dynText) dynText.textContent = 'Class';
                renderDailyRoutineView();
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        window.filterRoutinesByBatch = function() {
            refreshFilteredRoutineData();
            if (currentRoutineView === 'weekly') {
                renderWeeklyTimetable(filteredRoutineData);
            } else if (currentRoutineView === 'exams') {
                renderExamRoutineView();
            } else {
                renderDailyRoutineView();
            }
        };

        // ---- REFRESH FILTERED DATA ----
        function refreshFilteredRoutineData() {
            const batchFilterEl = document.getElementById('admin-routine-batch-filter');
            const batchVal = (batchFilterEl && !batchFilterEl.classList.contains('hidden')) ? batchFilterEl.value : 'all';

            filteredRoutineData = routineData;
            const isStrictAdmin = window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail);
            
            if (!isStrictAdmin && (!batchVal || batchVal === 'all')) {
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
        }

        // ---- RENDER WEEKLY TIMETABLE ----
        function renderWeeklyTimetable(dataArray) {
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
                        <div class="flex flex-col items-center justify-center py-16 px-4 text-center mt-4 bg-white dark:bg-dark-card rounded-3xl border border-slate-100 dark:border-white/5 shadow-sm">
                            <div class="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                                <i data-lucide="layers" class="w-8 h-8 text-slate-400 dark:text-dark-textSecondary"></i>
                            </div>
                            <h3 class="text-lg font-bold text-slate-700 dark:text-dark-textSecondary">Please select a batch</h3>
                            <p class="text-sm text-slate-500 dark:text-dark-textSecondary mt-1 max-w-[250px]">Select a batch from the dropdown above to view its routine.</p>
                        </div>
                    `;
                    if (window.lucide) window.lucide.createIcons();
                    return;
                }
                const opt = batchFilterEl.options[batchFilterEl.selectedIndex];
                const title = document.getElementById('wr-header-title');
                if (title && opt) title.textContent = "Weekly Routine " + opt.text.replace('Batch ', '');
                
                const batchLabel = document.getElementById('wr-batch-label');
                if (batchLabel && opt) batchLabel.textContent = opt.text;
                
                console.log(`[BATCH FILTER SELECT] Routine batch changed to: ${batchVal}`);
                console.log(`[ROUTINE BATCH] Rendering routines for batch: ${batchVal}`);
            } else {
                const title = document.getElementById('wr-header-title');
                if (title) title.textContent = "Weekly Routine";
            }

            if (!dataArray || dataArray.length === 0) {
                container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-16 text-center text-slate-400 dark:text-dark-textSecondary px-8">
                            <div class="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                                <i data-lucide="calendar-x" class="w-8 h-8 text-indigo-300"></i>
                            </div>
                            <h3 class="font-bold text-slate-500 dark:text-dark-textSecondary mb-1">No classes found</h3>
                            <p class="text-[12px]">There is no weekly routine data available.</p>
                        <button onclick="renderDailyRoutineView()" class="mt-3 text-[11px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full">Retry</button>
                    </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            // Update batch label based on filtered data
            if (typeof window.updateRoutineBatchLabel === 'function') {
                window.updateRoutineBatchLabel();
            } else {
                const batchLabel = document.getElementById('wr-batch-label');
                if (batchLabel) {
                    const firstBatch = dataArray.find(r => r.batches)?.batches;
                    batchLabel.textContent = firstBatch?.batch_name || window.authState?.profile?.batches?.batch_name || 'Current Batch';
                }
            }

            // Build lookup map: day -> start_time -> array of entries
            const lookup = {};
            dataArray.forEach(r => {
                if (!lookup[r.day_name]) lookup[r.day_name] = {};
                const key = `${r.start_time}`;
                if (!lookup[r.day_name][key]) lookup[r.day_name][key] = [];
                lookup[r.day_name][key].push(r);
            });

            // Only show days that actually have data (dynamic columns)
            const daysWithData = ROUTINE_DAYS.filter(d => dataArray.some(r => r.day_name === d));
            const renderDays = daysWithData.length > 0 ? daysWithData : ROUTINE_DAYS;

            // Today highlight
            const todayName = getTodayRoutineDayName();

            // Day color palette — all 7 days
            const dayColors = {
                'Saturday': { header: 'bg-violet-500', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300', today: 'bg-violet-50/50 dark:bg-violet-950/20' },
                'Sunday': { header: 'bg-pink-500', badge: 'bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300', today: 'bg-pink-50/50 dark:bg-pink-950/20' },
                'Monday': { header: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300', today: 'bg-indigo-50/50 dark:bg-indigo-950/20' },
                'Tuesday': { header: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300', today: 'bg-blue-50/50 dark:bg-blue-950/20' },
                'Wednesday': { header: 'bg-sky-500', badge: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300', today: 'bg-sky-50/50 dark:bg-sky-950/20' },
                'Thursday': { header: 'bg-teal-500', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300', today: 'bg-teal-50/50 dark:bg-teal-950/20' },
                'Friday': { header: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300', today: 'bg-emerald-50/50 dark:bg-emerald-950/20' },
            };

            // Dynamic cell width based on number of columns
            const cellW = renderDays.length <= 3 ? 'min-width:90px;' : renderDays.length <= 5 ? 'min-width:72px;' : 'min-width:60px;';

            let html = `
                    <div class="overflow-x-auto pb-2">
                    <div class="flex justify-center">
                    <table class="border-collapse" style="width:auto;">
                        <thead>
                            <tr>
                                <th class="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-2 text-[9px] font-black text-slate-500 dark:text-dark-textSecondary text-center" style="min-width:56px;">
                                    <div class="text-slate-600 dark:text-dark-textSecondary font-black text-[8px] uppercase leading-tight">Time</div>
                                </th>`;

            renderDays.forEach(day => {
                const isToday = day === todayName;
                const colors = dayColors[day] || { header: 'bg-slate-500', badge: 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-dark-textSecondary', today: 'bg-slate-50 dark:bg-dark-bg/50' };
                html += `
                                <th class="border border-slate-200 dark:border-white/10 p-0 ${isToday ? 'ring-2 ring-inset ring-[#4226E9]' : ''}" style="${cellW}">
                                    <div class="${colors.header} ${isToday ? 'opacity-100' : 'opacity-80'} py-2 px-2 text-center">
                                        <span class="text-white font-black text-[10px] uppercase tracking-wide">${day.substring(0, 3)}</span>
                                        ${isToday ? '<div class="w-1.5 h-1.5 bg-white dark:bg-dark-card rounded-full mx-auto mt-0.5 animate-pulse"></div>' : ''}
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
                        <td class="border border-slate-200 dark:border-white/10 bg-amber-50 p-1.5 text-center align-middle" style="min-width:56px;">
                            <div class="text-[11px] font-black text-amber-700 leading-tight">${timeDisplay.split(' ')[0]}</div>
                            <div class="text-[8px] font-bold text-amber-500 uppercase">${timeDisplay.split(' ')[1] || ''}</div>
                        </td>`;

                renderDays.forEach(day => {
                    const entries = lookup[day]?.[slotKey] || [];
                    const isToday = day === todayName;
                    const colors = dayColors[day] || { header: 'bg-slate-500', badge: 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-dark-textSecondary', today: 'bg-slate-50 dark:bg-dark-bg/50' };

                    if (entries.length > 0) {
                        html += `<td class="border ${isToday ? 'border-[#4226E9]/30' : 'border-slate-200 dark:border-white/10'} p-1 align-top ${isToday ? colors.today : 'bg-white dark:bg-dark-card'}" style="${cellW}">`;
                        
                        entries.forEach((entry, idx) => {
                            const isBreakEntry = !entry.course_id && (entry.room_number === 'Break');
                            if (idx > 0) html += `<div class="w-full border-t border-slate-100 dark:border-white/5 my-1"></div>`;
                            
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
                                const sectionHtml = section ? `<span class="text-[8px] font-bold text-slate-600 dark:text-dark-textSecondary bg-slate-100 dark:bg-white/5 px-1.5 rounded-full mb-0.5 border border-slate-200 dark:border-white/10">Sec: ${section}</span>` : '';
                                
                                let batchTagHtml = '';
                                if (window.currentUserRole === 'student' && entry.batch_id && String(entry.batch_id) !== String(window.authState?.profile?.batch_id)) {
                                    const bName = entry.batches?.batch_name ? window.sanitizeHTML(entry.batches.batch_name) : 'Other';
                                    batchTagHtml = `<span class="text-[7px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 mb-0.5 w-full text-center leading-none tracking-wide">${bName} Batch</span>`;
                                }

                                html += `
                                    <div class="flex flex-col gap-0.5 items-center py-0.5 ${isAdmin ? 'cursor-pointer active:scale-95 transition-transform' : ''}" ${isAdmin ? `onclick="openRoutineDetails('${entry.id}')"` : ''}>
                                        ${batchTagHtml}
                                        <span class="text-[10px] font-black px-1.5 py-0.5 rounded-md ${colors.badge} leading-tight text-center w-full mb-0.5">${shortName}</span>
                                        ${sectionHtml}
                                        <span class="text-[9px] font-bold text-slate-500 dark:text-dark-textSecondary px-1.5 py-0.5 rounded bg-white dark:bg-dark-card/80 w-full text-center leading-none">${initial}</span>
                                        <span class="text-[8px] font-medium text-slate-400 dark:text-dark-textSecondary leading-none">${room}</span>
                                    </div>`;
                            }
                        });
                        html += `</td>`;
                    } else {
                        const isAdmin = (window.currentUserRole === 'admin' || window.currentUserRole === 'cr');
                        html += `<td class="border ${isToday ? 'border-[#4226E9]/20' : 'border-slate-200 dark:border-white/10'} p-1 ${isToday ? colors.today : 'bg-white dark:bg-dark-card'}" style="${cellW}">
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
                html += `<span class="flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-dark-textSecondary bg-white dark:bg-dark-card border border-slate-100 dark:border-white/5 px-2 py-1 rounded-full shadow-xs">
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
                        <div class="flex flex-col items-center justify-center py-16 px-4 text-center bg-white dark:bg-dark-card rounded-[20px] border border-slate-100 dark:border-white/5 shadow-sm mt-4">
                            <div class="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                                <i data-lucide="layers" class="w-8 h-8 text-slate-400 dark:text-dark-textSecondary"></i>
                            </div>
                            <h3 class="text-lg font-bold text-slate-700 dark:text-dark-textSecondary">Please select a batch</h3>
                            <p class="text-sm text-slate-500 dark:text-dark-textSecondary mt-1 max-w-[250px]">Select a batch from the dropdown above to view its routine.</p>
                        </div>`;
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
                        <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400 dark:text-dark-textSecondary bg-white dark:bg-dark-card rounded-[20px] border border-slate-100 dark:border-white/5 shadow-sm">
                            <div class="w-14 h-14 bg-slate-50 dark:bg-dark-bg/50 rounded-2xl flex items-center justify-center mb-3">
                                <i data-lucide="moon" class="w-7 h-7 text-slate-300"></i>
                            </div>
                            <p class="text-sm font-bold text-slate-500 dark:text-dark-textSecondary">No classes ${showingToday ? 'today' : 'tomorrow'}.</p>
                            <p class="text-[11px] text-slate-400 dark:text-dark-textSecondary mt-1">Enjoy your ${showingToday ? 'day' : 'evening'} off! 🎉</p>
                        </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            // Show spinner immediately
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12">
                    <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p class="text-xs font-semibold text-slate-400 dark:text-dark-textSecondary">Loading ${showingToday ? 'today' : 'tomorrow'}'s classes...</p>
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

                // PART 11: Filter by enrolled courses for students/CRs unless a specific batch is selected
                const enrolledCourses = window.currentUserCoursesList || [];
                const isStrictAdmin = window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail);
                
                if (!isStrictAdmin && (!batchVal || batchVal === 'all')) {
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
                } else if (batchVal !== 'all') {
                    todayClasses = todayClasses.filter(r => r.batch_id === batchVal);
                }
            } catch (err) {

                if (typeof lucide !== 'undefined') lucide.createIcons();
                console.error('[DAILY VIEW FETCH ERROR]', err);
                return;
            }

            if (todayClasses.length === 0) {
                const dayLabel2 = showingToday ? targetDay : `tomorrow (${targetDay})`;
                container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400 dark:text-dark-textSecondary bg-white dark:bg-dark-card rounded-[20px] border border-slate-100 dark:border-white/5 shadow-sm">
                            <div class="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-3">
                                <i data-lucide="calendar-x" class="w-7 h-7 text-indigo-200"></i>
                            </div>
                            <p class="text-sm font-bold text-slate-500 dark:text-dark-textSecondary">No classes for ${dayLabel2}.</p>
                            <p class="text-[11px] text-slate-400 dark:text-dark-textSecondary mt-1">The routine has not been set for ${showingToday ? 'today' : 'tomorrow'}.</p>
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
            let mergedClasses = [];
            for (let i = 0; i < todayClasses.length; i++) {
                let currentClass = { ...todayClasses[i], isMerged: false, durationHrs: 1.5 };
                let isBreak = !currentClass.course_id || currentClass.room_number === 'Break';
                
                if (mergedClasses.length > 0 && !isBreak) {
                    let lastClass = mergedClasses[mergedClasses.length - 1];
                    let lastIsBreak = !lastClass.course_id || lastClass.room_number === 'Break';
                    
                    // Check if same course and faculty
                    if (!lastIsBreak && lastClass.course_id === currentClass.course_id && lastClass.faculty_id === currentClass.faculty_id) {
                        const endTimeLastStr = getEndTime(lastClass.start_time, lastClass.durationHrs);
                        const currentStartStr = currentClass.start_time ? currentClass.start_time.split(':').slice(0, 2).join(':') : '';
                        if (endTimeLastStr === currentStartStr) {
                            lastClass.durationHrs += 1.5;
                            lastClass.isMerged = true;
                            continue;
                        }
                    }
                }
                mergedClasses.push(currentClass);
            }

            container.innerHTML = mergedClasses.map((cls, idx) => {
                const timeDisplay = formatRoutineTime(cls.start_time);
                const endTimeStr = getEndTime(cls.start_time, cls.durationHrs);
                const endTimeDisplay = formatRoutineTime(endTimeStr);
                const [hh, mm] = (cls.start_time || '00:00').split(':').map(Number);
                const classMins = hh * 60 + mm;

                // Premium gradients list matching mock-up aesthetics
                const gradients = [
                    'from-[#3B82F6] to-[#6366F1]', // Blue-indigo
                    'from-[#F97316] to-[#F59E0B]', // Orange-amber
                    'from-[#10B981] to-[#06B6D4]', // Emerald-cyan
                    'from-[#EC4899] to-[#F43F5E]', // Pink-rose
                    'from-[#8B5CF6] to-[#D946EF]', // Violet-fuchsia
                    'from-[#0ea5e9] to-[#2563eb]'  // Sky-blue
                ];
                const gradientClass = gradients[idx % gradients.length];

                // Time splitter helper for typography styling
                const formatTimeParts = (displayStr) => {
                    if (!displayStr || displayStr === '--') return { val: '--', period: '' };
                    const parts = displayStr.split(' ');
                    return { val: parts[0] || '--', period: parts[1] || '' };
                };

                const startParts = formatTimeParts(timeDisplay);
                const endParts = formatTimeParts(endTimeDisplay);

                // Duration calculations
                const durationHrs = cls.durationHrs || 1.5;
                const dH = Math.floor(durationHrs);
                const dM = Math.round((durationHrs - dH) * 60);
                const durationDisplay = dM > 0 ? `${dH}h ${dM}m` : `${dH}h`;

                // Break slot detection
                const isBreakSlot = !cls.course_id || cls.room_number === 'Break';
                if (isBreakSlot) {
                    const breakGradient = 'from-[#F59E0B] to-[#D97706]';
                    const statusBadge = isOngoing
                        ? `<span class="bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 text-[8px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 self-center flex items-center gap-1 border border-amber-200/40 dark:border-transparent"><span class="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>Break</span>`
                        : isUpcoming
                            ? `<span class="bg-amber-50/50 text-amber-500/80 dark:bg-amber-950/20 dark:text-amber-500/60 text-[8px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 self-center">Break</span>`
                            : `<span class="bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-dark-textSecondary text-[8px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 self-center">Done</span>`;

                    return `
                        <div class="flex gap-2 items-start relative min-w-0 ${isAdmin ? 'cursor-pointer' : ''}" ${isAdmin ? `onclick="openRoutineDetails('${cls.id}')"` : ''}>
                            <div class="flex-1 min-w-0 bg-white dark:bg-dark-card rounded-[18px] border border-slate-100 dark:border-white/5 shadow-2xs flex items-center justify-between overflow-hidden hover:shadow-xs hover:border-amber-200/50 transition-all ${isPast ? 'opacity-60' : ''}">
                                <div class="flex items-center min-w-0 flex-1 self-stretch">
                                    <!-- Gradient left time box -->
                                    <div class="self-stretch w-[72px] sm:w-[78px] bg-gradient-to-br ${breakGradient} text-white p-2.5 flex flex-col items-start justify-center pl-3.5 shrink-0">
                                        <span class="text-[12px] font-extrabold tracking-tight leading-none">${startParts.val} <span class="text-[8px] font-bold opacity-80">${startParts.period}</span></span>
                                        <span class="text-[8px] opacity-40 my-0.5 leading-none pl-1">|</span>
                                        <span class="text-[12px] font-extrabold tracking-tight leading-none">${endParts.val} <span class="text-[8px] font-bold opacity-80">${endParts.period}</span></span>
                                        <div class="mt-1 px-1.5 py-0.2 rounded-full bg-white/20 text-[8px] font-extrabold tracking-wide uppercase whitespace-nowrap">${durationDisplay}</div>
                                    </div>
                                    
                                    <!-- Middle Content -->
                                    <div class="px-3 py-2.5 min-w-0 flex-1 text-left flex flex-col justify-center">
                                        <h4 class="font-extrabold text-[13px] text-amber-800 dark:text-amber-500 leading-snug break-words">☕ Break Time</h4>
                                        <p class="text-[9.5px] text-amber-600/80 dark:text-amber-400/80 font-semibold mt-0.5 break-words">Take a rest & refresh!</p>
                                    </div>
                                </div>
                                <div class="pr-3 shrink-0 flex items-center">
                                    ${statusBadge}
                                </div>
                            </div>
                        </div>`;
                }

                const durationMins = cls.durationHrs * 60;
                const isOngoing = showingToday && classMins <= nowMins && nowMins < classMins + durationMins;
                const isUpcoming = !showingToday || classMins > nowMins;
                const isPast = showingToday && classMins + durationMins <= nowMins;

                const courseName = window.sanitizeHTML(cls.courses?.course_name || 'Unknown Course');
                const teacherName = window.sanitizeHTML(cls.faculty?.faculty_name || 'Unknown Teacher');
                const room = window.sanitizeHTML(cls.room_number || 'N/A');
                const shortName = window.sanitizeHTML(cls.courses?.short_name || courseName.split(' ').map(w => w[0]).join('').substring(0, 3));
                const initial = window.sanitizeHTML(cls.faculty?.teacher_initial || '??');

                const statusBadge = isOngoing
                    ? `<span class="bg-purple-50 text-[#8B5CF6] dark:bg-purple-900/30 dark:text-purple-300 text-[8px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 self-center flex items-center gap-1 border border-purple-100 dark:border-transparent"><span class="w-1 h-1 rounded-full bg-[#8B5CF6] animate-pulse"></span>Ongoing</span>`
                    : isUpcoming
                        ? `<span class="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 text-[8px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 self-center flex items-center gap-1 border border-blue-100 dark:border-transparent"><span class="w-1 h-1 rounded-full bg-blue-500"></span>Upcoming</span>`
                        : `<span class="bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-dark-textSecondary text-[8px] font-black px-2 py-0.5 rounded-full uppercase shrink-0 self-center">Done</span>`;

                let badgesHtml = '';
                if (window.currentUserRole === 'student' && cls.batch_id && String(cls.batch_id) !== String(window.authState?.profile?.batch_id)) {
                    badgesHtml += `<span class="text-[8px] font-extrabold bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded-[4px] border border-rose-200 whitespace-nowrap">${cls.batches?.batch_name ? window.sanitizeHTML(cls.batches.batch_name) : 'Other'} Batch</span>`;
                }
                
                let sectionHTML = '';
                if (cls.section_name) {
                    sectionHTML = `<span class="bg-indigo-50/70 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-extrabold px-1.5 py-0.5 rounded-[4px] tracking-wide self-start leading-none">Sec: ${window.sanitizeHTML(cls.section_name)}</span>`;
                }

                const metadataBadges = `
                    <div class="flex items-center flex-wrap gap-1.5 mb-1">
                        ${badgesHtml}
                        ${sectionHTML}
                        <span class="text-[9px] font-extrabold bg-[#4226E9]/5 dark:bg-white/5 text-[#4226E9] dark:text-indigo-300 px-1.5 py-0.5 rounded-[4px]">${shortName}</span>
                        <span class="text-[9px] text-slate-400 dark:text-dark-textSecondary font-bold">${initial}</span>
                    </div>
                `;

                return `
                    <div class="flex gap-2 items-start relative min-w-0 group ${isAdmin ? 'cursor-pointer' : ''}" ${isAdmin ? `onclick="openRoutineDetails('${cls.id}')"` : ''}>
                        <div class="flex-1 min-w-0 bg-white dark:bg-dark-card rounded-[18px] border border-slate-100 dark:border-white/5 shadow-2xs flex items-center justify-between overflow-hidden hover:shadow-xs hover:border-[#4226E9]/15 transition-all ${isPast ? 'opacity-60' : ''}">
                            <div class="flex items-center min-w-0 flex-1 self-stretch">
                                <!-- Gradient left time box -->
                                <div class="self-stretch w-[72px] sm:w-[78px] bg-gradient-to-br ${gradientClass} text-white p-2.5 flex flex-col items-start justify-center pl-3.5 shrink-0">
                                    <span class="text-[12px] font-extrabold tracking-tight leading-none">${startParts.val} <span class="text-[8px] font-bold opacity-80">${startParts.period}</span></span>
                                    <span class="text-[8px] opacity-40 my-0.5 leading-none pl-1">|</span>
                                    <span class="text-[12px] font-extrabold tracking-tight leading-none">${endParts.val} <span class="text-[8px] font-bold opacity-80">${endParts.period}</span></span>
                                    <div class="mt-1 px-1.5 py-0.2 rounded-full bg-white/20 text-[8px] font-extrabold tracking-wide uppercase whitespace-nowrap">${durationDisplay}</div>
                                </div>
                                
                                <!-- Middle Content -->
                                <div class="px-3 py-2.5 min-w-0 flex-1 text-left flex flex-col justify-center">
                                    ${metadataBadges}
                                    <h4 class="font-extrabold text-[13px] text-slate-800 dark:text-indigo-50 leading-tight truncate mb-1">${courseName}</h4>
                                    <div class="flex items-center gap-1 text-[9.5px] text-slate-400 dark:text-dark-textSecondary font-semibold mt-0.5">
                                        <i data-lucide="map-pin" class="w-3 h-3 text-slate-400 dark:text-dark-textSecondary shrink-0"></i>
                                        <span class="truncate">Room ${room} — ${teacherName}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="pr-3 shrink-0 flex items-center">
                                ${statusBadge}
                            </div>
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

                // Reset form first before setting dynamic values
                const form = document.getElementById('form-add-routine');
                if (form) form.reset();

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
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
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



        export async function openAddExamSchedule() {
            const role = String(window.currentUserRole || '').toLowerCase();
            if (role !== 'admin' && role !== 'cr') return;
            
            window.showLoader(true, 'Preparing form...');
            try {
                await fetchRoutineDependencies();
                const form = document.getElementById('form-add-exam-schedule');
                if (form) form.reset();
                
                const batchSel = document.getElementById('exam-target-batch');
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
                
                const courseSel = document.getElementById('exam-course-name');
                const courseCodeInput = document.getElementById('exam-course-code');
                
                if (courseSel && routineCoursesList) {
                    const batchId = batchSel ? batchSel.value : null;
                    const filteredCourses = batchId ? routineCoursesList.filter(c => c.batch_id === batchId) : routineCoursesList;
                    
                    courseSel.innerHTML = '<option value="" disabled selected hidden>Select course...</option>' +
                        filteredCourses.map(c => `<option value="${window.sanitizeHTML(c.course_name)}" data-code="${window.sanitizeHTML(c.course_code || '')}">${window.sanitizeHTML(c.course_name)}${c.short_name ? ' (' + c.short_name + ')' : ''}</option>`).join('');
                        
                    courseSel.onchange = (e) => {
                        const selectedOption = e.target.options[e.target.selectedIndex];
                        if (selectedOption && courseCodeInput) {
                            courseCodeInput.value = selectedOption.getAttribute('data-code') || '';
                        }
                    };
                }
                
                window.navigate('screen-add-exam-schedule');
                
                // Re-initialize rich text editors for the exam syllabus
                // Remove old init flag so it re-creates the contenteditable overlay
                const examToolbar = document.querySelector('#screen-add-exam-schedule .rich-text-toolbar');
                if (examToolbar) {
                    delete examToolbar.dataset.richInit;
                    // Remove any stale contenteditable overlay
                    const oldEditor = examToolbar.parentElement.querySelector('[contenteditable]');
                    if (oldEditor) oldEditor.remove();
                    // Show the textarea again so initRichEditors can process it
                    const ta = document.getElementById('exam-syllabus-desc');
                    if (ta) ta.style.display = '';
                }
                if (typeof window.initRichEditors === 'function') window.initRichEditors();
                if (typeof lucide !== 'undefined') lucide.createIcons();
            } catch (err) {
                console.error('Failed to open add exam schedule:', err);
                window.showGlobalToast('Error', 'Failed to load dependencies', 'error');
            } finally {
                window.showLoader(false);
            }
        }

        export async function handleAddExamSubmit(e) {
            e.preventDefault();
            const role = String(window.currentUserRole || '').toLowerCase();
            if (role !== 'admin' && role !== 'cr') return;

            const courseName = document.getElementById('exam-course-name').value.trim();
            const courseCode = document.getElementById('exam-course-code').value.trim();
            const examDate = document.getElementById('exam-date').value;
            const startTime = document.getElementById('exam-start-time').value;
            const endTime = document.getElementById('exam-end-time').value;
            const targetBatch = document.getElementById('exam-target-batch').value;
            const syllabusDesc = document.getElementById('exam-syllabus-desc').value.trim();

            if (!courseName || !courseCode || !examDate || !startTime || !endTime || !targetBatch) {
                window.showGlobalToast('Required', 'Please fill all required fields.', 'error');
                return;
            }

            window.showLoader(true, 'Creating exam...');
            try {
                const { data: newExam, error } = await _supabase
                    .from('exam_schedules')
                    .insert([{
                        course_name: courseName,
                        course_code: courseCode,
                        exam_date: examDate,
                        start_time: startTime,
                        end_time: endTime,
                        syllabus_desc: syllabusDesc,
                        target_batch: targetBatch,
                        author_id: window.authState.user.id,
                        author_role: role
                    }])
                    .select()
                    .single();

                if (error) throw error;
                
                // Parse and save reminders
                try {
                    const reminderRows = [];
                    const eventDateTime = getSafariSafeDate(examDate + 'T' + startTime);
                    const listContainer = document.getElementById('exam-reminders-list');
                    if (listContainer) {
                        listContainer.querySelectorAll('.reminder-row').forEach(div => {
                            const offsetSelect = div.querySelector('.reminder-offset');
                            if (!offsetSelect) return;
                            const offsetVal = offsetSelect.value;
                            let targetTime;
                            
                            if (offsetVal === 'custom') {
                                const customInput = div.querySelector('.reminder-custom-time');
                                if (customInput && customInput.value) {
                                    targetTime = getSafariSafeDate(customInput.value);
                                }
                            } else {
                                const offsetMinutes = parseInt(offsetVal, 10);
                                if (!isNaN(offsetMinutes)) {
                                    targetTime = new Date(eventDateTime.getTime() - offsetMinutes * 60 * 1000);
                                }
                            }
                            
                            if (targetTime && !isNaN(targetTime.getTime())) {
                                reminderRows.push({
                                    parent_type: 'exam',
                                    parent_id: newExam.id,
                                    reminder_time: targetTime.toISOString(),
                                    sent: false,
                                    reminder_title: `📝 Exam: '${courseName}'`,
                                    reminder_message: `'${courseName}' Exam will be held on '${examDate} & ${window.formatTimeIfPossible ? window.formatTimeIfPossible(startTime) : startTime}'.`,
                                    created_by: window.authState.user.id
                                });
                            }
                        });
                        
                        if (reminderRows.length > 0) {
                            console.log("[REMINDERS] Inserting exam reminder rows...", reminderRows);
                            const { error: reminderError } = await _supabase
                                .from('notification_reminders')
                                .insert(reminderRows);
                                
                            if (reminderError) {
                                console.error("[REMINDERS] Error inserting exam reminders:", reminderError);
                            }
                        }
                    }
                } catch (remErr) {
                    console.error("[REMINDERS] Exception during exam reminder calculation or insert:", remErr);
                }

                // Fire push notification using edge function (similar to notice creation)
                const targetTopic = `batch_${targetBatch}_topic`;
                
                window.stripRichTextForNotification = function(text) {
                    if (!text) return '';
                    let plain = String(text);
                    // Strip Markdown bold, italic, underline
                    plain = plain.replace(/\*\*(.*?)\*\*/g, '$1');
                    plain = plain.replace(/\*(.*?)\*/g, '$1');
                    plain = plain.replace(/__(.*?)__/g, '$1');
                    // Strip Markdown Links
                    plain = plain.replace(/\[(.*?)\]\([^)]+\)/g, '$1');
                    // Strip Colors
                    plain = plain.replace(/\[color=#[0-9a-fA-F]{6}\](.*?)\[\/color\]/g, '$1');
                    // Strip HTML (if any)
                    plain = plain.replace(/<[^>]+>/g, '');
                    // Normalize newlines for push
                    plain = plain.replace(/\n+/g, ' ');
                    return plain.trim();
                }

                const shouldNotify = document.getElementById('notify-audience-exam')?.checked !== false;

                if (shouldNotify) {
                        const { NotificationQueueService } = await import('./services/NotificationQueueService.js');
                        const queueRes = await NotificationQueueService.queueNotification({
                        parentType: 'exam',
                        parentId: newExam.id,
                        isNotifyEnabled: true,
                        audienceType: 'batch_students',
                        createdBy: window.authState.user.id,
                        courseName: courseName,
                        date: examDate,
                        time: window.formatTimeIfPossible ? window.formatTimeIfPossible(startTime) : startTime
                    });
                    if (!queueRes.success) console.error("Exam Queue Error:", queueRes.error);
                } else {
                    console.log("[SILENT MODE] Content saved, but audience notification skipped.");
                }

                window.showGlobalToast('Created', 'Exam schedule added successfully!');
                
                // Delay slightly to allow Supabase Read Replicas to sync
                await new Promise(r => setTimeout(r, 300));
                
                window.navigate('screen-weekly-routine');
                if (window.switchRoutineView) window.switchRoutineView('exams');
            } catch (err) {
                console.error('[ADD EXAM ERROR]', err);
                window.showGlobalToast('Error', 'Failed to create exam.', 'error');
            } finally {
                window.showLoader(false);
            }
        }
        
        window.toggleExamSyllabus = function(examId, btn) {
            const container = document.getElementById(`exam-syllabus-${examId}`);
            if (!container) return;
            const isHidden = container.classList.contains('hidden');
            
            if (isHidden) {
                container.classList.remove('hidden');
                btn.querySelector('span').textContent = 'Hide Syllabus';
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.setAttribute('data-lucide', 'eye-off');
                }
            } else {
                container.classList.add('hidden');
                btn.querySelector('span').textContent = 'Show Syllabus';
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.setAttribute('data-lucide', 'eye');
                }
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };

        export async function openEditExamSchedule(examId) {
            const role = String(window.currentUserRole || '').toLowerCase();
            if (role !== 'admin' && role !== 'cr') return;
            
            window.showLoader(true, 'Loading exam details...');
            try {
                await fetchRoutineDependencies();
                
                const { data: exam, error } = await _supabase
                    .from('exam_schedules')
                    .select('*')
                    .eq('id', examId)
                    .single();
                    
                if (error) throw error;
                if (!exam) throw new Error('Exam not found');
                
                document.getElementById('edit-exam-id').value = exam.id;
                
                const batchSel = document.getElementById('edit-exam-target-batch');
                const courseSel = document.getElementById('edit-exam-course-name');
                const courseCodeInput = document.getElementById('edit-exam-course-code');
                
                const updateEditCoursesList = (batchId) => {
                    if (courseSel && routineCoursesList) {
                        const filteredCourses = batchId ? routineCoursesList.filter(c => c.batch_id === batchId) : routineCoursesList;
                        courseSel.innerHTML = '<option value="" disabled hidden>Select course...</option>' +
                            filteredCourses.map(c => `<option value="${window.sanitizeHTML(c.course_name)}" data-code="${window.sanitizeHTML(c.course_code || '')}">${window.sanitizeHTML(c.course_name)}${c.short_name ? ' (' + c.short_name + ')' : ''}</option>`).join('');
                    }
                };

                if (batchSel) {
                    batchSel.innerHTML = '<option value="" disabled hidden>Select batch</option>' +
                        routineBatchesList.map(s => `<option value="${s.id}">${window.sanitizeHTML(s.batch_name)}</option>`).join('');
                    batchSel.value = exam.target_batch;
                    
                    batchSel.onchange = (e) => {
                        updateEditCoursesList(e.target.value);
                        if (courseCodeInput) courseCodeInput.value = '';
                    };
                    
                    if (routineBatchesList.length === 1) {
                        batchSel.value = routineBatchesList[0].id;
                        batchSel.parentElement.parentElement.classList.add('hidden');
                    } else {
                        batchSel.parentElement.parentElement.classList.remove('hidden');
                    }
                }
                
                updateEditCoursesList(exam.target_batch);
                if (courseSel) {
                    courseSel.value = exam.course_name;
                    courseSel.onchange = (e) => {
                        const selectedOption = e.target.options[e.target.selectedIndex];
                        if (selectedOption && courseCodeInput) {
                            courseCodeInput.value = selectedOption.getAttribute('data-code') || '';
                        }
                    };
                }
                if (courseCodeInput) {
                    courseCodeInput.value = exam.course_code || '';
                }
                
                document.getElementById('edit-exam-date').value = exam.exam_date;
                document.getElementById('edit-exam-start-time').value = exam.start_time ? exam.start_time.substring(0, 5) : '';
                document.getElementById('edit-exam-end-time').value = exam.end_time ? exam.end_time.substring(0, 5) : '';
                
                document.getElementById('edit-exam-syllabus-desc').value = exam.syllabus_desc || '';
                
                const remindersList = document.getElementById('edit-exam-reminders-list');
                if (remindersList) {
                    remindersList.innerHTML = '';
                    const { data: reminders, error: remError } = await _supabase
                        .from('notification_reminders')
                        .select('*')
                        .eq('parent_type', 'exam')
                        .eq('parent_id', examId);
                        
                    if (remError) {
                        console.error("[REMINDERS] Error loading exam reminders:", remError);
                    } else if (reminders && reminders.length > 0) {
                        const eventDateTime = getSafariSafeDate(exam.exam_date + 'T' + exam.start_time);
                        reminders.forEach(rem => {
                            const row = document.createElement('div');
                            row.className = 'reminder-row bg-slate-50 dark:bg-dark-bg/50 border border-slate-100 dark:border-white/5 rounded-[12px] p-3 flex flex-wrap gap-2 items-center';
                            
                            let offsetMinutes = '';
                            let isCustom = false;
                            let customVal = '';
                            
                            const remTime = getSafariSafeDate(rem.reminder_time);
                            if (eventDateTime && !isNaN(eventDateTime.getTime()) && remTime && !isNaN(remTime.getTime())) {
                                const diffMs = eventDateTime.getTime() - remTime.getTime();
                                const diffMin = Math.round(diffMs / (60 * 1000));
                                if ([15, 30, 60, 1440].includes(diffMin)) {
                                    offsetMinutes = String(diffMin);
                                } else {
                                    isCustom = true;
                                    offsetMinutes = 'custom';
                                    
                                    const pad = (n) => String(n).padStart(2, '0');
                                    const localYear = remTime.getFullYear();
                                    const localMonth = pad(remTime.getMonth() + 1);
                                    const localDate = pad(remTime.getDate());
                                    const localHours = pad(remTime.getHours());
                                    const localMinutes = pad(remTime.getMinutes());
                                    customVal = `${localYear}-${localMonth}-${localDate}T${localHours}:${localMinutes}`;
                                }
                            }
                            
                            row.innerHTML = `
                                <div class="flex-1 min-w-[140px]">
                                    <select class="reminder-offset w-full text-[12px] bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-[8px] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4226E9]" onchange="this.nextElementSibling.style.display = (this.value === 'custom') ? 'block' : 'none'">
                                        <option value="15" ${offsetMinutes === '15' ? 'selected' : ''}>15 minutes before</option>
                                        <option value="30" ${offsetMinutes === '30' ? 'selected' : ''}>30 minutes before</option>
                                        <option value="60" ${offsetMinutes === '60' ? 'selected' : ''}>1 hour before</option>
                                        <option value="1440" ${offsetMinutes === '1440' ? 'selected' : ''}>1 day before</option>
                                        <option value="custom" ${isCustom ? 'selected' : ''}>Custom Time</option>
                                    </select>
                                    <input type="datetime-local" class="reminder-custom-time w-full text-[12px] bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-[8px] px-2 py-1.5 mt-2 focus:outline-none focus:ring-1 focus:ring-[#4226E9]" style="display: ${isCustom ? 'block' : 'none'};" value="${customVal}">
                                </div>
                                <button type="button" onclick="removeReminderRow(this)" class="p-1.5 text-red-500 hover:bg-red-50 rounded-[8px] transition-colors shrink-0" title="Remove Reminder">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            `;
                            remindersList.appendChild(row);
                        });
                    }
                }
                
                window.navigate('screen-edit-exam-schedule');
                
                const examToolbar = document.querySelector('#screen-edit-exam-schedule .rich-text-toolbar');
                if (examToolbar) {
                    delete examToolbar.dataset.richInit;
                    const oldEditor = examToolbar.parentElement.querySelector('[contenteditable]');
                    if (oldEditor) oldEditor.remove();
                    const ta = document.getElementById('edit-exam-syllabus-desc');
                    if (ta) ta.style.display = '';
                }
                if (typeof window.initRichEditors === 'function') window.initRichEditors();
                if (typeof lucide !== 'undefined') lucide.createIcons();
                
            } catch (err) {
                console.error('Failed to open edit exam schedule:', err);
                window.showGlobalToast('Error', 'Failed to load exam details', 'error');
            } finally {
                window.showLoader(false);
            }
        }

        export async function handleEditExamSubmit(e) {
            e.preventDefault();
            const role = String(window.currentUserRole || '').toLowerCase();
            if (role !== 'admin' && role !== 'cr') return;

            const examId = document.getElementById('edit-exam-id').value.trim();
            const courseName = document.getElementById('edit-exam-course-name').value.trim();
            const courseCode = document.getElementById('edit-exam-course-code').value.trim();
            const examDate = document.getElementById('edit-exam-date').value;
            const startTime = document.getElementById('edit-exam-start-time').value;
            const endTime = document.getElementById('edit-exam-end-time').value;
            const targetBatch = document.getElementById('edit-exam-target-batch').value;
            const syllabusDesc = document.getElementById('edit-exam-syllabus-desc').value.trim();

            if (!examId || !courseName || !courseCode || !examDate || !startTime || !endTime || !targetBatch) {
                window.showGlobalToast('Required', 'Please fill all required fields.', 'error');
                return;
            }

            window.showLoader(true, 'Updating exam...');
            try {
                const { data: updatedRows, error } = await _supabase
                    .from('exam_schedules')
                    .update({
                        course_name: courseName,
                        course_code: courseCode,
                        exam_date: examDate,
                        start_time: startTime,
                        end_time: endTime,
                        syllabus_desc: syllabusDesc,
                        target_batch: targetBatch,
                        is_global: (targetBatch === 'all')
                    })
                    .eq('id', examId)
                    .select();

                if (error) throw error;
                if (!updatedRows || updatedRows.length === 0) {
                    console.error("Exam update failed: 0 rows affected. RLS or ID mismatch.");
                    throw new Error("Update failed. You may not have permission to edit this exam.");
                }
                
                const { error: delRemError } = await _supabase
                    .from('notification_reminders')
                    .delete()
                    .eq('parent_type', 'exam')
                    .eq('parent_id', examId);
                    
                if (delRemError) {
                    console.error("[REMINDERS] Error deleting old exam reminders:", delRemError);
                }

                try {
                    const reminderRows = [];
                    const eventDateTime = getSafariSafeDate(examDate + 'T' + startTime);
                    const listContainer = document.getElementById('edit-exam-reminders-list');
                    if (listContainer) {
                        listContainer.querySelectorAll('.reminder-row').forEach(div => {
                            const offsetSelect = div.querySelector('.reminder-offset');
                            if (!offsetSelect) return;
                            const offsetVal = offsetSelect.value;
                            let targetTime;
                            
                            if (offsetVal === 'custom') {
                                const customInput = div.querySelector('.reminder-custom-time');
                                if (customInput && customInput.value) {
                                    targetTime = getSafariSafeDate(customInput.value);
                                }
                            } else {
                                const offsetMinutes = parseInt(offsetVal, 10);
                                if (!isNaN(offsetMinutes)) {
                                    targetTime = new Date(eventDateTime.getTime() - offsetMinutes * 60 * 1000);
                                }
                            }
                            
                            if (targetTime && !isNaN(targetTime.getTime())) {
                                reminderRows.push({
                                    parent_type: 'exam',
                                    parent_id: examId,
                                    reminder_time: targetTime.toISOString(),
                                    sent: false,
                                    reminder_title: `📝 Exam: '${courseName}'`,
                                    reminder_message: `'${courseName}' Exam will be held on '${examDate} & ${window.formatTimeIfPossible ? window.formatTimeIfPossible(startTime) : startTime}'.`,
                                    created_by: window.authState.user.id
                                });
                            }
                        });
                        
                        if (reminderRows.length > 0) {
                            console.log("[REMINDERS] Inserting exam reminder rows...", reminderRows);
                            const { error: reminderError } = await _supabase
                                .from('notification_reminders')
                                .insert(reminderRows);
                                
                            if (reminderError) {
                                console.error("[REMINDERS] Error inserting exam reminders:", reminderError);
                            }
                        }
                    }
                } catch (remErr) {
                    console.error("[REMINDERS] Exception during exam reminder calculation or insert:", remErr);
                }

                const targetTopic = `batch_${targetBatch}_topic`;
                const stripFn = window.stripRichTextForNotification || ((text) => {
                    if (!text) return '';
                    let plain = String(text);
                    plain = plain.replace(/\*\*(.*?)\*\*/g, '$1');
                    plain = plain.replace(/\*(.*?)\*/g, '$1');
                    plain = plain.replace(/__(.*?)__/g, '$1');
                    plain = plain.replace(/\[(.*?)\]\([^)]+\)/g, '$1');
                    plain = plain.replace(/\[color=#[0-9a-fA-F]{6}\](.*?)\[\/color\]/g, '$1');
                    plain = plain.replace(/<[^>]+>/g, '');
                    plain = plain.replace(/\n+/g, ' ');
                    return plain.trim();
                });

                const shouldNotify = document.getElementById('notify-audience-edit-exam')?.checked !== false;

                if (shouldNotify) {
                    const { NotificationQueueService } = await import('./services/NotificationQueueService.js');
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
                    if (!queueRes.success) console.error("Exam Queue Error:", queueRes.error);
                } else {
                    console.log("[SILENT MODE] Content saved, but audience notification skipped.");
                }

                window.showGlobalToast('Updated', 'Exam schedule updated successfully!');
                
                // Delay slightly to allow Supabase Read Replicas to sync
                await new Promise(r => setTimeout(r, 300));
                
                window.navigate('screen-weekly-routine');
                if (typeof window.switchRoutineView === 'function') {
                    window.switchRoutineView('exams');
                } else if (typeof renderExamRoutineView === 'function') {
                    renderExamRoutineView();
                }
            } catch (err) {
                console.error('[EDIT EXAM ERROR]', err);
                window.showGlobalToast('Error', 'Failed to update exam.', 'error');
            } finally {
                window.showLoader(false);
            }
        }

        window.openAddExamSchedule = openAddExamSchedule;
        window.handleAddExamSubmit = handleAddExamSubmit;
        window.openEditExamSchedule = openEditExamSchedule;
        window.handleEditExamSubmit = handleEditExamSubmit;
        window.loadWeeklyRoutine = loadWeeklyRoutine;

        // Removed DOMContentLoaded trigger to prevent "auth load failed" error on login screens.
        // loadWeeklyRoutine is already handled by the router when navigating to the routine screen.




