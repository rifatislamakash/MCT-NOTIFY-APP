import { _supabase } from './supabase-client.js';
import { crPermissionService } from './services/crPermissionService.js';
import { showGlobalToast, showLoader, forceHideLoader, cancelActiveRequest, fetchWithRetry } from './utils.js';
import { CourseStore } from './stores/CourseStore.js';
import { FacultyStore } from './stores/FacultyStore.js';
import { RoutineStore } from './stores/RoutineStore.js';
import { NotificationStore } from './stores/NotificationStore.js';
import { ProfileStore } from './stores/ProfileStore.js';

        // --- GLOBALS FOR MATERIALS ---
        let currentMaterialsList = [];
        let selectedMaterialIdForEdit = null;
        let currentMaterialFile = null;


        // ----------------- MATERIALS MANAGEMENT LOGIC -----------------

        window.loadMaterials = async function () {
            if (window.isModuleLoading('materials')) return;
            window.setModuleLoading('materials', true);
            cancelActiveRequest('materials');
            const localController = new AbortController();
            window.activeLoadControllers['materials'] = localController;

            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Loading materials...");
            console.log("[MATERIALS] Loading materials list...");
            try {
                let materialsData;

                if (crPermissionService.isCR()) {
                    materialsData = await crPermissionService.getVisibleMaterials();
                } else {
                    materialsData = await fetchWithRetry(async (signal) => {
                        const { data, error } = await _supabase
                            .from('materials')
                            .select('*, courses(course_name, short_name)')
                            .order('created_at', { ascending: false })
                            .abortSignal(signal);

                        if (error) {
                            console.error("[MATERIALS] Supabase fetch error:", error);
                            throw error;
                        }
                        return data;
                    }, 3, 1000, 10000, localController.signal);
                }

                if (localController.signal.aborted) {
                    console.log("[MATERIALS] Fetch aborted, ignoring state updates.");
                    return;
                }

                let materials = materialsData || [];

                if (!crPermissionService.isAdmin() && !crPermissionService.isCR()) {
                    // Normal Student logic (filter by currentUserCoursesList)
                    if (window.currentUserCoursesList.length === 0 && window.authState.user) {
                        const ucData = await fetchWithRetry(async (ucSignal) => {
                            const { data, error } = await _supabase
                                .from('user_courses')
                                .select('*')
                                .eq('user_id', window.authState.user.id)
                                .abortSignal(ucSignal);
                            if (error) throw error;
                            return data;
                        }, 3, 1000, 8000, localController.signal);

                        if (localController.signal.aborted) return;
                        window.currentUserCoursesList = ucData || [];
                    }
                    const myCourseIds = window.currentUserCoursesList.map(uc => uc.course_id);
                    materials = materials.filter(m => myCourseIds.includes(m.course_id));
                }

                const uploaderIds = [...new Set(materials.map(m => m.uploaded_by).filter(Boolean))];
                if (uploaderIds.length > 0) {
                    const { data: profilesData } = await _supabase
                        .from('profiles')
                        .select('id, full_name, profile_url, role')
                        .in('id', uploaderIds);
                    if (profilesData) {
                        materials.forEach(m => {
                            m.profiles = profilesData.find(p => p.id === m.uploaded_by) || null;
                        });
                    }
                }

                window.currentMaterialsList = materials;
                
                console.log(`[MATERIALS] Successfully loaded ${window.currentMaterialsList.length} materials.`);
                const materialIds = window.currentMaterialsList.map(m => m.id);
                if (window.ReactionService) await window.ReactionService.fetchReactionsForContent('material', materialIds);

                renderMaterialsList(window.currentMaterialsList);

                const adminActions = document.getElementById('materials-admin-actions');
                if (adminActions) {
                const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || window.isAdminEmail(window.currentUserEmail));
                if (isAdmin) adminActions.classList.remove('hidden');
                    else adminActions.classList.add('hidden');
                }

                if (typeof window.filterMaterialsUI === 'function') window.filterMaterialsUI();
                if (typeof window.updateDashboardQuickAccessBadges === 'function') window.updateDashboardQuickAccessBadges();

            } catch (err) {
                if (err.name === 'AbortError' || (err.message && err.message.includes('AbortError'))) {
                    console.log("[MATERIALS] Load aborted, ignoring.");
                    if (typeof window.forceHideLoader === 'function') window.forceHideLoader();
                    if (window.isScreenActive('screen-materials-center') && typeof window.navigate === 'function') {
                        /* window.navigate('screen-welcome'); (removed AbortError redirect) */
                    }
                    return;
                }
                console.error("[MATERIALS LOAD ERROR]", err);
                window.showGlobalToast("Error", "Could not load materials.");
            } finally {
                if (window.activeLoadControllers['materials'] === localController) {
                    window.activeLoadControllers['materials'] = null;
                    if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                }
            }
        };

        window.filterMaterialsUI = function () {
            const searchInput = document.getElementById('search-materials');
            const searchVal = searchInput ? searchInput.value.toLowerCase() : '';
            const filterSelect = document.getElementById('materials-filter-type');
            const filterType = filterSelect ? filterSelect.value : 'all';

            let filteredList = window.currentMaterialsList.filter(m => {
                const titleMatch = m.title && m.title.toLowerCase().includes(searchVal);
                const descMatch = m.description && m.description.toLowerCase().includes(searchVal);
                const courseMatch = m.courses && m.courses.course_name && m.courses.course_name.toLowerCase().includes(searchVal);
                const matchesSearch = titleMatch || descMatch || courseMatch;

                const matchesType = filterType === 'all' || m.material_type === filterType;
                return matchesSearch && matchesType;
            });

            if (typeof window.renderMaterialsList === 'function') window.renderMaterialsList(filteredList);
        };

        window.renderMaterialsList = function (materials) {
            const container = document.getElementById('materials-list-container');
            if (!container) return;

            if (materials.length === 0) {
                container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400 bg-white rounded-[16px] border border-slate-100 p-6 shadow-sm">
                            <i data-lucide="folder-open" class="w-10 h-10 mb-2.5 text-slate-300"></i>
                            <p class="text-sm font-bold text-slate-500">No materials available yet</p>
                        </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            container.innerHTML = materials.map(m => {
                const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || window.isAdminEmail(window.currentUserEmail));
                const courseName = (m.courses && (m.courses.short_name || m.courses.course_name)) ? (m.courses.short_name || m.courses.course_name) : 'Unknown Course';

                let iconName, iconBgClass, iconColorClass, badgeClass;

                if (m.material_type === 'link') {
                    iconName = 'link'; iconBgClass = 'bg-blue-50'; iconColorClass = 'text-blue-600'; badgeClass = 'bg-blue-100 text-blue-700';
                } else if (m.material_type === 'software') {
                    iconName = 'box'; iconBgClass = 'bg-emerald-50'; iconColorClass = 'text-emerald-600'; badgeClass = 'bg-emerald-100 text-emerald-700';
                } else { // file/pdf
                    iconName = 'file-text'; iconBgClass = 'bg-red-50'; iconColorClass = 'text-red-500'; badgeClass = 'bg-red-100 text-red-600';
                }

                const badgeText = m.material_type;

                const safeTitle = window.safeFormatRichText(m.title);
                const safeCourse = window.sanitizeHTML(courseName);
                const safeDesc = window.safeFormatRichText(m.description || '');

                let badgeHtml = `<span class="px-[5px] py-[1.5px] rounded-[4px] text-[10px] font-bold tracking-[0.03em] uppercase ${badgeClass}">${badgeText}</span>`;

                let rightSideHtml = `<div class="flex items-center">`;
                rightSideHtml += `<div class="w-7 h-7 rounded-full ${iconBgClass} ${iconColorClass} flex items-center justify-center shrink-0 ml-1">
                                     <i data-lucide="${iconName}" class="w-3.5 h-3.5"></i>
                                  </div>`;
                rightSideHtml += `</div>`;

                let courseTagsHtml = '';
                if (safeCourse && safeCourse !== 'General' && safeCourse !== 'Unknown' && safeCourse !== 'Unknown Course') {
                    courseTagsHtml = `<span class="flex items-center gap-1 text-[10px] font-bold tracking-[0.03em] bg-blue-50 text-blue-600 border border-blue-100 px-[5px] py-[1.5px] rounded-[6px]"><i data-lucide="book" class="w-3 h-3"></i> ${safeCourse}</span>`;
                }

                const createdDate = new Date(m.created_at || Date.now());
                const diffMins = Math.floor((new Date() - createdDate) / 60000);
                let postedTimeStr = '';
                if (diffMins < 1) postedTimeStr = 'Just now';
                else if (diffMins < 60) postedTimeStr = `${diffMins}m ago`;
                else if (diffMins < 1440) postedTimeStr = `${Math.floor(diffMins/60)}h ago`;
                else postedTimeStr = createdDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                const extraBadgesHtml = `${badgeHtml}${courseTagsHtml}`;

                console.log(`[MATERIAL AUTHOR] ID: ${m.id}, Author: ${m.profiles ? m.profiles.full_name : 'Unknown'}`);
                console.log(`[MATERIAL CARD] Title: ${m.title}`);

                return `
                        <div class="flex flex-col w-full max-w-full box-border p-[16px] bg-white rounded-[16px] shadow-sm shadow-slate-200/50 border border-slate-100 mb-2.5 transition-all active:scale-[0.98] cursor-pointer hover:border-[#4226E9]/30 hover:shadow-md relative" onclick="openMaterialDetails('${m.id}')">
                            ${window.AuthorService ? window.AuthorService.renderAuthorBlock(m.profiles, postedTimeStr, extraBadgesHtml, rightSideHtml) : ''}
                            <div class="mt-1 flex flex-col min-w-0">
                                <h4 class="font-[700] text-[16px] text-[#111827] mt-0 truncate leading-tight">${safeTitle}</h4>
                                ${safeDesc ? `<p class="text-[14px] text-[#4b5563] line-clamp-2 overflow-hidden mt-[6px] leading-[1.5] w-full max-w-full box-border break-words">${safeDesc}</p>` : ''}
                            </div>
                            ${isAdmin ? `
                            <div class="flex items-center justify-end mt-1 pt-1.5 border-t border-slate-50">
                                <button onclick="event.stopPropagation(); openUpdateMaterial('${m.id}')" class="px-3 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-[8px] text-[10px] font-bold transition-colors">Edit</button>
                            </div>` : ''}
                            <div class="w-full mt-[10px] !flex !flex-wrap !justify-between !items-center !gap-[8px]">
                                <div class="shrink-0">
                                    ${window.ReactionService ? window.ReactionService.renderReactionBlock('material', m.id) : ''}
                                </div>
                            </div>
                        </div>
                    `;
            }).join('');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };

        window.openMaterialDetails = function (id) {
            const material = window.currentMaterialsList.find(m => m.id === id);
            if (!material) return;

            const titleEl = document.getElementById('md-title');
            const badgeEl = document.getElementById('md-type-badge');
            const courseEl = document.getElementById('md-course');
            const dateEl = document.getElementById('md-date');
            const descCont = document.getElementById('md-description-container');
            const descEl = document.getElementById('md-description');
            const prevCont = document.getElementById('md-preview-container');
            const prevBox = document.getElementById('md-preview-box');
            const actCont = document.getElementById('md-actions');

            if (titleEl) titleEl.innerText = material.title || 'Untitled';

            if (badgeEl) {
                badgeEl.innerText = material.material_type || 'Material';
                badgeEl.className = `px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider shrink-0 ${material.material_type === 'link' ? 'bg-blue-100 text-blue-700' :
                        material.material_type === 'software' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-red-100 text-red-600'
                    }`;
            }

            if (courseEl) courseEl.innerText = (material.courses?.course_name || 'Unknown Course');
            if (dateEl) dateEl.innerText = new Date(material.created_at).toLocaleDateString();

            if (material.description && descCont && descEl) {
                descEl.innerText = material.description;
                descCont.classList.remove('hidden');
            } else if (descCont) {
                descCont.classList.add('hidden');
            }

            // Handle Preview (Image / PDF) inline
            if (prevCont && prevBox) {
                prevBox.innerHTML = '';
                let hasPreview = false;

                if (material.attachment_url) {
                    const urlLower = material.attachment_url.toLowerCase();
                    if (urlLower.match(/\.(jpeg|jpg|png|gif)$/i)) {
                        prevBox.innerHTML = `<img src="${material.attachment_url}" class="max-w-full rounded-xl object-contain max-h-[300px]" alt="Preview" />`;
                        hasPreview = true;
                    } else if (urlLower.match(/\.pdf$/i)) {
                        prevBox.innerHTML = `<iframe src="${material.attachment_url}#toolbar=0" class="w-full h-[300px] rounded-xl border-none"></iframe>`;
                        hasPreview = true;
                    }
                }

                if (hasPreview) prevCont.classList.remove('hidden');
                else prevCont.classList.add('hidden');
            }

            // Bind Actions correctly (Downloads, Links & Admin Delete)
            if (actCont) {
                let btns = '';
                if (material.attachment_url) {
                    const safeAttachment = window.sanitizeUrl(material.attachment_url);
                    btns += `<a href="${safeAttachment}" target="_blank" class="w-full py-3.5 bg-[#4226E9] hover:bg-[#341BC5] text-white rounded-[12px] font-bold text-[15px] shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"><i data-lucide="download" class="w-4 h-4"></i> Download File</a>`;
                }
                if (material.external_link) {
                    const safeExternal = window.sanitizeUrl(material.external_link);
                    btns += `<a href="${safeExternal}" target="_blank" class="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-[12px] font-bold text-[15px] transition-all active:scale-[0.98] flex items-center justify-center gap-2"><i data-lucide="external-link" class="w-4 h-4"></i> Open Link</a>`;
                }
                // Admin-only: Edit and Delete buttons
                const isAdmin = ((window.currentUserRole === 'admin' || window.currentUserRole === 'cr') || window.isAdminEmail(window.currentUserEmail));
                if (isAdmin) {
                    btns += `<div class="flex gap-2 mt-1">
                            <button onclick="openUpdateMaterial('${material.id}')" class="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-[12px] font-bold text-[13px] transition-all active:scale-[0.98] flex items-center justify-center gap-2"><i data-lucide="pencil" class="w-4 h-4"></i> Edit</button>
                            <button onclick="deleteMaterialFromDetails('${material.id}')" class="flex-1 py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-[12px] font-bold text-[13px] transition-all active:scale-[0.98] flex items-center justify-center gap-2"><i data-lucide="trash-2" class="w-4 h-4"></i> Delete</button>
                        </div>`;
                }
                actCont.innerHTML = btns;
            }

            if (window.ReactionService) {
                document.getElementById('md-reaction-container').innerHTML = window.ReactionService.renderReactionBlock('material', id);
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();
            window.navigate('screen-material-details');
        };

        window.checkUploadMaterialForm = function () {
            const course = document.getElementById('upload-material-course')?.value;
            const title = document.getElementById('upload-material-title')?.value.trim();
            const btn = document.getElementById('btn-upload-material-submit');
            if (btn) {
                if (course && title) {
                    btn.classList.remove('hidden');
                } else {
                    btn.classList.add('hidden');
                }
            }
        };

        window.checkUpdateMaterialForm = function () {
            const course = document.getElementById('update-material-course')?.value;
            const title = document.getElementById('update-material-title')?.value.trim();
            const btn = document.getElementById('btn-update-material-submit');
            if (btn) {
                if (course && title) {
                    btn.classList.remove('hidden');
                } else {
                    btn.classList.add('hidden');
                }
            }
        };

        window.loadUploadMaterialDropdowns = async function () {
            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Loading courses...");
            try {
                window.currentCoursesList = await crPermissionService.getVisibleCourses();

                const courseSelect = document.getElementById('upload-material-course');
                if (courseSelect) {
                    courseSelect.innerHTML = '<option value="" disabled selected hidden>Select Course</option>' +
                        window.currentCoursesList.map(c => {
                            const batchName = c.batches ? c.batches.batch_name : c.batch_id;
                            return `<option value="${c.id}">[Batch ${window.sanitizeHTML(batchName)}] ${window.sanitizeHTML(c.course_name)} (${window.sanitizeHTML(c.course_code || c.short_name || '')})</option>`;
                        }).join('');
                }
                const form = document.getElementById('form-upload-material');
                if (form) form.reset();
                const fileDisplay = document.getElementById('upload-file-display');
                if (fileDisplay) {
                    fileDisplay.innerHTML = '';
                    fileDisplay.classList.add('hidden');
                }
                currentMaterialFile = null;
                checkUploadMaterialForm();
            } catch (e) {
                console.error("loadUploadMaterialDropdowns error:", e);
                window.showGlobalToast("Error", "Failed to load courses for upload.");
            } finally {
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
            }
        };

        window.handleMaterialFileChange = function (event, displayId) {
            const fileInput = event.target;
            // FIX: Use files[0] to get the actual File object (not the FileList array)
            const file = fileInput.files && fileInput.files[0];
            const display = document.getElementById(displayId);

            console.log("--- FILE SELECTION DEBUG ---");
            console.log("Selected File Object:", file);

            if (!file) {
                currentMaterialFile = null;
                if (display) {
                    display.innerHTML = '';
                    display.classList.add('hidden');
                }
                return;
            }

            console.log("File Name:", file.name);
            console.log("File Type:", file.type);
            console.log("File Size:", file.size, "bytes");

            const maxSize = 5 * 1024 * 1024; // 5 MB

            if (file.size > maxSize) {
                window.showGlobalToast("File Too Large", "Maximum allowed size is 5 MB.");
                fileInput.value = ''; // Reset input
                currentMaterialFile = null;
                if (display) {
                    display.innerHTML = '';
                    display.classList.add('hidden');
                }
                return;
            }

            const invalidExts = ['exe', 'bat', 'cmd', 'html', 'js', 'sh', 'svg'];
            const ext = file.name.split('.').pop().toLowerCase();
            if (invalidExts.includes(ext) || file.type === 'image/svg+xml' || file.type.includes('javascript') || file.type.includes('html')) {
                window.showGlobalToast("Validation Error", "Executable, HTML, and SVG files are not allowed.");
                fileInput.value = '';
                currentMaterialFile = null;
                if (display) {
                    display.innerHTML = '';
                    display.classList.add('hidden');
                }
                return;
            }

            // File is valid — store and show name + size
            currentMaterialFile = file;
            if (display) {
                const sizeKB = file.size / 1024;
                const sizeDisplay = sizeKB >= 1024
                    ? (sizeKB / 1024).toFixed(2) + ' MB'
                    : sizeKB.toFixed(1) + ' KB';
                display.innerHTML = `
                        <span class="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                            <i data-lucide="file-check" class="w-4 h-4 text-emerald-600 shrink-0"></i>
                            <span class="flex-1 min-w-0">
                                <span class="block font-bold text-emerald-800 truncate text-[12px]">${file.name}</span>
                                <span class="block text-emerald-600 text-[10px] font-medium">${sizeDisplay}</span>
                            </span>
                            <button type="button" onclick="clearMaterialFile('${fileInput.id}', '${displayId}')" class="text-emerald-400 hover:text-red-500 transition-colors ml-1 shrink-0" title="Remove file">
                                <i data-lucide="x" class="w-3.5 h-3.5"></i>
                            </button>
                        </span>
                    `;
                display.classList.remove('hidden');
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        };

        window.clearMaterialFile = function (inputId, displayId) {
            const fileInput = document.getElementById(inputId);
            if (fileInput) fileInput.value = '';
            currentMaterialFile = null;
            const display = document.getElementById(displayId);
            if (display) {
                display.innerHTML = '';
                display.classList.add('hidden');
            }
        };

        let isSubmittingMaterial = false;
        window.handleUploadMaterial = async function (e) {
            e.preventDefault();
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            if (window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') {
                window.showGlobalToast("Access Denied", "Only admins can upload materials.");
                return;
            }
            if (isSubmittingMaterial) return;
            isSubmittingMaterial = true;

            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Uploading material...");
            try {
                const title = document.getElementById('upload-material-title').value.trim();
                const description = document.getElementById('upload-material-description').value.trim();
                const courseId = document.getElementById('upload-material-course').value;
                const type = document.getElementById('upload-material-type').value;
                const section = document.getElementById('upload-material-section').value;
                const link = document.getElementById('upload-material-link').value.trim();

                const course = window.currentCoursesList.find(c => c.id === courseId);
                if (!course || !crPermissionService.canAccessBatch(course.batch_id)) {
                    console.log(`[CR PERMISSION DENIED] Attempted to create material for unassigned course ${courseId}`);
                    window.showGlobalToast("Access Denied", "You can only manage materials for courses in your assigned batches.");
                    isSubmittingMaterial = false;
                    if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                    return;
                }
                if (crPermissionService.isCR()) console.log(`[CR ACCESS CHECK] Validating access for course batch ${course.batch_id} - PASSED`);
                if (crPermissionService.isCR()) console.log(`[CR CREATE] Material for course ${courseId}`);

                console.log("--- UPLOAD MATERIAL DEBUG ---");
                console.log("Form Data:", { title, description, courseId, type, link });

                let attachmentUrl = null;
                let thumbnailUrl = null;

                if (currentMaterialFile) {
                    console.log("Starting file upload to Supabase Storage: bucket 'materials'");
                    const fileExt = currentMaterialFile.name.split('.').pop();
                    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

                    const { data: uploadData, error: uploadError } = await _supabase.storage
                        .from('materials')
                        .upload(fileName, currentMaterialFile);

                    if (uploadError) {
                        console.error("Storage upload error:", uploadError);
                        throw new Error(`File upload failed: ${uploadError.message}`);
                    }

                    console.log("Storage upload response:", uploadData);

                    const { data: urlData } = _supabase.storage.from('materials').getPublicUrl(fileName);
                    attachmentUrl = urlData.publicUrl;
                    console.log("Generated Public URL:", attachmentUrl);

                    if (currentMaterialFile.type.startsWith('image/')) {
                        thumbnailUrl = attachmentUrl;
                    }
                }

                const payload = {
                    title: title,
                    description: description,
                    course_id: courseId,
                    material_type: type,
                    external_link: link,
                    attachment_url: attachmentUrl,
                    thumbnail_url: thumbnailUrl,
                    uploaded_by: window.authState.user.id
                };

                const { data: insertedMaterials, error: insertError } = await _supabase.from('materials').insert([payload]).select();

                if (insertError) {
                    console.error("Database insert error:", insertError);
                    throw insertError;
                }
                const notifyChecked = document.getElementById('mat-notify-users')?.checked;
                if (insertedMaterials && insertedMaterials.length > 0) {
                    const newMaterialId = insertedMaterials[0].id;
                    if (notifyChecked) {
                        try {
                            const targetPayload = {
                                content_type: 'material',
                                content_id: newMaterialId,
                                target_type: 'course_students',
                                target_id: courseId
                            };
                            await _supabase.from('content_targets').insert([targetPayload]);
                            
                            if (window.triggerImmediateNotification) {
                                window.triggerImmediateNotification('material', newMaterialId, 'New Material Added', `A new material ${payload.title} was uploaded.`);
                            }
                        } catch (targetErr) {
                            console.error("[MATERIAL NOTIFY ERROR]", targetErr);
                        }
                    }
                }

                window.showGlobalToast("Success", "Material uploaded successfully!");
                window.navigate('screen-materials-center');
                await loadMaterials();
            } catch (err) {
                console.error("handleUploadMaterial catch error:", err);
                window.showGlobalToast("Error", err.message || "Failed to upload material.");
            } finally {
                isSubmittingMaterial = false;
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
            }
        };

        window.openUpdateMaterial = async function (id) {
            const material = window.currentMaterialsList.find(m => m.id === id);
            if (!material) return;
            selectedMaterialIdForEdit = id;

            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Loading material...");
            try {
                window.currentCoursesList = await crPermissionService.getVisibleCourses();

                const courseSelect = document.getElementById('update-material-course');
                if (courseSelect) {
                    courseSelect.innerHTML = '<option value="" disabled selected hidden>Select Course</option>' +
                        window.currentCoursesList.map(c => {
                            const batchName = c.batches ? c.batches.batch_name : c.batch_id;
                            return `<option value="${c.id}">[Batch ${window.sanitizeHTML(batchName)}] ${window.sanitizeHTML(c.course_name)} (${window.sanitizeHTML(c.course_code || c.short_name || '')})</option>`;
                        }).join('');
                }

                document.getElementById('update-material-course').value = material.course_id || '';
                document.getElementById('update-material-section').value = material.section || 'File';
                document.getElementById('update-material-title').value = material.title || '';
                document.getElementById('update-material-description').value = material.description || '';
                document.getElementById('update-material-type').value = material.material_type || 'file';
                document.getElementById('update-material-link').value = material.external_link || '';

                currentMaterialFile = null;
                const fileDisplay = document.getElementById('update-file-display');
                if (fileDisplay) {
                    fileDisplay.innerHTML = '';
                    fileDisplay.classList.add('hidden');
                }
                const fileInput = document.getElementById('update-material-file');
                if (fileInput) fileInput.value = '';

                const linkEl = document.getElementById('update-current-file-link');
                const hrefEl = document.getElementById('update-current-file-href');
                if (material.attachment_url && linkEl && hrefEl) {
                    linkEl.classList.remove('hidden');
                    hrefEl.href = material.attachment_url;
                } else if (linkEl) {
                    linkEl.classList.add('hidden');
                }

                checkUpdateMaterialForm(); // Check button state

                window.navigate('screen-update-material');
            } catch (e) {
                console.error("openUpdateMaterial error:", e);
                window.showGlobalToast("Error", "Could not load material details.");
            } finally {
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
            }
        };

        window.handleUpdateMaterial = async function (e) {
            e.preventDefault();
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            if (window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') {
                window.showGlobalToast("Access Denied", "Only admins can edit materials.");
                return;
            }
            if (isSubmittingMaterial) return;
            isSubmittingMaterial = true;

            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Updating material...");
            try {
                const title = document.getElementById('update-material-title').value.trim();
                const description = document.getElementById('update-material-description').value.trim();
                const courseId = document.getElementById('update-material-course').value;
                const section = document.getElementById('update-material-section').value;
                const type = document.getElementById('update-material-type').value;
                const link = document.getElementById('update-material-link').value.trim();

                const originalMaterial = window.currentMaterialsList.find(m => m.id === selectedMaterialIdForEdit);
                if (!originalMaterial) throw new Error("Original material not found.");
                
                const origCourse = window.currentCoursesList.find(c => c.id === originalMaterial.course_id);
                const newCourse = window.currentCoursesList.find(c => c.id === courseId);
                
                if (origCourse && !crPermissionService.canAccessBatch(origCourse.batch_id)) {
                    console.log(`[CR PERMISSION DENIED] Attempted to update material from unassigned course`);
                    window.showGlobalToast("Access Denied", "You can only edit materials from your assigned batches.");
                    isSubmittingMaterial = false;
                    if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                    return;
                }
                if (newCourse && !crPermissionService.canAccessBatch(newCourse.batch_id)) {
                    console.log(`[CR PERMISSION DENIED] Attempted to move material to unassigned course`);
                    window.showGlobalToast("Access Denied", "You can only assign materials to courses in your assigned batches.");
                    isSubmittingMaterial = false;
                    if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                    return;
                }
                if (crPermissionService.isCR()) console.log(`[CR ACCESS CHECK] Validating access - PASSED`);
                if (crPermissionService.isCR()) console.log(`[CR UPDATE] Material ${selectedMaterialIdForEdit}`);

                console.log("--- UPDATE MATERIAL DEBUG ---");
                console.log("Update Form Data:", { title, description, courseId, section, type, link });

                let payload = {
                    title: title,
                    description: description,
                    course_id: courseId,
                    material_type: type,
                    external_link: link
                };

                if (currentMaterialFile) {
                    console.log("Starting file replacement upload to Supabase Storage: bucket 'materials'");
                    
                    const existingMaterial = window.currentMaterialsList.find(m => m.id === selectedMaterialIdForEdit);
                    if (existingMaterial && existingMaterial.attachment_url) {
                        try {
                            const urlParts = existingMaterial.attachment_url.split('/materials/');
                            if (urlParts.length > 1) {
                                const storagePath = urlParts[1].split('?')[0];
                                await _supabase.storage.from('materials').remove([storagePath]);
                                console.log("Removed old orphaned material file:", storagePath);
                            }
                        } catch(e) {
                            console.warn("Failed to clean up old file:", e);
                        }
                    }

                    const fileExt = currentMaterialFile.name.split('.').pop();
                    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

                    const { data: uploadData, error: uploadError } = await _supabase.storage
                        .from('materials')
                        .upload(fileName, currentMaterialFile);

                    if (uploadError) {
                        console.error("Storage upload error:", uploadError);
                        throw new Error(`File upload failed: ${uploadError.message}`);
                    }

                    const { data: urlData } = _supabase.storage.from('materials').getPublicUrl(fileName);
                    payload.attachment_url = urlData.publicUrl;
                    console.log("Generated New Public URL:", payload.attachment_url);

                    if (currentMaterialFile.type.startsWith('image/')) {
                        payload.thumbnail_url = urlData.publicUrl;
                    }
                }

                console.log("Final DB Update Payload:", payload);

                const { error: updateError } = await _supabase
                    .from('materials')
                    .update(payload)
                    .eq('id', selectedMaterialIdForEdit);

                if (updateError) {
                    console.error("Database update error:", updateError);
                    throw updateError;
                }

                window.showGlobalToast("Success", "Material updated successfully!");
                window.navigate('screen-materials-center');
                await loadMaterials();
            } catch (err) {
                console.error("handleUpdateMaterial catch error:", err);
                window.showGlobalToast("Error", err.message || "Failed to update material.");
            } finally {
                isSubmittingMaterial = false;
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
            }
        };

        window.deleteMaterialAction = async function () {
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            if (window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') { window.showGlobalToast("Access Denied", "Only admins can delete materials."); return; }
            if (!confirm("Delete this material? This will also permanently remove any attached file from storage.")) return;
            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Deleting material...");
            try {
                // 1. Fetch the material record to get its attachment_url before deleting
                const material = window.currentMaterialsList.find(m => m.id === selectedMaterialIdForEdit);

                // CR Batch Validation
                if (material) {
                    let courseBatchId = null;
                    if (window.currentCoursesList) {
                        const c = window.currentCoursesList.find(c => c.id === material.course_id);
                        if (c) courseBatchId = c.batch_id;
                    }
                    if (!courseBatchId) {
                        const { data: cData } = await _supabase.from('courses').select('batch_id').eq('id', material.course_id).single();
                        if (cData) courseBatchId = cData.batch_id;
                    }
                    if (courseBatchId && !crPermissionService.canAccessBatch(courseBatchId)) {
                        console.log(`[CR PERMISSION DENIED] Attempted to delete material for unassigned batch`);
                        window.showGlobalToast("Access Denied", "You can only delete materials from your assigned batches.");
                        if (typeof window.showLoader !== 'undefined') window.showLoader(false);
                        return;
                    }
                    if (crPermissionService.isCR()) console.log(`[CR ACCESS CHECK] Validating access - PASSED`);
                    if (crPermissionService.isCR()) console.log(`[CR DELETE] Material ${material.id}`);
                }

                // 2. If an attachment_url exists, extract the storage file path and delete it from the bucket
                if (material && material.attachment_url) {
                    try {
                        // Extract the file name from the public URL
                        // Public URL format: .../storage/v1/object/public/materials/<filename>
                        const urlParts = material.attachment_url.split('/materials/');
                        if (urlParts.length > 1) {
                            const storagePath = urlParts[1].split('?')[0]; // strip query params if any
                            console.log("Deleting storage file:", storagePath);
                            const { error: storageError } = await _supabase.storage
                                .from('materials')
                                .remove([storagePath]);
                            if (storageError) {
                                console.warn("Storage deletion warning (non-fatal):", storageError.message);
                                // Non-fatal: proceed to delete DB record even if storage delete fails
                            } else {
                                console.log("Storage file deleted successfully.");
                            }
                        }
                    } catch (storageErr) {
                        console.warn("Storage delete error (non-fatal):", storageErr);
                    }
                }

                // Task 2: Delete reminders from notification_reminders
                try {
                    console.log("[MATERIAL DELETE] Deleting matching reminders...");
                    const { error: remError } = await _supabase.from('notification_reminders').delete().eq('parent_id', selectedMaterialIdForEdit);
                    if (remError) {
                        console.error("[MATERIAL DELETE] Error deleting reminders:", remError);
                    } else {
                        console.log("[MATERIAL DELETE] Reminders deleted successfully.");
                    }
                } catch (remErr) {
                    console.error("[MATERIAL DELETE] Exception during reminders delete:", remErr);
                }

                // Step 2.1: Delete content_reactions
                console.log("[MATERIAL DELETE] Deleting content_reactions relations...");
                try {
                    await _supabase.from('content_reactions').delete().eq('content_type', 'material').eq('content_id', selectedMaterialIdForEdit);
                } catch (e) { console.warn("[MATERIAL DELETE] Reactions cleanup error:", e); }

                // 3. Delete the database record
                const { error } = await _supabase.from('materials').delete().eq('id', selectedMaterialIdForEdit);
                if (error) throw error;

                window.showGlobalToast("Deleted", "Material and file removed successfully.");
                window.navigate('screen-materials-center');
                await loadMaterials();
            } catch (err) {
                console.error("deleteMaterialAction error:", err);
                window.showGlobalToast("Error", "Failed to delete material.");
            } finally {
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
            }
        };

        // Delete directly from the material details screen (admin shortcut)
        window.deleteMaterialFromDetails = async function (materialId) {
            if (!(await window.verifyAdminStatus())) { window.showGlobalToast("Error", "Admin check failed."); return; }
            if (window.currentUserRole !== 'admin' && window.currentUserRole !== 'cr') { window.showGlobalToast("Access Denied", "Only admins can delete materials."); return; }
            if (!confirm("Delete this material? This will also permanently remove any attached file from storage.")) return;
            const material = window.currentMaterialsList.find(m => m.id === materialId);
            if (!material) { window.showGlobalToast("Error", "Material not found."); return; }
            
            // CR Batch Validation
            let courseBatchId = null;
            if (window.currentCoursesList) {
                const c = window.currentCoursesList.find(c => c.id === material.course_id);
                if (c) courseBatchId = c.batch_id;
            }
            if (!courseBatchId) {
                const { data: cData } = await _supabase.from('courses').select('batch_id').eq('id', material.course_id).single();
                if (cData) courseBatchId = cData.batch_id;
            }
            if (courseBatchId && !crPermissionService.canAccessBatch(courseBatchId)) {
                console.log(`[CR PERMISSION DENIED] Attempted to delete material for unassigned batch`);
                window.showGlobalToast("Access Denied", "You can only delete materials from your assigned batches.");
                return;
            }
            if (window.crPermissionService && window.crPermissionService.isCR()) console.log(`[CR ACCESS CHECK] Validating access - PASSED`);
            if (window.crPermissionService && window.crPermissionService.isCR()) console.log(`[CR DELETE] Material ${material.id}`);
            selectedMaterialIdForEdit = materialId;
            if (typeof window.showLoader !== 'undefined') window.showLoader(true, "Deleting material...");
            try {
                if (material.attachment_url) {
                    try {
                        const urlParts = material.attachment_url.split('/materials/');
                        if (urlParts.length > 1) {
                            const storagePath = urlParts[1].split('?')[0];
                            await _supabase.storage.from('materials').remove([storagePath]);
                        }
                    } catch (storageErr) {
                        console.warn("Storage delete error (non-fatal):", storageErr);
                    }
                }
                // Task 2: Delete reminders from notification_reminders
                try {
                    console.log("[MATERIAL DELETE DETAILS] Deleting matching reminders...");
                    const { error: remError } = await _supabase.from('notification_reminders').delete().eq('parent_id', materialId);
                    if (remError) {
                        console.error("[MATERIAL DELETE DETAILS] Error deleting reminders:", remError);
                    } else {
                        console.log("[MATERIAL DELETE DETAILS] Reminders deleted successfully.");
                    }
                } catch (remErr) {
                    console.error("[MATERIAL DELETE DETAILS] Exception during reminders delete:", remErr);
                }

                // Step 2.1: Delete content_reactions
                console.log("[MATERIAL DELETE DETAILS] Deleting content_reactions relations...");
                try {
                    await _supabase.from('content_reactions').delete().eq('content_type', 'material').eq('content_id', materialId);
                } catch (e) { console.warn("[MATERIAL DELETE DETAILS] Reactions cleanup error:", e); }

                const { error } = await _supabase.from('materials').delete().eq('id', materialId);
                if (error) throw error;
                window.showGlobalToast("Deleted", "Material and file removed successfully.");
                window.navigate('screen-materials-center');
                await loadMaterials();
            } catch (err) {
                console.error("deleteMaterialFromDetails error:", err);
                window.showGlobalToast("Error", "Failed to delete material.");
            } finally {
                if (typeof window.showLoader !== 'undefined') window.showLoader(false);
            }
        };



export const MaterialsService = {
    loadMaterials: typeof loadMaterials !== 'undefined' ? loadMaterials : window.loadMaterials,
    filterMaterialsUI: typeof filterMaterialsUI !== 'undefined' ? filterMaterialsUI : window.filterMaterialsUI,
    renderMaterialsList: typeof renderMaterialsList !== 'undefined' ? renderMaterialsList : window.renderMaterialsList,
    openMaterialDetails: typeof openMaterialDetails !== 'undefined' ? openMaterialDetails : window.openMaterialDetails,
    checkUploadMaterialForm: typeof checkUploadMaterialForm !== 'undefined' ? checkUploadMaterialForm : window.checkUploadMaterialForm,
    checkUpdateMaterialForm: typeof checkUpdateMaterialForm !== 'undefined' ? checkUpdateMaterialForm : window.checkUpdateMaterialForm,
    loadUploadMaterialDropdowns: typeof loadUploadMaterialDropdowns !== 'undefined' ? loadUploadMaterialDropdowns : window.loadUploadMaterialDropdowns,
    handleMaterialFileChange: typeof handleMaterialFileChange !== 'undefined' ? handleMaterialFileChange : window.handleMaterialFileChange,
    clearMaterialFile: typeof clearMaterialFile !== 'undefined' ? clearMaterialFile : window.clearMaterialFile,
    handleUploadMaterial: typeof handleUploadMaterial !== 'undefined' ? handleUploadMaterial : window.handleUploadMaterial,
    openUpdateMaterial: typeof openUpdateMaterial !== 'undefined' ? openUpdateMaterial : window.openUpdateMaterial,
    handleUpdateMaterial: typeof handleUpdateMaterial !== 'undefined' ? handleUpdateMaterial : window.handleUpdateMaterial,
    deleteMaterialAction: typeof deleteMaterialAction !== 'undefined' ? deleteMaterialAction : window.deleteMaterialAction,
    deleteMaterialFromDetails: typeof deleteMaterialFromDetails !== 'undefined' ? deleteMaterialFromDetails : window.deleteMaterialFromDetails
};
console.log("[ARCHITECTURE]\nmaterials loaded");
