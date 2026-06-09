import { _supabase } from './supabase-client.js';
import { showGlobalToast, showLoader, forceHideLoader, cancelActiveRequest, fetchWithRetry } from './utils.js';
import { CourseStore } from './stores/CourseStore.js';
import { FacultyStore } from './stores/FacultyStore.js';
import { RoutineStore } from './stores/RoutineStore.js';
import { NotificationStore } from './stores/NotificationStore.js';
import { ProfileStore } from './stores/ProfileStore.js';

        // ----------------- NOTICES SYSTEM -----------------
        let currentNoticesList = [];
        let currentNoticeFile = null;
        let selectedNoticeIdForDetails = null;
        let allCoursesList = [];
        let currentNoticeFilter = 'all';

        export async function loadNotices() {
            if (isModuleLoading('notices')) return;
            setModuleLoading('notices', true);
            cancelActiveRequest('notices');
            const localController = new AbortController();
            window.activeLoadControllers['notices'] = localController;

            window.showLoader(true, "Loading notices...");
            console.log("[NOTICES] Loading notices list...");
            try {
                if (allCoursesList.length === 0) {
                    allCoursesList = await CourseStore.getCourses();
                }
                
                // Fetch notices with their target courses using retry and abort signal
                const noticesData = await fetchWithRetry(async (signal) => {
                    const { data, error } = await _supabase
                        .from('notices')
                        .select(`
                                *,
                                notice_courses ( course_id ),
                                profiles (id, full_name, profile_url, role)
                            `)
                        .order('is_pinned', { ascending: false })
                        .order('created_at', { ascending: false })
                        .abortSignal(signal);

                    if (error) {
                        console.error("[NOTICES] Query error:", error);
                        throw error;
                    }
                    return data;
                }, 3, 1000, 10000, localController.signal);

                if (localController.signal.aborted) {
                    console.log("[NOTICES] Fetch aborted, ignoring rendering.");
                    return;
                }

                console.log(`[AUTH] Authenticated User: ${window.currentUserEmail}`);
                console.log(`[AUTH] Detected Role: ${window.currentUserRole}`);

                const btnCreateNotice = document.getElementById('btn-admin-create-notice');
                const isAdmin = (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail));
                if (isAdmin) {
                    console.log("[AUTH] Admin permission state: GRANTED. Showing admin controls.");
                    window.currentNoticesList = noticesData || [];
                    if (btnCreateNotice) btnCreateNotice.classList.remove('hidden');
                } else {
                    console.log("[AUTH] Admin permission state: DENIED. Filtering for student.");
                    if (btnCreateNotice) btnCreateNotice.classList.add('hidden');

                    const studentCourses = window.currentUserCoursesList.map(uc => uc.course_id);
                    window.currentNoticesList = (noticesData || []).filter(n => {
                        if (n.audience_type === 'all') return true;
                        if (n.notice_courses && n.notice_courses.length > 0) {
                            return n.notice_courses.some(nc => studentCourses.includes(nc.course_id));
                        }
                        return false;
                    });
                }

                console.log(`[NOTICES] Successfully loaded ${window.currentNoticesList.length} notices.`);
                const noticeIds = window.currentNoticesList.map(n => n.id);
                if (window.ReactionService) await window.ReactionService.fetchReactionsForContent('notice', noticeIds);

                injectDashboardNotices();
                renderNoticesList();
                if (typeof window.updateDashboardQuickAccessBadges === 'function') window.updateDashboardQuickAccessBadges();
                if (typeof window.fetchNotificationCenterNotices === 'function') window.fetchNotificationCenterNotices();
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log("[NOTICES] Abort detected, resetting to welcome screen.");
                    if (typeof window.forceHideLoader === 'function') window.forceHideLoader();
                    if (isScreenActive('screen-notices-list') && typeof window.navigate === 'function') {
                        /* window.navigate('screen-welcome'); (removed AbortError redirect) */
                    }
                    return;
                }
                console.error("Error loading notices:", err);
                window.showGlobalToast("Error", "Could not load notices.");
            } finally {
                if (window.activeLoadControllers['notices'] === localController) {
                    window.activeLoadControllers['notices'] = null;
                    window.showLoader(false);
                }
            }
        }

        function setNoticeFilter(type) {
            currentNoticeFilter = type;
            document.querySelectorAll('.notice-filter-btn').forEach(btn => {
                btn.className = "notice-filter-btn px-4 py-1.5 bg-white/10 text-slate-300 border border-white/10 text-[11px] font-bold rounded-full whitespace-nowrap transition-colors";
                if (btn.dataset.filter === type) {
                    btn.className = "notice-filter-btn active px-4 py-1.5 bg-indigo-600 text-white border border-transparent text-[11px] font-bold rounded-full whitespace-nowrap transition-colors";
                }
            });
            renderNoticesList();
        }

        function filterNotices() {
            renderNoticesList();
        }

        function renderNoticesList() {
            const container = document.getElementById('notices-list-container');
            if (!container) return;

            const q = document.getElementById('notices-search')?.value.toLowerCase() || '';

            let filtered = window.currentNoticesList.filter(n => {
                const matchQuery = n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q);
                const matchType = currentNoticeFilter === 'all' || n.notice_type === currentNoticeFilter;
                return matchQuery && matchType;
            });

            // Dynamic Time-Aware Sorting
            const now = new Date();
            const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            filtered.sort((a, b) => {
                const dateA = new Date((a.notice_date || toDateStr(now)) + 'T' + (a.notice_time || '23:59:00'));
                const dateB = new Date((b.notice_date || toDateStr(now)) + 'T' + (b.notice_time || '23:59:00'));
                const aIsExpired = dateA < now;
                const bIsExpired = dateB < now;
                
                if (aIsExpired !== bIsExpired) {
                    return aIsExpired ? 1 : -1; // Active first, expired last
                }
                if (!aIsExpired) {
                    return dateA - dateB; // Upcoming: closest first
                } else {
                    return dateB - dateA; // Expired: most recent past first
                }
            });

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                            <i data-lucide="bell-off" class="w-8 h-8 text-slate-300"></i>
                        </div>
                        <p class="text-[14px] font-bold text-slate-500">No notices found.</p>
                    </div>
                `;
            } else {
                const todayD = new Date();
                const tomorrowD = new Date(todayD);
                tomorrowD.setDate(todayD.getDate() + 1);
                const todayStr = toDateStr(todayD);
                const tomorrowStr = toDateStr(tomorrowD);

                container.innerHTML = filtered.map(n => {
                    const isUrgent = n.notice_type === 'urgent';
                    let badgeHtml = isUrgent 
                        ? `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-red-100 text-red-600 uppercase">URGENT</span>`
                        : `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-indigo-100 text-[#4226E9] uppercase">GENERAL</span>`;

                    if (n.notice_courses && n.notice_courses.length > 0) {
                        badgeHtml += n.notice_courses.map(nc => {
                            const c = allCoursesList.find(x => x.id === nc.course_id);
                            const name = c ? (c.short_name || c.course_name) : 'Specific';
                            return `<span class="px-1.5 py-0.5 rounded-[4px] text-[8.5px] font-bold tracking-wide bg-blue-100 text-blue-600 uppercase ml-1">${window.sanitizeHTML(name)}</span>`;
                        }).join('');
                    }

                    const pin = n.is_pinned ? `<i data-lucide="pin" class="w-3 h-3 text-orange-500 fill-orange-500 ml-1"></i>` : '';

                    let dateStr = '';
                    if (n.notice_date) {
                        const d = new Date(n.notice_date + 'T00:00:00');
                        dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    }
                    if (n.notice_time) {
                        const [h, m] = n.notice_time.split(':');
                        const ampm = +h >= 12 ? 'PM' : 'AM';
                        const h12 = +h % 12 || 12;
                        dateStr += (dateStr ? '   ' : '') + `${h12}:${m} ${ampm}`;
                    }
                    if (!dateStr) dateStr = new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                    const noticeD = new Date((n.notice_date || todayStr) + 'T' + (n.notice_time || '23:59:00'));
                    const isExpired = noticeD < new Date();

                    const isTodayOrTomorrow = n.notice_date === todayStr || n.notice_date === tomorrowStr;
                    let cardClasses = "p-3 rounded-[16px] shadow-sm flex flex-col gap-1.5 cursor-pointer transition-all active:scale-[0.98] ";
                    if (isExpired) {
                        cardClasses += "bg-slate-50 border border-slate-100 opacity-50 grayscale hover:opacity-80";
                    } else if (isTodayOrTomorrow) {
                        cardClasses += "bg-purple-50/50 border-2 border-purple-400 hover:border-purple-500 shadow-purple-100";
                    } else {
                        cardClasses += "bg-white border border-slate-100 hover:border-indigo-200";
                    }

                    let rightSideHtml = `<div class="flex items-center">`;
                    rightSideHtml += pin;
                    rightSideHtml += `</div>`;

                    return `
                            <div onclick="openNoticeDetails('${window.sanitizeHTML(n.id)}')" class="${cardClasses} relative pb-4 px-4 pt-3 mt-2">
                                ${window.AuthorService ? window.AuthorService.renderAuthorBlock(n.profiles, dateStr, badgeHtml, rightSideHtml) : ''}
                                <div class="mt-1 flex flex-col">
                                    <h4 class="font-extrabold text-[15px] text-slate-900 truncate leading-tight">${window.sanitizeHTML(n.title)}</h4>
                                    <p class="text-[13px] text-slate-500 line-clamp-2 overflow-hidden mt-0.5 leading-snug">${window.sanitizeHTML(n.message)}</p>
                                </div>
                                ${window.ReactionService ? window.ReactionService.renderReactionBlock('notice', n.id) : ''}
                            </div>
                        `;
                }).join('');
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        
        function injectDashboardNotices() {
            // Top Urgent Notice for dashboard
            const urgentCard = document.getElementById('dashboard-urgent-notice');
            if (urgentCard) {
                const latestUrgent = window.currentNoticesList.find(n => n.notice_type === 'urgent');
                if (latestUrgent) {
                    
                    urgentCard.classList.remove('hidden');
                    const dashTitle = document.getElementById('dash-urgent-title');
                    const dashDesc = document.getElementById('dash-urgent-desc');
                    if (dashTitle) dashTitle.innerText = latestUrgent.title;
                    if (dashDesc) dashDesc.innerText = latestUrgent.message;
                    urgentCard.onclick = () => openNoticeDetails(latestUrgent.id);
                } else {
                    
                    urgentCard.classList.add('hidden');
                }
                
                if (typeof window.triggerUrgentPopupModal === 'function') {
                    triggerUrgentPopupModal();
                }
            }

            // Recent General Notices
            const recentContainer = document.getElementById('dashboard-recent-notices');
            if (recentContainer) {
                const latestGenerals = window.currentNoticesList.filter(n => n.notice_type === 'general').slice(0, 3);
                if (latestGenerals.length === 0) {
                    recentContainer.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">No recent notices</p>`;
                } else {
                    recentContainer.innerHTML = latestGenerals.map(n => {
                        // Build date string from notice_date/notice_time
                        let nDateStr = '';
                        if (n.notice_date) {
                            const d = new Date(n.notice_date + 'T00:00:00');
                            nDateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }
                        if (n.notice_time) {
                            const [h, m] = n.notice_time.split(':');
                            const ampm = +h >= 12 ? 'PM' : 'AM';
                            const h12 = +h % 12 || 12;
                            nDateStr += (nDateStr ? ' • ' : '') + `${h12}:${m} ${ampm}`;
                        }
                        if (!nDateStr) nDateStr = new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                        return `
                            <div onclick="openNoticeDetails('${window.sanitizeHTML(n.id)}')" class="flex items-start gap-4 p-4 bg-white rounded-[20px] shadow-sm shadow-slate-200/50 border border-slate-100 mb-3 cursor-pointer active:scale-[0.98] transition-all">
                                <div class="w-12 h-12 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                                    <i data-lucide="bell" class="w-5 h-5"></i>
                                </div>
                                <div class="flex-1 min-w-0 pt-0.5">
                                    <div class="flex items-center justify-between mb-1">
                                        <h4 class="font-bold text-[14px] text-slate-900 leading-tight truncate">${window.sanitizeHTML(n.title)}</h4>
                                        <span class="text-[10px] font-bold text-slate-400 shrink-0 ml-2">${nDateStr}</span>
                                    </div>
                                    <p class="text-[12px] font-medium text-slate-500 leading-snug line-clamp-2">${window.sanitizeHTML(n.message)}</p>
                                </div>
                            </div>
                            `;
                    }).join('');
                }
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        // --- Create / Edit ---
        export async function toggleNoticeCourses() {
            const aud = document.getElementById('notice-audience-type').value;
            const cList = document.getElementById('notice-course-selection');
            if (aud === 'specific') {
                // Pre-fetch courses if not loaded
                if (!window.currentCoursesList || window.currentCoursesList.length === 0) {
                    console.log("[NOTICE SYSTEM] Courses list empty, fetching...");
                    try {
                        const { data: crs, error } = await _supabase.from('courses').select('*').order('course_name');
                        if (error) {
                            console.error("[NOTICE SYSTEM] Course fetch error:", error);
                        } else {
                            window.currentCoursesList = crs || [];
                            console.log(`[NOTICE SYSTEM] Fetched ${window.currentCoursesList.length} courses.`);
                        }
                    } catch (e) {
                        console.error("[NOTICE SYSTEM] Course fetch exception:", e);
                    }
                }

                cList.classList.remove('hidden');
                if (window.currentCoursesList.length === 0) {
                    cList.innerHTML = '<p class="text-[13px] text-slate-500 text-center py-4">No courses available</p>';
                } else {
                    cList.innerHTML = window.currentCoursesList.map(c => `
                            <label class="flex items-center gap-3 p-2.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors">
                                <input type="checkbox" value="${c.id}" class="notice-course-cb w-4 h-4 accent-[#4226E9]">
                                <span class="text-[13px] text-slate-700 font-semibold">${window.sanitizeHTML(c.course_name)} (${c.course_code || c.short_name || ''})</span>
                            </label>
                        `).join('');
                }
            } else {
                cList.classList.add('hidden');
            }
        }

        function togglePublishDate(checked) {
            const container = document.getElementById('notice-publish-date-container');
            if (container) {
                if (!checked) container.classList.remove('hidden');
                else container.classList.add('hidden');
            }
        }

        function onNoticeFileSelected(input) {
            const file = input.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                window.showGlobalToast("File Too Large", "Max attachment is 5MB");
                input.value = '';
                return;
            }
            currentNoticeFile = file;
            document.getElementById('notice-file-dropzone').classList.add('hidden');
            document.getElementById('notice-selected-file-preview').classList.remove('hidden');
            document.getElementById('notice-selected-filename').innerText = file.name;
            document.getElementById('notice-selected-filesize').innerText = (file.size / 1024).toFixed(1) + ' KB';
        }

        function clearNoticeFile() {
            currentNoticeFile = null;
            document.getElementById('notice-file-input').value = '';
            document.getElementById('notice-file-dropzone').classList.remove('hidden');
            document.getElementById('notice-selected-file-preview').classList.add('hidden');
            document.getElementById('notice-edit-attachment-url').value = '';
        }

        export async function openCreateNotice() {
            document.getElementById('create-notice-title').innerText = "Create Notice";
            document.getElementById('form-create-notice').reset();
            document.getElementById('notice-edit-id').value = '';
            clearNoticeFile();
            const remindersList = document.getElementById('notice-reminders-list');
            if (remindersList) remindersList.innerHTML = '';

            // Set default date/time to now
            const now = new Date();
            document.getElementById('notice-date-input').value = now.toISOString().split('T')[0];
            document.getElementById('notice-time-input').value = now.toTimeString().slice(0, 5);

            // Pre-fetch courses so dropdown is ready
            if (!window.currentCoursesList || window.currentCoursesList.length === 0) {
                try {
                    window.currentCoursesList = await CourseStore.getCourses();
                    console.log("[NOTICE SYSTEM] Pre-loaded", window.currentCoursesList.length, "courses for Create Notice.");
                } catch (e) { console.warn("[NOTICE SYSTEM] Course pre-fetch error:", e); }
            }

            await toggleNoticeCourses();
            togglePublishDate(true);
            document.getElementById('btn-delete-notice').classList.add('hidden');
            // Reset radio buttons to general
            const generalRadio = document.querySelector('input[name="notice-type-radio"][value="general"]');
            if (generalRadio) generalRadio.checked = true;
            document.getElementById('notice-type').value = 'general';
            window.navigate('screen-create-notice');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        export async function handleSaveNotice(e) {
            e.preventDefault();
            window.showLoader(true, "Saving Notice...");
            try {
                const id = document.getElementById('notice-edit-id').value;
                const title = document.getElementById('notice-title').value;
                const message = document.getElementById('notice-message').value;
                const notice_type = document.getElementById('notice-type').value;
                const is_pinned = document.getElementById('notice-pinned').checked;
                const publish_now = document.getElementById('notice-publish-now').checked;
                const publish_date = publish_now ? new Date().toISOString() : document.getElementById('notice-publish-date').value;
                const audience_type = document.getElementById('notice-audience-type').value;
                // New date/time columns
                const notice_date = document.getElementById('notice-date-input').value || null;
                const notice_time = document.getElementById('notice-time-input').value || null;

                let attachmentUrl = document.getElementById('notice-edit-attachment-url').value || null;

                if (currentNoticeFile) {
                    console.log("[NOTICE SYSTEM] Uploading attachment:", currentNoticeFile.name);
                    const ext = currentNoticeFile.name.split('.').pop();
                    const safeName = currentNoticeFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const fileName = `notice_${Date.now()}_${safeName}`;
                    const { data: uploadData, error: uploadError } = await _supabase.storage.from('notice-files').upload(fileName, currentNoticeFile);
                    if (uploadError) {
                        console.error("[NOTICE SYSTEM] Attachment upload error:", uploadError);
                        throw uploadError;
                    }
                    console.log("[NOTICE SYSTEM] Attachment upload successful");
                    const { data: urlData } = _supabase.storage.from('notice-files').getPublicUrl(fileName);
                    attachmentUrl = urlData.publicUrl;
                }

                const payload = {
                    title, message, notice_type, is_pinned, publish_now, publish_date,
                    audience_type, notice_date, notice_time,
                    attachment_url: attachmentUrl,
                    created_by: window.authState.user.id
                };
                console.log("[NOTICE SYSTEM] Notice payload:", payload);

                let savedNoticeId = id;
                if (id) {
                    const { error } = await _supabase.from('notices').update(payload).eq('id', id);
                    if (error) {
                        console.error("[NOTICE SYSTEM] Supabase Update error:", error);
                        throw error;
                    }
                } else {
                    const { data, error } = await _supabase.from('notices').insert([payload]).select();
                    if (error) {
                        console.error("[NOTICE SYSTEM] Supabase Insert error:", error);
                        throw error;
                    }
                    console.log("[NOTICE SYSTEM] Notice insert response:", data);
                    savedNoticeId = data[0].id;
                }

                // Task 3: Insert/Update Reminders and Automatic Push Notification
                try {
                    // Always delete old reminders first when saving (handles both update and insert safely)
                    console.log("[REMINDERS] Cleaning up old reminders for notice ID:", savedNoticeId);
                    await _supabase.from('notification_reminders').delete().eq('parent_id', savedNoticeId).eq('parent_type', 'notice');

                    const reminderRows = [];
                    
                    // Automatically queue push notification immediately for notice creation
                    if (!id) {
                        reminderRows.push({
                            parent_type: 'notice',
                            parent_id: savedNoticeId,
                            reminder_time: new Date(Date.now() + 60000).toISOString(),
                            sent: false,
                            reminder_title: title,
                            reminder_message: message,
                            created_by: window.authState.user.id
                        });
                    }

                    const reminderDivs = document.querySelectorAll('#notice-reminders-list .reminder-row');
                    if (reminderDivs.length > 0) {
                        console.log(`[REMINDERS] Found ${reminderDivs.length} reminder rows to insert/update.`);
                        const eventDateTime = new Date(notice_date + 'T' + notice_time);
                        
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
                            }
                            
                            if (targetTime && !isNaN(targetTime.getTime())) {
                                reminderRows.push({
                                    parent_type: 'notice',
                                    parent_id: savedNoticeId,
                                    reminder_time: targetTime.toISOString(),
                                    sent: false,
                                    reminder_title: title,
                                    reminder_message: message,
                                    created_by: window.authState.user.id
                                });
                            }
                        });
                    }
                    
                    if (reminderRows.length > 0) {
                        console.log("[REMINDERS] Inserting/updating reminder rows...", reminderRows);
                        console.log('[QUEUE INSERT PAYLOAD]', reminderRows);
                        const { error: reminderError } = await _supabase
                            .from('notification_reminders')
                            .insert(reminderRows);
                            
                        if (reminderError) {
                            console.error("[REMINDERS] Error inserting reminders into notification_reminders:", reminderError);
                            window.showGlobalToast("Warning", "Notice saved, but reminders failed to schedule.");
                        } else {
                            console.log("[REMINDERS] Successfully scheduled reminders bulk insert completed.");
                        }
                    }
                } catch (remErr) {
                    console.error("[REMINDERS] Exception during reminder calculation or insert:", remErr);
                    window.showGlobalToast("Warning", "Notice saved, but reminders calculation failed.");
                }

                // Handle Audience Courses
                if (audience_type === 'specific') {
                    // Delete old
                    await _supabase.from('notice_courses').delete().eq('notice_id', savedNoticeId);

                    const cbs = document.querySelectorAll('.notice-course-cb:checked');
                    if (cbs.length > 0) {
                        const ncInserts = Array.from(cbs).map(cb => ({
                            notice_id: savedNoticeId,
                            course_id: cb.value
                        }));
                        console.log("[NOTICE SYSTEM] Inserting notice_courses relations:", ncInserts);
                        const { error: ncError } = await _supabase.from('notice_courses').insert(ncInserts);
                        if (ncError) {
                            console.error("[NOTICE SYSTEM] notice_courses insert error:", ncError);
                            throw ncError;
                        }
                    }
                } else {
                    await _supabase.from('notice_courses').delete().eq('notice_id', savedNoticeId);
                }

                window.showGlobalToast("Success", "Notice saved successfully.");
                window.navigateBack();
                await loadNotices();
            } catch (err) {
                console.error("[NOTICE SYSTEM] Unhandled Error:", err);
                window.showGlobalToast("Error", "Failed to save notice. Check logs.");
            } finally {
                window.showLoader(false);
            }
        }

        export async function openNoticeDetails(id) {
            const notice = window.currentNoticesList.find(n => n.id === id);
            if (!notice) return;
            selectedNoticeIdForDetails = id;

            document.getElementById('nd-title').innerText = notice.title;
            document.getElementById('nd-message').innerText = notice.message;

            // Build date/time from notice_date + notice_time columns
            let ndDateStr = '';
            if (notice.notice_date) {
                const d = new Date(notice.notice_date + 'T00:00:00');
                ndDateStr = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
            }
            if (notice.notice_time) {
                const [h, m] = notice.notice_time.split(':');
                const ampm = +h >= 12 ? 'PM' : 'AM';
                const h12 = +h % 12 || 12;
                ndDateStr += (ndDateStr ? ' • ' : '') + `${h12}:${m} ${ampm}`;
            }
            if (!ndDateStr) ndDateStr = new Date(notice.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
            document.getElementById('nd-date').innerText = ndDateStr;

            const badge = document.getElementById('nd-type-badge');
            if (notice.notice_type === 'urgent') {
                badge.className = "px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md bg-red-100 text-red-700";
                badge.innerText = "Urgent Notice";
            } else {
                badge.className = "px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md bg-indigo-100 text-indigo-700";
                badge.innerText = "General Notice";
            }

            const attCont = document.getElementById('nd-attachment-container');
            const preview = document.getElementById('nd-attachment-preview');
            const dlBtn = document.getElementById('nd-download-btn');

            if (notice.attachment_url) {
                attCont.classList.remove('hidden');
                dlBtn.href = notice.attachment_url;

                const url = notice.attachment_url;
                const isPdf = url.toLowerCase().includes('.pdf');
                const isImage = /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url);

                if (isImage) {
                    preview.innerHTML = `<img src="${url}" class="w-full max-h-[300px] object-contain rounded-[12px] bg-slate-100">`;
                } else if (isPdf) {
                    preview.innerHTML = `<iframe src="${url}#toolbar=0" class="w-full h-[300px] rounded-[12px]"></iframe>`;
                } else {
                    preview.innerHTML = `<div class="p-8 text-center text-slate-500 font-bold"><i data-lucide="file-text" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>Document File</div>`;
                }
            } else {
                attCont.classList.add('hidden');
            }

            const isAdmin = (window.currentUserRole === 'admin' || window.isAdminEmail(window.currentUserEmail));
            if (isAdmin) {
                document.getElementById('btn-edit-notice').classList.remove('hidden');
            } else {
                document.getElementById('btn-edit-notice').classList.add('hidden');
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
            window.navigate('screen-notice-details');
        }

        export async function openEditNotice() {
            const notice = window.currentNoticesList.find(n => n.id === selectedNoticeIdForDetails);
            if (!notice) return;

            document.getElementById('create-notice-title').innerText = "Edit Notice";
            document.getElementById('notice-edit-id').value = notice.id;
            document.getElementById('notice-title').value = notice.title;
            document.getElementById('notice-message').value = notice.message;
            document.getElementById('notice-type').value = notice.notice_type;
            document.getElementById('notice-pinned').checked = notice.is_pinned;
            document.getElementById('notice-publish-now').checked = notice.publish_now;
            document.getElementById('notice-audience-type').value = notice.audience_type;

            // Populate notice_date and notice_time
            document.getElementById('notice-date-input').value = notice.notice_date || '';
            document.getElementById('notice-time-input').value = notice.notice_time || '';

            // Sync radio button for notice type
            const radioBtn = document.querySelector(`input[name="notice-type-radio"][value="${notice.notice_type}"]`);
            if (radioBtn) radioBtn.checked = true;

            togglePublishDate(notice.publish_now);
            if (!notice.publish_now && notice.publish_date) {
                document.getElementById('notice-publish-date').value = new Date(notice.publish_date).toISOString().slice(0, 16);
            }
            clearNoticeFile();
            if (notice.attachment_url) {
                document.getElementById('notice-edit-attachment-url').value = notice.attachment_url;
                document.getElementById('notice-file-dropzone').classList.add('hidden');
                document.getElementById('notice-selected-file-preview').classList.remove('hidden');
                document.getElementById('notice-selected-filename').innerText = "Existing File Attached";
                document.getElementById('notice-selected-filesize').innerText = "Keep or replace";
            }

            await toggleNoticeCourses();
            if (notice.audience_type === 'specific' && notice.notice_courses) {
                const cbs = document.querySelectorAll('.notice-course-cb');
                const courseIds = notice.notice_courses.map(nc => nc.course_id);
                cbs.forEach(cb => {
                    if (courseIds.includes(cb.value)) cb.checked = true;
                });
            }

            document.getElementById('btn-delete-notice').classList.remove('hidden');

            // Fetch and render existing reminders
            const listContainer = document.getElementById('notice-reminders-list');
            if (listContainer) listContainer.innerHTML = '';

            try {
                const { data: reminders, error } = await _supabase
                    .from('notification_reminders')
                    .select('*')
                    .eq('parent_type', 'notice')
                    .eq('parent_id', notice.id);

                if (error) throw error;
                if (reminders && reminders.length > 0 && listContainer) {
                    console.log(`[EDIT NOTICE] Loaded ${reminders.length} existing reminders.`);
                    
                    const eventDateTime = new Date((notice.notice_date || '') + 'T' + (notice.notice_time || ''));
                    
                    reminders.forEach(rem => {
                        const rowId = 'reminder-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
                        
                        let offsetValue = 'custom';
                        let customDateVal = '';
                        
                        if (rem.reminder_time && eventDateTime && !isNaN(eventDateTime.getTime())) {
                            const remTime = new Date(rem.reminder_time);
                            const diffMs = eventDateTime.getTime() - remTime.getTime();
                            const diffMins = Math.round(diffMs / (60 * 1000));
                            
                            if (diffMins === 1440 || diffMins === 180 || diffMins === 30) {
                                offsetValue = String(diffMins);
                            } else {
                                offsetValue = 'custom';
                                customDateVal = rem.reminder_time.slice(0, 16);
                            }
                        } else if (rem.reminder_time) {
                            customDateVal = rem.reminder_time.slice(0, 16);
                        }
                        
                        const rowHTML = `
                            <div id="${rowId}" class="reminder-row flex flex-col gap-2 p-3 bg-slate-50 rounded-[12px] border border-slate-200 relative group">
                                <div class="flex items-center gap-3">
                                    <div class="flex-1">
                                        <select onchange="toggleCustomReminderTime(this)" class="reminder-offset w-full h-[40px] px-3 bg-white text-slate-700 text-[13px] font-bold rounded-[8px] border border-slate-200 focus:border-[#4226E9] outline-none">
                                            <option value="1440" ${offsetValue === '1440' ? 'selected' : ''}>1 day before</option>
                                            <option value="180" ${offsetValue === '180' ? 'selected' : ''}>3 hours before</option>
                                            <option value="30" ${offsetValue === '30' ? 'selected' : ''}>30 minutes before</option>
                                            <option value="custom" ${offsetValue === 'custom' ? 'selected' : ''}>Custom Date/Time</option>
                                        </select>
                                    </div>
                                    <button type="button" onclick="removeReminderRow('${rowId}')" class="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors shrink-0">
                                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                                    </button>
                                </div>
                                <div class="custom-time-container ${offsetValue === 'custom' ? '' : 'hidden'}">
                                    <label class="text-[10px] font-black uppercase text-slate-400 tracking-wider ml-1">Custom DateTime</label>
                                    <input type="datetime-local" value="${customDateVal}" class="reminder-custom-time w-full h-[40px] px-3 bg-white text-slate-700 text-[13px] font-bold rounded-[8px] border border-slate-200 focus:border-[#4226E9] outline-none mt-1">
                                </div>
                            </div>
                        `;
                        listContainer.insertAdjacentHTML('beforeend', rowHTML);
                    });
                }
            } catch (err) {
                console.error("[EDIT NOTICE] Error loading existing reminders:", err);
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();
            window.navigate('screen-create-notice');
        }

        export async function deleteNoticeAction() {
            if (!confirm("Are you sure you want to delete this notice?")) return;
            const id = document.getElementById('notice-edit-id').value;
            if (!id) {
                console.error("[NOTICE DELETE] No notice ID found in form.");
                window.showGlobalToast("Error", "No notice selected for deletion.");
                return;
            }
            console.log("[NOTICE DELETE] Starting deletion for notice ID:", id);
            window.showLoader(true, "Deleting notice...");
            try {
                // Step 1: Delete attachment file from storage if exists
                const attachmentUrl = document.getElementById('notice-edit-attachment-url').value;
                if (attachmentUrl) {
                    try {
                        const urlParts = attachmentUrl.split('/notice-files/');
                        if (urlParts.length > 1) {
                            const storagePath = urlParts[1].split('?')[0];
                            console.log("[NOTICE DELETE] Removing storage file:", storagePath);
                            await _supabase.storage.from('notice-files').remove([storagePath]);
                        }
                    } catch (e) { console.warn("[NOTICE DELETE] Storage cleanup error (non-fatal):", e); }
                }

                // Step 2: Delete notice_courses relations FIRST (FK constraint)
                console.log("[NOTICE DELETE] Deleting notice_courses relations...");
                const { error: relError } = await _supabase.from('notice_courses').delete().eq('notice_id', id);
                if (relError) {
                    console.error("[NOTICE DELETE] notice_courses delete error:", relError);
                    throw relError;
                }
                console.log("[NOTICE DELETE] notice_courses relations deleted successfully.");

                // Task 2: Delete reminders from notification_reminders
                try {
                    console.log("[NOTICE DELETE] Deleting matching reminders...");
                    const { error: remError } = await _supabase.from('notification_reminders').delete().eq('parent_id', id);
                    if (remError) {
                        console.error("[NOTICE DELETE] Error deleting reminders:", remError);
                    } else {
                        console.log("[NOTICE DELETE] Reminders deleted successfully.");
                    }
                } catch (remErr) {
                    console.error("[NOTICE DELETE] Exception during reminders delete:", remErr);
                }

                // Step 3: Delete the notice itself
                console.log("[NOTICE DELETE] Deleting notice row...");
                const { error: noticeError } = await _supabase.from('notices').delete().eq('id', id);
                if (noticeError) {
                    console.error("[NOTICE DELETE] notice delete error:", noticeError);
                    throw noticeError;
                }
                console.log("[NOTICE DELETE] Notice deleted successfully from database.");

                // Step 4: Remove from local state
                window.currentNoticesList = window.currentNoticesList.filter(n => n.id !== id);

                window.showGlobalToast("Success", "Notice deleted.");
                window.navigate('screen-notices-list');
                renderNoticesList();
                injectDashboardNotices();
            } catch (e) {
                console.error("[NOTICE DELETE] FAILED:", e);
                window.showGlobalToast("Error", "Failed to delete notice. Check console.");
            } finally {
                window.showLoader(false);
            }
        }

        // Expose notice functions globally
        
        
        
        
        
        
        
        
        
        
        
        
        
        



export const NoticeService = {
    _urgentNoticeForPopup: typeof _urgentNoticeForPopup !== 'undefined' ? _urgentNoticeForPopup : window._urgentNoticeForPopup,
    _urgentNoticeForPopup: typeof _urgentNoticeForPopup !== 'undefined' ? _urgentNoticeForPopup : window._urgentNoticeForPopup,
    _urgentNoticeForPopup: typeof _urgentNoticeForPopup !== 'undefined' ? _urgentNoticeForPopup : window._urgentNoticeForPopup,
    loadNotices: typeof loadNotices !== 'undefined' ? loadNotices : window.loadNotices,
    renderNoticesList: typeof renderNoticesList !== 'undefined' ? renderNoticesList : window.renderNoticesList,
    injectDashboardNotices: typeof injectDashboardNotices !== 'undefined' ? injectDashboardNotices : window.injectDashboardNotices,
    setNoticeFilter: typeof setNoticeFilter !== 'undefined' ? setNoticeFilter : window.setNoticeFilter,
    filterNotices: typeof filterNotices !== 'undefined' ? filterNotices : window.filterNotices,
    toggleNoticeCourses: typeof toggleNoticeCourses !== 'undefined' ? toggleNoticeCourses : window.toggleNoticeCourses,
    togglePublishDate: typeof togglePublishDate !== 'undefined' ? togglePublishDate : window.togglePublishDate,
    onNoticeFileSelected: typeof onNoticeFileSelected !== 'undefined' ? onNoticeFileSelected : window.onNoticeFileSelected,
    clearNoticeFile: typeof clearNoticeFile !== 'undefined' ? clearNoticeFile : window.clearNoticeFile,
    openCreateNotice: typeof openCreateNotice !== 'undefined' ? openCreateNotice : window.openCreateNotice,
    handleSaveNotice: typeof handleSaveNotice !== 'undefined' ? handleSaveNotice : window.handleSaveNotice,
    openNoticeDetails: typeof openNoticeDetails !== 'undefined' ? openNoticeDetails : window.openNoticeDetails,
    openEditNotice: typeof openEditNotice !== 'undefined' ? openEditNotice : window.openEditNotice,
    deleteNoticeAction: typeof deleteNoticeAction !== 'undefined' ? deleteNoticeAction : window.deleteNoticeAction
};
console.log("[ARCHITECTURE]\nnotices loaded");
