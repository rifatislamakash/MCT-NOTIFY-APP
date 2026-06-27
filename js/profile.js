import { _supabase } from './supabase-client.js';
import { showGlobalToast, showLoader, forceHideLoader, cancelActiveRequest, deduplicateRequest, extractIdFromEmail } from './utils.js';
import { CourseStore } from './stores/CourseStore.js';
import { FacultyStore } from './stores/FacultyStore.js';
import { RoutineStore } from './stores/RoutineStore.js';
import { NotificationStore } from './stores/NotificationStore.js';
import { ProfileStore } from './stores/ProfileStore.js';

        export async function populateProfileDetails() {
            try {
                const profile = window.authState.profile || {
                    full_name: "Loading...",
                    email: "loading@diu.edu.bd",
                    role: "student"
                };

                const emailStr = String(profile?.email || 'alex@diu.edu.bd').trim();
                const studentId = extractIdFromEmail(emailStr);

                const displayNameEl = document.getElementById('profile-display-name');
                if (displayNameEl) displayNameEl.innerText = profile?.full_name || 'Alex Johnson';

                const userEmailEl = document.getElementById('profile-user-email');
                if (userEmailEl) userEmailEl.innerText = emailStr;

                const userPhoneEl = document.getElementById('profile-user-phone');
                if (userPhoneEl) userPhoneEl.innerText = profile?.phone_number || 'Not Set';

                const idElement = document.getElementById('profile-user-id');
                if (idElement) {
                    idElement.innerText = studentId;
                    idElement.className = "text-xs font-bold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis block max-w-full";
                }

                const roleBadge = document.getElementById('profile-user-role');
                const avatarImg = document.getElementById('profile-avatar');
                const fallbackAvatar = document.getElementById('profile-fallback-avatar');

                // Calculate actual DB values for courses/credits
                if (window.authState.user) {
                    cancelActiveRequest('profile');
                    const localController = new AbortController();
                    window.activeLoadControllers = window.activeLoadControllers || {};
                    window.activeLoadControllers['profile'] = localController;

                    try {
                        let ucData = [];
                        const isAdminCheck = window.currentUserRole === 'admin' || window.isAdminEmail(emailStr);
                        if (!isAdminCheck) {
                            const coursesPromise = deduplicateRequest('user_courses_boot', async () => {
                                const sdkController = new AbortController();
                                const sdkPromise = _supabase.from('user_courses').select('*').eq('user_id', window.authState.user.id).abortSignal(sdkController.signal);
                                const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('sdk_timeout')), 2000));
                                try {
                                    const { data, error } = await Promise.race([sdkPromise, timeout]);
                                    if (error) throw error;
                                    return data;
                                } catch (e) {
                                    if (e.message === 'sdk_timeout') {
                                        sdkController.abort();
                                        const url = `${_supabase.supabaseUrl}/rest/v1/user_courses?user_id=eq.${window.authState.user.id}&select=*`;
                                        const res = await fetch(url, {
                                            headers: {
                                                'apikey': _supabase.supabaseKey,
                                                'Authorization': `Bearer ${window.authState?.session?.access_token || _supabase.supabaseKey}`,
                                                'cache-control': 'no-cache'
                                            },
                                            cache: 'no-store',
                                            signal: localController.signal
                                        });
                                        const fetchResult = await res.json();
                                        if (fetchResult.error) throw new Error(fetchResult.error.message);
                                        return fetchResult;
                                    }
                                    throw e;
                                }
                            });
                            ucData = await coursesPromise;
                        }

                        if (localController.signal.aborted) return;

                        const courseIds = (ucData || []).map(u => u.course_id);
                        const coursesCountEl = document.getElementById('profile-courses-count');
                        const creditsCountEl = document.getElementById('profile-credits-count');

                        if (coursesCountEl) coursesCountEl.innerText = courseIds.length;

                        if (courseIds.length > 0) {
                            const sdkController = new AbortController();
                            const coursesInfoPromise = _supabase.from('courses').select('total_credit').in('id', courseIds).abortSignal(sdkController.signal);
                            let cData;
                            try {
                                if (window._supabaseSdkFailing) throw new Error('sdk_timeout');
                                let timerId;
                                const timeoutPromise = new Promise((_, reject) => {
                                    timerId = setTimeout(() => reject(new Error('sdk_timeout')), 8000);
                                });
                                try {
                                    const { data, error } = await Promise.race([coursesInfoPromise, timeoutPromise]);
                                    if (error) throw error;
                                    cData = data;
                                console.log("[PROFILE] [SDK SUCCESS]");
                            console.log(`[PROFILE] [SDK DURATION] ${Math.round(performance.now() - startSdk)}ms`);
                        } finally {
                            clearTimeout(timerId);
                        }
                            } catch (e) {
                                if (e.message === 'sdk_timeout') {
                                    sdkController.abort();
                                    window._supabaseSdkFailing = true;
                                    const inList = courseIds.map(id => `"${id}"`).join(',');
                                    const url = `${_supabase.supabaseUrl}/rest/v1/courses?id=in.(${inList})&select=total_credit`;
                                    const res = await fetch(url, {
                                        headers: {
                                            'apikey': _supabase.supabaseKey,
                                            'Authorization': `Bearer ${window.authState?.session?.access_token || _supabase.supabaseKey}`,
                                            'cache-control': 'no-cache'
                                        },
                                        cache: 'no-store',
                                        signal: localController.signal
                                    });
                                    const fetchResult = await res.json();
                                    if (fetchResult.error) throw new Error(fetchResult.error.message);
                                    cData = fetchResult;
                                } else {
                                    throw e;
                                }
                            }

                            if (localController.signal.aborted) return;

                            const totalCredits = (cData || []).reduce((sum, c) => sum + (c.total_credit || 0), 0);
                            if (creditsCountEl) creditsCountEl.innerText = totalCredits;
                        } else {
                            if (creditsCountEl) creditsCountEl.innerText = 0;
                        }
                    } catch (err) {
                        if (err.name === 'AbortError' || (err.message && err.message.includes('AbortError'))) {
                            console.log("[PROFILE] Load aborted, resetting to welcome screen.");
                            if (typeof window.forceHideLoader === 'function') window.forceHideLoader();
                            if (typeof window.isScreenActive === 'function' && window.isScreenActive('screen-profile') && typeof window.navigate === 'function') {
                                /* window.navigate('screen-welcome'); (removed AbortError redirect) */
                            }
                            return;
                        }
                        console.error("[PROFILE LOAD ERROR]", err);
                    } finally {
                        if (window.activeLoadControllers && window.activeLoadControllers['profile'] === localController) {
                            window.activeLoadControllers['profile'] = null;
                        }
                    }
                }

                const role = String(profile?.role || '').toLowerCase();
                if (role === 'admin' || window.isAdminEmail(emailStr)) {
                    if (roleBadge) {
                        roleBadge.innerText = "Administrator";
                        roleBadge.className = "inline-block text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-[#4226E9] px-2.5 py-0.5 rounded-full";
                        console.log(`[PROFILE ROLE DISPLAY] Administrator`);
                    }
                } else if (role === 'cr') {
                    if (roleBadge) {
                        roleBadge.innerText = "Class Representative";
                        roleBadge.className = "inline-block text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full";
                        
                        try {
                            if (window.authState?.user) {
                                const { data: crBatches, error } = await _supabase
                                    .from('batch_crs')
                                    .select('batches(batch_name)')
                                    .eq('user_id', window.authState.user.id)
                                    .eq('active', true);
                                
                                if (!error && crBatches && crBatches.length > 0) {
                                    const batchNames = crBatches.map(b => b.batches?.batch_name).filter(n => n).join(', ');
                                    if (batchNames) {
                                        roleBadge.innerText = `CR • ${batchNames}`;
                                        console.log(`[PROFILE ROLE DISPLAY] CR Batches: ${batchNames}`);
                                    }
                                }
                            }
                        } catch(e) {
                            console.warn('[CR BATCH LOOKUP ERROR]', e);
                        }
                    }
                } else {
                    if (roleBadge) {
                        roleBadge.innerText = "DIU MCT Student";
                        roleBadge.className = "inline-block text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full";
                        console.log(`[PROFILE ROLE DISPLAY] DIU MCT Student`);
                    }
                }

                if (profile?.profile_url) {
                    if (avatarImg) {
                        avatarImg.src = profile.profile_url;
                        avatarImg.classList.remove('hidden');
                    }
                    if (fallbackAvatar) fallbackAvatar.classList.add('hidden');
                } else {
                    if (avatarImg) avatarImg.classList.add('hidden');
                    if (fallbackAvatar) fallbackAvatar.classList.remove('hidden');
                }

                if (typeof window.renderSecondaryBatchesUI === 'function') {
                    window.renderSecondaryBatchesUI();
                }

                // Show/hide notification alert
                const alertEl = document.getElementById('profile-notification-alert');
                if (alertEl) {
                    if (window.Notification && Notification.permission !== 'granted') {
                        alertEl.classList.remove('hidden');
                    } else {
                        alertEl.classList.add('hidden');
                    }
                }

                // Show/hide manual trigger buttons
                const manualInstallBtn = document.getElementById('manual-install-btn');
                if (manualInstallBtn) {
                    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
                    if (isStandalone) {
                        manualInstallBtn.classList.add('hidden');
                    } else {
                        manualInstallBtn.classList.remove('hidden');
                    }
                }

                const manualNotifBtn = document.getElementById('manual-notif-btn');
                if (manualNotifBtn) {
                    if (window.Notification && (Notification.permission === 'granted' || Notification.permission === 'denied')) {
                        manualNotifBtn.classList.add('hidden');
                    } else {
                        manualNotifBtn.classList.remove('hidden');
                    }
                }

            } catch (err) {
                console.error("Profile populate error:", err);
            }

            if (typeof window.checkCRRequestStatus === 'function') {
                const role = String(window.authState?.profile?.role || '').toLowerCase();
                window.checkCRRequestStatus(role);
            }
            
            // Initialization calls like silentNotificationInit removed to prevent lifecycle loops
        }



        // ----------------- PROFILE PICTURE SYSTEM -----------------
        let currentCropper = null;
        let currentProfilePictureFile = null;

        window.openProfilePictureModal = function () {
            const modal = document.getElementById('modal-profile-picture');
            const content = document.getElementById('modal-profile-picture-content');

            resetProfilePictureModal();
            updateProfilePictureModalView();

            modal.classList.remove('opacity-0', 'pointer-events-none');
            setTimeout(() => {
                content.classList.remove('translate-y-full', 'sm:translate-y-0', 'sm:scale-90');
            }, 10);
        };

        window.closeProfilePictureModal = function () {
            const modal = document.getElementById('modal-profile-picture');
            const content = document.getElementById('modal-profile-picture-content');
            content.classList.add('translate-y-full', 'sm:translate-y-0', 'sm:scale-90');
            setTimeout(() => {
                modal.classList.add('opacity-0', 'pointer-events-none');
                resetProfilePictureModal();
            }, 350);
        };

        function resetProfilePictureModal() {
            if (currentCropper) {
                currentCropper.destroy();
                currentCropper = null;
            }
            currentProfilePictureFile = null;
            document.getElementById('pp-file-input').value = '';

            document.getElementById('pp-cropper-container').classList.add('hidden');
            document.getElementById('pp-current-view').classList.remove('hidden');

            document.getElementById('pp-btn-select').classList.remove('hidden');
            document.getElementById('pp-btn-crop').classList.add('hidden');
            document.getElementById('pp-btn-cancel-crop').classList.add('hidden');
            document.getElementById('pp-btn-delete').classList.remove('hidden');

            const profileUrl = window.authState.profile?.profile_url;
            if (!profileUrl) {
                document.getElementById('pp-btn-delete').classList.add('hidden');
            }
        }

        function updateProfilePictureModalView() {
            const avatarContainer = document.getElementById('pp-current-avatar');
            const profileUrl = window.authState.profile?.profile_url;

            if (profileUrl) {
                avatarContainer.innerHTML = `<img src="${profileUrl}" class="w-full h-full object-cover">`;
            } else {
                const name = window.authState.profile?.full_name || 'User';
                const initial = name.charAt(0).toUpperCase();
                avatarContainer.innerHTML = initial;
            }
        }

        window.cancelCrop = function () {
            resetProfilePictureModal();
            updateProfilePictureModalView();
        };

        document.getElementById('pp-file-input')?.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;

            const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
            if (!validMimes.includes(file.type)) {
                window.showGlobalToast("Error", "Only JPG, PNG, and WEBP image files are allowed.");
                return;
            }

            const reader = new FileReader();
            reader.onload = function (event) {
                const imgEl = document.getElementById('pp-cropper-image');
                imgEl.src = event.target.result;

                document.getElementById('pp-current-view').classList.add('hidden');
                document.getElementById('pp-cropper-container').classList.remove('hidden');

                document.getElementById('pp-btn-select').classList.add('hidden');
                document.getElementById('pp-btn-delete').classList.add('hidden');
                document.getElementById('pp-btn-crop').classList.remove('hidden');
                document.getElementById('pp-btn-cancel-crop').classList.remove('hidden');

                if (currentCropper) {
                    currentCropper.destroy();
                }

                currentCropper = new Cropper(imgEl, {
                    aspectRatio: 1,
                    viewMode: 1,
                    autoCropArea: 1,
                });
            };
            reader.readAsDataURL(file);
        });

        window.handleCropAndUpload = async function () {
            if (!currentCropper || !window.authState.user) return;

            window.showLoader(true, "Uploading profile picture...");
            try {
                const canvas = currentCropper.getCroppedCanvas({
                    width: 400,
                    height: 400
                });

                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        window.showLoader(false);
                        window.showGlobalToast("Error", "Failed to crop image (canvas returned null).");
                        return;
                    }
                    if (blob.size > 2 * 1024 * 1024) {
                        window.showLoader(false);
                        window.showGlobalToast("Error", "Image is too large. Cropped file must be under 2MB.");
                        return;
                    }

                    try {
                        const fileName = `${window.authState.user.id}_${Date.now()}.jpg`;

                        if (window.authState.profile?.profile_url) {
                            try {
                                const match = window.authState.profile.profile_url.match(/\/(users_pp|avatars)\/(.+)$/);
                                if (match) {
                                    const oldBucket = match[1];
                                    const oldFileName = match[2];
                                    await _supabase.storage.from(oldBucket).remove([oldFileName]);
                                    console.log("[PROFILE IMAGE] Deleted old image:", oldFileName);
                                }
                            } catch (e) {
                                console.warn("[PROFILE IMAGE] Failed to delete old image:", e);
                            }
                        }

                        const { data: uploadData, error: uploadError } = await _supabase.storage
                            .from('users_pp')
                            .upload(fileName, blob, {
                                contentType: 'image/jpeg',
                                upsert: true
                            });

                        if (uploadError) throw uploadError;

                        const { data: urlData } = _supabase.storage.from('users_pp').getPublicUrl(fileName);
                        const publicUrl = urlData.publicUrl;
                        console.log("[PROFILE IMAGE] Uploaded new image:", publicUrl);

                        const { error: dbError } = await _supabase
                            .from('profiles')
                            .update({ profile_url: publicUrl })
                            .eq('id', window.authState.user.id);

                        if (dbError) throw dbError;

                        if (window.authState.profile) {
                            window.authState.profile.profile_url = publicUrl;
                        }

                        updateGlobalAvatars();
                        closeProfilePictureModal();
                        window.showGlobalToast("Success", "Profile picture updated successfully.");

                    } catch (err) {
                        console.error("[PROFILE IMAGE] UPLOAD ERROR:", err);
                        window.showGlobalToast("Error", "Failed to upload profile picture.");
                    } finally {
                        window.showLoader(false);
                    }
                }, 'image/jpeg', 0.85);

            } catch (err) {
                window.showLoader(false);
                console.error("[CROP ERROR]", err);
                window.showGlobalToast("Error", "Failed to crop image.");
            }
        };

        window.handleDeleteProfilePicture = async function () {
            const profileUrl = window.authState.profile?.profile_url;
            if (!profileUrl) return;
            if (!confirm("Are you sure you want to remove your profile picture?")) return;

            window.showLoader(true, "Removing profile picture...");
            try {
                const fileNameMatch = profileUrl.match(/\/(users_pp|avatars)\/(.+)$/);

                if (fileNameMatch) {
                    const bucket = fileNameMatch[1];
                    const fileName = fileNameMatch[2];
                    await _supabase.storage.from(bucket).remove([fileName]);
                }

                await _supabase
                    .from('profiles')
                    .update({ profile_url: null })
                    .eq('id', window.authState.user.id);

                if (window.authState.profile) {
                    window.authState.profile.profile_url = null;
                }

                updateGlobalAvatars();
                closeProfilePictureModal();
                window.showGlobalToast("Success", "Profile picture removed.");

            } catch (err) {
                console.error("[PROFILE PIC DELETE ERROR]", err);
                window.showGlobalToast("Error", "Failed to remove profile picture.");
            } finally {
                window.showLoader(false);
            }
        };

        window.updateGlobalAvatars = function () {
            const containers = document.querySelectorAll('.global-user-avatar-container');
            const profileUrl = window.authState.profile?.profile_url;
            const name = window.authState.profile?.full_name || 'User';
            const initial = name.charAt(0).toUpperCase();
            const needsPermission = (window.Notification && Notification.permission !== 'granted');

            const hash = `${profileUrl}|${name}|${needsPermission}`;
            if (window.__LAST_AVATAR_HASH === hash) {
                console.log("[PROFILE RENDER] Avatar unchanged, skipping repaint.");
                return;
            }
            window.__LAST_AVATAR_HASH = hash;

            console.log(`[PROFILE IMAGE RENDER] Updating ${containers.length} avatar containers. profileUrl: ${profileUrl || 'null'}`);

            containers.forEach(container => {
                if (container.closest('nav') || container.closest('#desktop-sidebar')) {
                    console.log("[NAVBAR PROFILE] Updating navbar/sidebar avatar");
                } else {
                    console.log("[DASHBOARD PROFILE] Updating dashboard/other avatar");
                }

                let contentHtml = '';
                if (profileUrl) {
                    const safeUrl = window.sanitizeUrl(profileUrl);
                    contentHtml = `<img src="${safeUrl}" class="w-full h-full rounded-full object-cover" onerror="this.outerHTML='<span class=\\'font-bold text-[18px] text-[#4226E9]\\'>${initial}</span>'">`;
                } else {
                    contentHtml = `<span class="font-bold text-[18px] text-[#4226E9]">${initial}</span>`;
                }

                if (needsPermission) {
                    container.innerHTML = `
                        <div class="relative w-full h-full flex items-center justify-center">
                            <div class="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-indigo-50">
                                ${contentHtml}
                            </div>
                            <div class="absolute inset-[-4px] rounded-full border-2 border-red-500 animate-pulse pointer-events-none"></div>
                        </div>
                    `;
                    container.classList.remove('overflow-hidden');
                } else {
                    container.innerHTML = contentHtml;
                    container.classList.add('overflow-hidden');
                }
            });

            // Sync main profile screen details removed to prevent render loops

            // Re-render student lists if they are open
            if (typeof window.isScreenActive === 'function' && window.isScreenActive('screen-admin-students') && typeof window.renderAdminStudents === 'function') {
                window.renderAdminStudents();
            }
        };




        function openPhoneEditModal() {
            const modal = document.getElementById('modal-phone-edit');
            const content = document.getElementById('modal-phone-edit-content');
            const phoneStr = (window.authState.profile && window.authState.profile.phone_number) || '';
            document.getElementById('edit-phone-input').value = phoneStr;
            document.getElementById('edit-phone-error').classList.add('hidden');
            
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('translate-y-full');
            }, 10);
        }



        window.closePhoneEditModal = function () {
            const modal = document.getElementById('modal-phone-edit');
            const content = document.getElementById('modal-phone-edit-content');
            modal.classList.add('opacity-0');
            content.classList.add('translate-y-full');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        }



        export async function savePhoneEdit() {
            const phoneInput = document.getElementById('edit-phone-input');
            const phone = phoneInput.value.trim();
            const errorText = document.getElementById('edit-phone-error');
            
            if (!/^01\d{9}$/.test(phone)) {
                errorText.classList.remove('hidden');
                return;
            }
            errorText.classList.add('hidden');
            
            if (!window.authState.user) return;
            
            if (typeof window.showLoader === 'function') window.showLoader(true, "Updating profile...");
            try {
                const { error } = await _supabase.from('profiles').update({ phone_number: phone }).eq('id', window.authState.user.id);
                if (error) throw error;
                
                if (window.authState.profile) window.authState.profile.phone_number = phone;
                document.getElementById('profile-user-phone').innerText = phone;
                
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Success", "Phone number updated successfully!");
                closePhoneEditModal();
            } catch (err) {
                console.error("[PROFILE] Error updating phone:", err);
                if (typeof window.showGlobalToast === 'function') window.showGlobalToast("Error", "Could not update phone number.");
            } finally {
                if (typeof window.showLoader === 'function') window.showLoader(false);
            }
        }

        window.promptEditName = async function() {
            if (!window.authState.user) return;
            const currentName = window.authState.profile?.full_name || '';
            const newName = prompt("Enter your new full name:", currentName);
            if (newName === null) return;
            const trimmedName = newName.trim();
            if (!trimmedName) {
                window.showGlobalToast("Validation Error", "Name cannot be empty.");
                return;
            }
            if (trimmedName === currentName) return;

            window.showLoader(true, "Updating name...");
            try {
                const { error } = await _supabase.from('profiles').update({ full_name: trimmedName }).eq('id', window.authState.user.id);
                if (error) throw error;
                if (window.authState.profile) window.authState.profile.full_name = trimmedName;
                document.getElementById('profile-display-name').innerText = trimmedName;
                window.updateGlobalAvatars();
                window.showGlobalToast("Success", "Name updated successfully.");
            } catch (err) {
                console.error("[PROFILE] Error updating name:", err);
                window.showGlobalToast("Error", "Could not update name.");
            } finally {
                window.showLoader(false);
            }
        };

        // ===== UNIFIED EDIT PROFILE SCREEN =====

        window.populateEditProfileForm = function() {
            const profile = window.authState.profile || {};

            // Populate name
            const nameInput = document.getElementById('edit-profile-name');
            if (nameInput) nameInput.value = profile.full_name || '';

            // Populate phone
            const phoneInput = document.getElementById('edit-profile-phone');
            if (phoneInput) phoneInput.value = profile.phone_number || '';

            // Populate email (read-only)
            const emailInput = document.getElementById('edit-profile-email');
            if (emailInput) emailInput.value = profile.email || '';

            // Populate avatar preview
            const previewImg = document.getElementById('edit-profile-avatar-preview');
            const fallbackIcon = document.getElementById('edit-profile-fallback');
            const removeBtn = document.getElementById('btn-remove-edit-photo');

            if (profile.profile_url) {
                if (previewImg) {
                    previewImg.src = profile.profile_url;
                    previewImg.classList.remove('hidden');
                }
                if (fallbackIcon) fallbackIcon.classList.add('hidden');
                if (removeBtn) removeBtn.classList.remove('hidden');
            } else {
                if (previewImg) {
                    previewImg.src = '';
                    previewImg.classList.add('hidden');
                }
                if (fallbackIcon) fallbackIcon.classList.remove('hidden');
                if (removeBtn) removeBtn.classList.add('hidden');
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();
        };

        window.handleSaveProfile = async function(e) {
            e.preventDefault();
            if (!window.authState.user) return;

            const newName = document.getElementById('edit-profile-name').value.trim();
            const newPhone = document.getElementById('edit-profile-phone').value.trim();

            if (!newName) {
                window.showGlobalToast("Validation Error", "Name cannot be empty.");
                return;
            }

            if (newPhone && !/^01\d{9}$/.test(newPhone)) {
                window.showGlobalToast("Validation Error", "Phone number must be a valid 11-digit BD number (e.g. 01XXXXXXXXX).");
                return;
            }

            window.showLoader(true, "Saving profile...");

            try {
                let newProfileUrl = window.authState.profile?.profile_url || null;

                // Update profile in DB
                const updatePayload = {
                    full_name: newName,
                    phone_number: newPhone || null,
                    profile_url: newProfileUrl
                };

                const { error: dbError } = await _supabase
                    .from('profiles')
                    .update(updatePayload)
                    .eq('id', window.authState.user.id);

                if (dbError) throw dbError;

                // Update local state
                if (window.authState.profile) {
                    window.authState.profile.full_name = newName;
                    window.authState.profile.phone_number = newPhone || null;
                    window.authState.profile.profile_url = newProfileUrl;
                }

                // Sync all UI
                window.updateGlobalAvatars();
                populateProfileDetails();

                window.showGlobalToast("Success", "Profile updated successfully!");
                window.navigate('screen-profile');

            } catch (err) {
                console.error("[EDIT PROFILE] Save error:", err);
                window.showGlobalToast("Error", "Failed to save profile. Please try again.");
            } finally {
                window.showLoader(false);
            }
        };

        window.renderSecondaryBatchesUI = function() {
            const container = document.getElementById('profile-secondary-batches-container');
            if (!container) return;
            
            const secondaryBatches = window.authState.profile?.secondary_batches || [];
            
            if (secondaryBatches.length === 0) {
                container.innerHTML = `<span class="text-[11px] font-medium text-slate-400 italic py-1">No secondary batches added.</span>`;
                return;
            }

            container.innerHTML = secondaryBatches.map(batchId => {
                const batch = window.onboardBatchesList ? window.onboardBatchesList.find(b => String(b.id) === String(batchId)) : null;
                const batchName = batch ? batch.batch_name : `Batch ${batchId}`;
                return `
                    <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-100 pl-3 pr-1 py-1 rounded-full group transition-colors hover:border-slate-300">
                        <span class="text-[11px] font-bold text-slate-700">${window.sanitizeHTML(batchName)}</span>
                        <button onclick="window.removeSecondaryBatch('${batchId}')" class="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors">
                            <i data-lucide="x" class="w-3 h-3"></i>
                        </button>
                    </div>
                `;
            }).join('');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        };

        window.openAddSecondaryBatchModal = async function() {
            const secondaryBatches = window.authState.profile?.secondary_batches || [];
            if (secondaryBatches.length >= 3) {
                window.showGlobalToast("Limit Reached", "You can have a maximum of 3 secondary batches.");
                return;
            }
            
            const primaryBatch = window.authState.profile?.batch_id;
            
            if (!window.onboardBatchesList || window.onboardBatchesList.length === 0) {
                window.showLoader(true, "Loading batches...");
                try {
                    const { data, error } = await _supabase.from('batches').select('id, batch_name').order('batch_name');
                    if (error) throw error;
                    window.onboardBatchesList = data || [];
                } catch (err) {
                    console.error("Error loading batches:", err);
                    window.showGlobalToast("Error", "Failed to load batches. Please try again.");
                    window.showLoader(false);
                    return;
                }
                window.showLoader(false);
            }

            const availableBatches = window.onboardBatchesList.filter(b => String(b.id) !== String(primaryBatch) && !secondaryBatches.includes(String(b.id)));
            
            if (availableBatches.length === 0) {
                window.showGlobalToast("Notice", "No other batches available to add.");
                return;
            }

            let optionsHtml = availableBatches.map(b => `<option value="${b.id}">${window.sanitizeHTML(b.batch_name)}</option>`).join('');
            
            const container = document.getElementById('modal-add-secondary-batch');
            const selectEl = document.getElementById('add-secondary-batch-select');
            if (selectEl) selectEl.innerHTML = `<option value="" disabled selected>Select a batch</option>` + optionsHtml;

            if (container) {
                container.classList.remove('hidden');
                setTimeout(() => {
                    container.classList.remove('opacity-0');
                    document.getElementById('modal-add-secondary-batch-content').classList.remove('translate-y-full');
                }, 10);
            }
        };

        window.closeAddSecondaryBatchModal = function() {
            const container = document.getElementById('modal-add-secondary-batch');
            const content = document.getElementById('modal-add-secondary-batch-content');
            if (container && content) {
                container.classList.add('opacity-0');
                content.classList.add('translate-y-full');
                setTimeout(() => container.classList.add('hidden'), 300);
            }
        };

        window.saveNewSecondaryBatch = async function() {
            const selectEl = document.getElementById('add-secondary-batch-select');
            const newBatchId = selectEl?.value;
            if (!newBatchId) {
                window.showGlobalToast("Error", "Please select a batch.");
                return;
            }

            const secondaryBatches = window.authState.profile?.secondary_batches || [];
            if (secondaryBatches.length >= 3) return;

            const updatedBatches = [...secondaryBatches, newBatchId];
            window.showLoader(true, "Adding batch...");
            try {
                const { error } = await _supabase.from('profiles').update({ secondary_batches: updatedBatches }).eq('id', window.authState.user.id);
                if (error) throw error;
                if (window.authState.profile) window.authState.profile.secondary_batches = updatedBatches;
                if (typeof window.renderSecondaryBatchesPageUI === 'function') window.renderSecondaryBatchesPageUI();
                window.closeAddSecondaryBatchModal();
                window.showGlobalToast("Success", "Secondary batch added. You can now add courses from this batch.");
            } catch (err) {
                console.error("Error adding batch:", err);
                window.showGlobalToast("Error", "Failed to add batch.");
            } finally {
                window.showLoader(false);
            }
        };

        window.removeSecondaryBatch = async function(batchId) {
            if (!confirm("Warning: Deleting this secondary batch will automatically remove you from all enrolled courses associated with it. Are you sure?")) return;

            const secondaryBatches = window.authState.profile?.secondary_batches || [];
            const updatedBatches = secondaryBatches.filter(id => String(id) !== String(batchId));

            window.showLoader(true, "Removing batch and cleaning up courses...");
            try {
                // Find all courses associated with this batch
                const { data: coursesInBatch, error: cErr } = await _supabase.from('courses').select('id').eq('batch_id', batchId);
                if (cErr) throw cErr;

                const courseIds = coursesInBatch.map(c => c.id);

                if (courseIds.length > 0) {
                    // Delete from user_courses
                    const { error: ucErr } = await _supabase.from('user_courses').delete()
                        .eq('user_id', window.authState.user.id)
                        .in('course_id', courseIds);
                    if (ucErr) throw ucErr;
                }

                // Update profile
                const { error: pErr } = await _supabase.from('profiles').update({ secondary_batches: updatedBatches }).eq('id', window.authState.user.id);
                if (pErr) throw pErr;

                if (window.authState.profile) window.authState.profile.secondary_batches = updatedBatches;
                if (typeof window.renderSecondaryBatchesPageUI === 'function') window.renderSecondaryBatchesPageUI();
                
                // Trigger course count update
                populateProfileDetails();
                
                window.showGlobalToast("Success", "Batch and associated courses removed.");
            } catch (err) {
                console.error("Error removing batch:", err);
                window.showGlobalToast("Error", "Failed to remove batch.");
            } finally {
                window.showLoader(false);
            }
        };

        window.renderSecondaryBatchesPageUI = async function() {
            const container = document.getElementById('secondary-batches-page-container');
            if (!container) return;

            const secondaryBatches = window.authState.profile?.secondary_batches || [];
            if (secondaryBatches.length === 0) {
                container.innerHTML = `<div class="bg-white rounded-2xl p-6 border border-slate-100 flex flex-col items-center justify-center text-center">
                    <div class="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mb-3">
                        <i data-lucide="layers" class="w-6 h-6"></i>
                    </div>
                    <h3 class="text-[14px] font-bold text-slate-800 mb-1">No Secondary Batches</h3>
                    <p class="text-[12px] text-slate-500 font-medium">You haven't joined any secondary batches yet.</p>
                </div>`;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }

            container.innerHTML = `<div class="py-4 flex justify-center"><div class="w-6 h-6 border-2 border-[#4226E9] border-t-transparent rounded-full animate-spin"></div></div>`;

            try {
                if (!window.currentFacultiesList || window.currentFacultiesList.length === 0) {
                    if (window.FacultyService && window.FacultyService.loadFacultyList) await window.FacultyService.loadFacultyList();
                }
                // Fetch batch names
                const { data: batchesData, error: batchesError } = await _supabase
                    .from('batches')
                    .select('id, batch_name')
                    .in('id', secondaryBatches);
                    
                if (batchesError) throw batchesError;

                // Fetch enrolled courses for these batches
                const { data: coursesData, error: coursesError } = await _supabase
                    .from('courses')
                    .select('id, course_name, course_code, total_credit, batch_id')
                    .in('batch_id', secondaryBatches);
                    
                if (coursesError) throw coursesError;
                
                // Fetch user_courses to know which ones they enrolled in
                const { data: userCourses, error: userCoursesError } = await _supabase
                    .from('user_courses')
                    .select('course_id')
                    .eq('user_id', window.authState.user.id);
                    
                if (userCoursesError) throw userCoursesError;
                
                const enrolledCourseIds = userCourses ? userCourses.map(uc => uc.course_id) : [];

                // Fetch CRs for these batches
                const { data: crData, error: crError } = await _supabase
                    .from('batch_crs')
                    .select('user_id, batch_id, profiles!batch_crs_user_id_fkey(full_name, profile_url, email, phone_number)')
                    .in('batch_id', secondaryBatches)
                    .eq('active', true);
                    
                if (crError) throw crError;

                let html = '';
                
                for (const batchId of secondaryBatches) {
                    const batch = batchesData?.find(b => String(b.id) === String(batchId));
                    const batchName = batch ? batch.batch_name : `Batch ${batchId}`;
                    
                    const batchCourses = coursesData?.filter(c => String(c.batch_id) === String(batchId)) || [];
                    const myEnrolledBatchCourses = batchCourses.filter(c => enrolledCourseIds.includes(c.id));
                    
                    const batchCrs = crData?.filter(cr => String(cr.batch_id) === String(batchId)) || [];
                    
                    html += `
                        <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-4">
                            <div class="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <div class="w-8 h-8 rounded-full bg-indigo-100 text-[#4226E9] flex items-center justify-center font-black text-xs">
                                        ${window.sanitizeHTML(batchName).substring(0,2).toUpperCase()}
                                    </div>
                                    <h3 class="font-black text-[15px] text-slate-800">${window.sanitizeHTML(batchName)}</h3>
                                </div>
                                <button onclick="window.removeSecondaryBatch('${batchId}')" class="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors">
                                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                                </button>
                            </div>
                            
                            <div class="p-4 space-y-4">
                                <!-- Enrolled Courses -->
                                <div>
                                    <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Enrolled Courses (${myEnrolledBatchCourses.length})</h4>
                                    ${myEnrolledBatchCourses.length > 0 ? `
                                        <div class="flex flex-col gap-2">
                                            ${myEnrolledBatchCourses.map(c => {
                                                const faculty = (window.currentFacultiesList || []).find(f => f.id == c.faculty_id);
                                                const facultyNames = faculty ? faculty.faculty_name : 'Unassigned';
                                                return `
                                                <div class="flex flex-col p-3 border border-slate-100 rounded-xl bg-slate-50/50">
                                                    <div class="flex items-center justify-between">
                                                        <span class="font-bold text-[13px] text-slate-800">${window.sanitizeHTML(c.course_name)}</span>
                                                        <span class="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">${window.sanitizeHTML(c.course_code)}</span>
                                                    </div>
                                                    <div class="flex items-center gap-4 mt-2">
                                                        <div class="flex items-center gap-1.5">
                                                            <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i>
                                                            <span class="text-[11px] font-medium text-slate-600">${window.sanitizeHTML(facultyNames)}</span>
                                                        </div>
                                                        <div class="flex items-center gap-1.5">
                                                            <i data-lucide="graduation-cap" class="w-3.5 h-3.5 text-slate-400"></i>
                                                            <span class="text-[11px] font-medium text-slate-600">${c.total_credit || 0} Credits</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            `}).join('')}
                                        </div>
                                    ` : `<p class="text-[11px] text-slate-500 font-medium italic">No courses enrolled from this batch.</p>`}
                                </div>
                                
                                <!-- CRs -->
                                <div>
                                    <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Class Representatives (${batchCrs.length})</h4>
                                    ${batchCrs.length > 0 ? `
                                        <div class="space-y-2">
                                            ${batchCrs.map(cr => {
                                                const p = cr.profiles || {};
                                                const name = window.sanitizeHTML(p.full_name || 'Unknown');
                                                const initial = name.charAt(0).toUpperCase();
                                                const avatar = p.profile_url ? `<img src="${window.sanitizeUrl(p.profile_url)}" class="w-7 h-7 rounded-full object-cover border border-slate-100">` : `<div class="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[10px] border border-blue-100">${initial}</div>`;
                                                return `
                                                    <div class="flex items-center justify-between p-2 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                                                        <div class="flex items-center gap-2.5">
                                                            ${avatar}
                                                            <div class="flex flex-col">
                                                                <span class="text-[12px] font-bold text-slate-800 leading-tight">${name}</span>
                                                                <span class="text-[9px] font-semibold text-slate-500 mt-0.5">CR</span>
                                                            </div>
                                                        </div>
                                                        <div class="flex items-center gap-1.5">
                                                            ${p.phone_number ? `<a href="tel:${window.sanitizeHTML(p.phone_number)}" class="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors"><i data-lucide="phone" class="w-3.5 h-3.5"></i></a>` : ''}
                                                            ${p.email ? `<a href="mailto:${window.sanitizeHTML(p.email)}" class="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors"><i data-lucide="mail" class="w-3.5 h-3.5"></i></a>` : ''}
                                                        </div>
                                                    </div>
                                                `;
                                            }).join('')}
                                        </div>
                                    ` : `<p class="text-[11px] text-slate-500 font-medium italic">No CRs assigned to this batch.</p>`}
                                </div>
                            </div>
                        </div>
                    `;
                }

                container.innerHTML = html;
                if (typeof lucide !== 'undefined') lucide.createIcons();

            } catch (err) {
                console.error("[PROFILE] Error rendering secondary batches page:", err);
                container.innerHTML = `<div class="p-4 text-center text-[12px] text-red-500 font-bold bg-red-50 rounded-xl">Failed to load batch details. Please try again.</div>`;
            }
        };

        const originalNavigate = window.navigate;
        if (typeof originalNavigate === 'function') {
            window.navigate = function(screenId) {
                originalNavigate(screenId);
                if (screenId === 'screen-secondary-batches') {
                    window.renderSecondaryBatchesPageUI();
                }
            };
        }

        // ----------------- CR ACCESS REQUESTS -----------------
        window.checkCRRequestStatus = async function(role) {
            const btnContainer = document.getElementById('cr-request-container');
            const btnRequest = document.getElementById('btn-request-cr');
            const pendingNotice = document.getElementById('cr-request-pending-notice');
            
            if (!btnContainer) return;
            
            if (role === 'admin' || role === 'cr') {
                btnContainer.classList.add('hidden');
                return;
            }
            
            btnContainer.classList.remove('hidden');
            
            try {
                if (window.authState?.user?.id) {
                    const { data, error } = await _supabase
                        .from('cr_requests')
                        .select('status')
                        .eq('user_id', window.authState.user.id)
                        .eq('status', 'pending')
                        .limit(1);
                        
                    if (!error && data && data.length > 0) {
                        btnRequest.classList.add('hidden');
                        pendingNotice.classList.remove('hidden');
                    } else {
                        btnRequest.classList.remove('hidden');
                        pendingNotice.classList.add('hidden');
                    }
                }
            } catch (e) {
                console.error('[CR REQUEST CHECK ERROR]', e);
            }
        };

        window.openCRRequestModal = async function() {
            const modal = document.getElementById('modal-cr-request');
            const batchDisplay = document.getElementById('cr-req-batch-display');
            const noteInput = document.getElementById('cr-req-note');
            
            if (!modal) return;
            
            noteInput.value = '';
            batchDisplay.innerText = 'Loading batch...';
            
            modal.classList.remove('hidden');
            
            try {
                const profile = window.authState.profile;
                if (!profile?.batch_id) {
                    batchDisplay.innerText = 'No primary batch set';
                    return;
                }
                
                const { data, error } = await _supabase
                    .from('batches')
                    .select('batch_name')
                    .eq('id', profile.batch_id)
                    .single();
                    
                if (error) throw error;
                batchDisplay.innerText = data?.batch_name || 'Unknown Batch';
            } catch (e) {
                console.error('[LOAD BATCH ERROR]', e);
                batchDisplay.innerText = 'Error loading batch';
            }
        };

        window.closeCRRequestModal = function() {
            const modal = document.getElementById('modal-cr-request');
            if (modal) modal.classList.add('hidden');
        };

        window.submitCRRequest = async function() {
            const noteInput = document.getElementById('cr-req-note');
            const profile = window.authState?.profile;
            const userId = window.authState?.user?.id;
            
            if (!profile?.batch_id || !userId) {
                showGlobalToast('Error: No primary batch found on profile.', 'error');
                return;
            }
            
            showLoader(true, 'Submitting request...');
            try {
                const { error } = await _supabase
                    .from('cr_requests')
                    .insert({
                        user_id: userId,
                        batch_id: profile.batch_id,
                        request_note: noteInput.value.trim(),
                        status: 'pending'
                    });
                    
                if (error) {
                    if (error.code === '23505') { // unique violation
                        throw new Error('You already have a pending request.');
                    }
                    throw error;
                }
                
                closeCRRequestModal();
                showGlobalToast('CR Access request submitted successfully!', 'success');
                window.checkCRRequestStatus(profile.role);
            } catch (e) {
                console.error('[SUBMIT CR REQUEST ERROR]', e);
                showGlobalToast(e.message || 'Failed to submit request', 'error');
            } finally {
                forceHideLoader();
            }
        };

export const ProfileService = {
    populateProfileDetails: typeof populateProfileDetails !== 'undefined' ? populateProfileDetails : window.populateProfileDetails,
    openProfilePictureModal: typeof openProfilePictureModal !== 'undefined' ? openProfilePictureModal : window.openProfilePictureModal,
    closeProfilePictureModal: typeof closeProfilePictureModal !== 'undefined' ? closeProfilePictureModal : window.closeProfilePictureModal,
    resetProfilePictureModal: typeof resetProfilePictureModal !== 'undefined' ? resetProfilePictureModal : window.resetProfilePictureModal,
    updateProfilePictureModalView: typeof updateProfilePictureModalView !== 'undefined' ? updateProfilePictureModalView : window.updateProfilePictureModalView,
    cancelCrop: typeof cancelCrop !== 'undefined' ? cancelCrop : window.cancelCrop,
    handleCropAndUpload: typeof handleCropAndUpload !== 'undefined' ? handleCropAndUpload : window.handleCropAndUpload,
    handleDeleteProfilePicture: typeof handleDeleteProfilePicture !== 'undefined' ? handleDeleteProfilePicture : window.handleDeleteProfilePicture,
    updateGlobalAvatars: typeof updateGlobalAvatars !== 'undefined' ? updateGlobalAvatars : window.updateGlobalAvatars,
    openPhoneEditModal: typeof openPhoneEditModal !== 'undefined' ? openPhoneEditModal : window.openPhoneEditModal,
    closePhoneEditModal: typeof closePhoneEditModal !== 'undefined' ? closePhoneEditModal : window.closePhoneEditModal,
    savePhoneEdit: typeof savePhoneEdit !== 'undefined' ? savePhoneEdit : window.savePhoneEdit
};


