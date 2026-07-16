import { _supabase } from '../supabase-client.js';
import { showGlobalToast } from '../utils.js';

export const REACTION_ICONS = {
    'like': 'https://ngropmfrneaaejwocnbf.supabase.co/storage/v1/object/public/materials/Like.png',
    'love': 'https://ngropmfrneaaejwocnbf.supabase.co/storage/v1/object/public/materials/Love.png',
    'haha': 'https://ngropmfrneaaejwocnbf.supabase.co/storage/v1/object/public/materials/Haha.png',
    'sad': 'https://ngropmfrneaaejwocnbf.supabase.co/storage/v1/object/public/materials/Sad.png',
    'angry': 'https://ngropmfrneaaejwocnbf.supabase.co/storage/v1/object/public/materials/Angry.png',
    'cool': 'https://ngropmfrneaaejwocnbf.supabase.co/storage/v1/object/public/materials/Cool.png'
};

export class ReactionService {
    // contentId -> [ { user_id, reaction_type, profiles: { full_name, profile_url } } ]
    static cache = {};

    static async fetchReactionsForContent(contentType, contentIds) {
        if (!contentIds || contentIds.length === 0) return {};
        
        try {
            console.log(`[REACTION LOAD] Fetching ${contentType} reactions for ${contentIds.length} items`);
            const { data, error } = await _supabase
                .from('content_reactions')
                .select('user_id, content_id, reaction_type, profiles(full_name, profile_url)')
                .eq('content_type', contentType)
                .in('content_id', contentIds);

            if (error) throw error;

            const grouped = {};
            contentIds.forEach(id => grouped[id] = []);
            if (data) {
                data.forEach(row => {
                    if (!grouped[row.content_id]) grouped[row.content_id] = [];
                    grouped[row.content_id].push(row);
                });
            }

            // Update cache
            contentIds.forEach(id => {
                this.cache[id] = grouped[id];
            });

            return grouped;
        } catch (err) {
            console.error('[REACTION LOAD] Error:', err);
            return {};
        }
    }

    static getReactionSummaryHTML(contentType, contentId) {
        const reactions = this.cache[contentId] || [];
        if (reactions.length === 0) return '';

        const counts = {};
        let myReaction = null;
        reactions.forEach(r => {
            counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1;
            if (r.user_id === window.authState?.user?.id) {
                myReaction = r;
            }
        });

        const sortedTypes = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        let displayTypes = [];
        if (myReaction) {
            displayTypes.push(myReaction.reaction_type);
            sortedTypes.filter(t => t !== myReaction.reaction_type).slice(0, 2).forEach(t => displayTypes.push(t));
        } else {
            displayTypes = sortedTypes.slice(0, 3);
        }

        const iconsHtml = displayTypes.map((type, index) => {
            return `<img src="${REACTION_ICONS[type]}" class="w-[18px] h-[18px] border-2 border-white rounded-full ${index > 0 ? '-ml-1.5' : ''} bg-white dark:bg-dark-card shadow-sm" style="z-index: ${3 - index}">`;
        }).join('');

        return `
            <div onclick="event.stopPropagation(); window.ReactionService.openReactorsModal('${contentId}')" 
                 class="flex items-center gap-1.5 cursor-pointer shrink-0 min-w-0 hover:opacity-80 transition-opacity"
                 title="View reactions">
                <div class="flex items-center shrink-0">
                    ${iconsHtml}
                </div>
                <span class="text-[11px] font-bold text-slate-500 dark:text-dark-textSecondary shrink-0">${reactions.length}</span>
            </div>
        `;
    }


    static gestureState = {};

    // ── Portal-based Picker ──
    // The picker is rendered as a fixed-position element on document.body
    // to escape all overflow:hidden ancestor containers.
    static _activePickerEl = null;
    static _activeContainerId = null;

    static showPickerPortal(triggerButton, contentType, contentId) {
        // Close any existing picker first
        this.hidePickerPortal();

        const reactions = this.cache[contentId] || [];
        const types = ['like', 'love', 'haha', 'sad', 'angry', 'cool'];
        
        const shell = document.getElementById('app-viewport-shell') || document.body;
        const pickerEl = document.createElement('div');
        pickerEl.id = 'reaction-picker-portal';
        pickerEl.className = 'reaction-picker-portal';
        pickerEl.style.cssText = `
            position: absolute; z-index: 99999; 
            display: flex; align-items: center; gap: 4px; padding: 4px;
            background: var(--picker-bg, #fff); 
            border-radius: 9999px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
            white-space: nowrap;
            animation: pickerFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            pointer-events: auto;
        `;
        // Dark mode support
        if (document.documentElement.classList.contains('dark')) {
            pickerEl.style.background = '#1e2130';
            pickerEl.style.borderColor = 'rgba(255,255,255,0.05)';
        }

        types.forEach((type, index) => {
            const item = document.createElement('div');
            item.className = 'reaction-icon-wrapper';
            item.style.cssText = `
                width: 36px; height: 36px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; transition: transform 0.15s ease;
                animation: pickerEmojiBounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
                animation-delay: ${index * 0.05}s; opacity: 0;
                -webkit-touch-callout: none; user-select: none;
            `;
            item.innerHTML = `<img src="${REACTION_ICONS[type]}" style="width:28px;height:28px;pointer-events:none;user-select:none;-webkit-touch-callout:none;" alt="${type}">`;
            
            const handler = (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.hidePickerPortal();
                this.toggleReaction(contentType, contentId, type);
            };
            item.addEventListener('click', handler);
            item.addEventListener('touchend', handler, { passive: false });
            item.addEventListener('mouseenter', () => { item.style.transform = 'scale(1.3) translateY(-4px)'; });
            item.addEventListener('mouseleave', () => { item.style.transform = ''; });
            pickerEl.appendChild(item);
        });

        shell.appendChild(pickerEl);
        this._activePickerEl = pickerEl;
        this._activeContainerId = `${contentType}_${contentId}`;

        // Position the picker above the trigger button relative to the viewport shell
        const rect = triggerButton.getBoundingClientRect();
        const shellRect = shell.getBoundingClientRect();
        const pickerWidth = 244;
        const pickerHeight = 44;
        
        let top = rect.top - shellRect.top - pickerHeight - 16; // 16px safe gap above the button relative to shell
        let left = rect.left - shellRect.left + (rect.width / 2) - (pickerWidth / 2); // Center horizontally relative to button within shell
        
        // Clamp to shell boundaries
        if (top < 8) top = rect.bottom - shellRect.top + 16; // flip below if no room above
        if (left < 8) left = 8;
        if (left + pickerWidth > shellRect.width - 8) {
            left = shellRect.width - pickerWidth - 8;
        }
        
        pickerEl.style.top = `${top}px`;
        pickerEl.style.left = `${left}px`;
    }

    static hidePickerPortal() {
        if (this._activePickerEl) {
            this._activePickerEl.remove();
            this._activePickerEl = null;
            this._activeContainerId = null;
        }
    }

    static handlePointerDown(event, contentType, contentId) {
        event.stopPropagation();
        const gid = `${contentType}_${contentId}`;
        const currentTarget = event.currentTarget;
        this.gestureState[gid] = this.gestureState[gid] || { clicks: 0, lastClickTime: 0 };
        this.gestureState[gid].isLongPress = false;
        
        this.gestureState[gid].longPressTimer = setTimeout(() => {
            this.gestureState[gid].isLongPress = true;
            // Show picker portal instead of CSS class toggle
            this.showPickerPortal(currentTarget, contentType, contentId);
        }, 500); // 500ms long press
    }

    static handlePointerUp(event, contentType, contentId, defaultReaction) {
        event.stopPropagation();
        event.preventDefault();
        const gid = `${contentType}_${contentId}`;
        const state = this.gestureState[gid];
        if (!state) return;

        clearTimeout(state.longPressTimer);

        if (state.isLongPress) {
            // Long press handled — picker is already shown via portal
            return;
        }

        // Handle single vs double click
        const now = Date.now();
        if (now - state.lastClickTime < 300) {
            // Double click
            clearTimeout(state.clickTimer);
            this.toggleReaction(contentType, contentId, 'love');
            state.lastClickTime = 0;
            this.hidePickerPortal();
        } else {
            // Single click
            state.lastClickTime = now;
            state.clickTimer = setTimeout(() => {
                this.toggleReaction(contentType, contentId, defaultReaction);
                state.lastClickTime = 0;
            }, 300);
        }
    }

    static handlePointerLeave(event, contentType, contentId) {
        const gid = `${contentType}_${contentId}`;
        if (this.gestureState[gid]) {
            clearTimeout(this.gestureState[gid].longPressTimer);
        }
    }

    static handleMouseEnter(event, contentType, contentId) {
        // Show picker on desktop hover
        const btn = event.currentTarget.querySelector('.reaction-trigger-btn');
        if (btn) this.showPickerPortal(btn, contentType, contentId);
    }

    static handleMouseLeave(event, contentType, contentId) {
        // Delay hide so user can move cursor into the picker
        this._mouseLeaveTimer = setTimeout(() => {
            // Only hide if mouse is NOT over the portal picker
            const portal = document.getElementById('reaction-picker-portal');
            if (portal && portal.matches(':hover')) return;
            this.hidePickerPortal();
        }, 300);
    }

    static closeReactionTray(event) {
        this.hidePickerPortal();
    }

    static getReactionPickerHTML(contentType, contentId) {
        const reactions = this.cache[contentId] || [];
        const myReaction = reactions.find(r => r.user_id === window.authState?.user?.id);
        
        let actionIcon = `
            <div class="relative inline-flex items-center justify-center text-slate-500 dark:text-dark-textSecondary hover:text-slate-800 transition-colors group">
                <i data-lucide="smile" class="w-4 h-4"></i>
                <div class="absolute -bottom-[2px] -right-[3px] bg-[#f3f4f6] group-hover:bg-slate-200 transition-colors rounded-full p-[1px]">
                    <i data-lucide="plus" class="w-2.5 h-2.5 font-bold"></i>
                </div>
            </div>
        `;
        if (myReaction) {
            actionIcon = `<img src="${REACTION_ICONS[myReaction.reaction_type]}" class="w-[18px] h-[18px] pointer-events-none select-none hover:scale-110 transition-transform" style="-webkit-touch-callout: none;">`;
        }

        // No inline picker div — picker is shown as a body-level portal via JS
        return `
            <div class="reaction-container relative inline-flex items-center shrink-0" 
                 onmouseenter="window.ReactionService.handleMouseEnter(event, '${contentType}', '${contentId}')"
                 onmouseleave="window.ReactionService.handleMouseLeave(event, '${contentType}', '${contentId}')"
                 oncontextmenu="event.preventDefault();">
                
                <button onpointerdown="window.ReactionService.handlePointerDown(event, '${contentType}', '${contentId}')"
                        onpointerup="window.ReactionService.handlePointerUp(event, '${contentType}', '${contentId}', '${myReaction ? myReaction.reaction_type : 'like'}')"
                        onpointerleave="window.ReactionService.handlePointerLeave(event, '${contentType}', '${contentId}')"
                        oncontextmenu="event.preventDefault();"
                        onclick="event.stopPropagation(); event.preventDefault();"
                        class="reaction-trigger-btn flex items-center justify-center transition-transform active:scale-90 outline-none select-none relative">
                    ${actionIcon}
                </button>
            </div>
        `;
    }

    static renderReactionBlock(contentType, contentId) {
        const isAdmin = (window.currentUserRole === 'admin' || window.currentUserRole === 'cr' || window.isAdminEmail(window.currentUserEmail));
        const reactions = this.cache[contentId] || [];
        const myReaction = reactions.find(r => r.user_id === window.authState?.user?.id);
        const activeClass = myReaction ? 'bg-indigo-50 border border-indigo-100 hover:bg-indigo-100' : 'bg-[#f3f4f6] border border-transparent hover:bg-slate-200';

        return `
            <div class="flex items-center" id="reaction-block-${contentId}">
                <div class="flex items-center gap-[6px] px-[10px] py-[4px] rounded-[20px] shrink-0 min-w-0 transition-colors ${activeClass}">
                    ${this.getReactionPickerHTML(contentType, contentId)}
                    ${this.getReactionSummaryHTML(contentType, contentId)}
                </div>
                ${isAdmin ? `
                <button onclick="event.stopPropagation(); triggerImmediateNotification('${contentType}', '${contentId}', this)" class="px-2.5 py-1.5 bg-[#4226E9] hover:bg-[#341BC5] text-white rounded-[6px] text-[10px] font-bold transition-colors flex items-center gap-1 shrink-0 ml-1 mr-[2px]">
                    <i data-lucide="bell" class="w-3 h-3"></i> Notify
                </button>
                ` : ''}
            </div>
        `;
    }

    static pendingToggles = {};

    static async toggleReaction(contentType, contentId, reactionType) {
        if (!window.authState?.user) {
            showGlobalToast("Error", "You must be logged in to react.");
            return;
        }

        if (window.SeenService) window.SeenService.markAsSeen(contentId, contentType);

        // Prevent race condition (rapid clicks causing multiple inserts)
        if (this.pendingToggles[contentId]) return;
        this.pendingToggles[contentId] = true;

        const userId = window.authState.user.id;
        const profile = window.authState.profile;
        if (!this.cache[contentId]) this.cache[contentId] = [];
        
        const existingIdx = this.cache[contentId].findIndex(r => r.user_id === userId);
        const isRemoving = existingIdx > -1 && this.cache[contentId][existingIdx].reaction_type === reactionType;

        // Optimistic UI Update
        if (isRemoving) {
            console.log(`[REACTION DELETE] Optimistic remove ${reactionType} for ${contentId}`);
            this.cache[contentId].splice(existingIdx, 1);
        } else {
            console.log(`[REACTION UPSERT] Optimistic set ${reactionType} for ${contentId}`);
            const newReaction = {
                user_id: userId,
                content_id: contentId,
                reaction_type: reactionType,
                profiles: {
                    full_name: profile.full_name,
                    profile_url: profile.profile_url
                }
            };
            if (existingIdx > -1) {
                this.cache[contentId][existingIdx] = newReaction;
            } else {
                this.cache[contentId].push(newReaction);
            }
        }

        this.updateDOM(contentType, contentId);

        setTimeout(() => {
            const blocks = document.querySelectorAll(`[id="reaction-block-${contentId}"]`);
            blocks.forEach(block => {
                const btn = block.querySelector('.reaction-trigger-btn');
                if (btn) {
                    btn.classList.add('trigger-bounce');
                    setTimeout(() => btn.classList.remove('trigger-bounce'), 400);
                }
            });
        }, 10);

        // Network Request
        try {
            if (isRemoving) {
                const { error } = await _supabase
                    .from('content_reactions')
                    .delete()
                    .match({ user_id: userId, content_type: contentType, content_id: contentId });
                if (error) throw error;
            } else {
                // To avoid 42P10 constraint errors with Supabase upsert, we explicitly check and branch
                const { data: existingRecords, error: checkErr } = await _supabase
                    .from('content_reactions')
                    .select('id')
                    .match({ user_id: userId, content_type: contentType, content_id: contentId });

                if (checkErr) throw checkErr;

                if (existingRecords && existingRecords.length > 0) {
                    const { error } = await _supabase
                        .from('content_reactions')
                        .update({ reaction_type: reactionType })
                        .match({ id: existingRecords[0].id });
                    if (error) throw error;
                } else {
                    const { error } = await _supabase
                        .from('content_reactions')
                        .insert([
                            {
                                user_id: userId,
                                content_type: contentType,
                                content_id: contentId,
                                reaction_type: reactionType
                            }
                        ]);
                    if (error) throw error;
                }
            }
        } catch (err) {
            console.error('[REACTION NETWORK ERROR]', err);
            // We could revert cache here, but for now just show a toast
            showGlobalToast("Error", "Failed to update reaction.");
        } finally {
            delete this.pendingToggles[contentId];
        }
    }

    static updateDOM(contentType, contentId) {
        const blocks = document.querySelectorAll(`[id="reaction-block-${contentId}"]`);
        blocks.forEach(block => {
            block.outerHTML = this.renderReactionBlock(contentType, contentId);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    static currentModalReactions = [];

    static renderModalList(filterType = 'all') {
        const list = document.getElementById('who-reacted-list');
        const header = document.getElementById('who-reacted-header');
        if (!list || !header) return;

        let filtered = this.currentModalReactions;
        if (filterType !== 'all') {
            filtered = this.currentModalReactions.filter(r => r.reaction_type === filterType);
        }

        const counts = {};
        this.currentModalReactions.forEach(r => {
            counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1;
        });

        let headerHtml = `<div onclick="window.ReactionService.renderModalList('all')" class="px-4 py-2 border-b-2 ${filterType === 'all' ? 'border-[#4226E9] text-[#4226E9]' : 'border-transparent text-slate-500 dark:text-dark-textSecondary'} font-bold cursor-pointer whitespace-nowrap transition-colors">All ${this.currentModalReactions.length}</div>`;
        
        Object.keys(counts).sort((a,b) => counts[b] - counts[a]).forEach(type => {
            const isActive = filterType === type;
            headerHtml += `<div onclick="window.ReactionService.renderModalList('${type}')" class="px-4 py-2 border-b-2 ${isActive ? 'border-[#4226E9] text-[#4226E9]' : 'border-transparent text-slate-500 dark:text-dark-textSecondary'} font-bold flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 whitespace-nowrap transition-colors"><img src="${REACTION_ICONS[type]}" class="w-4 h-4"> ${counts[type]}</div>`;
        });
        header.innerHTML = headerHtml;

        list.innerHTML = filtered.sort((a,b) => a.profiles?.full_name?.localeCompare(b.profiles?.full_name)).map(r => {
            const name = window.sanitizeHTML(r.profiles?.full_name || 'Unknown User');
            const initial = name.charAt(0).toUpperCase();
            let avatarHtml = `<span class="font-bold text-[14px] text-[#4226E9]">${initial}</span>`;
            if (r.profiles?.profile_url) {
                avatarHtml = `<img src="${window.sanitizeUrl(r.profiles.profile_url)}" class="w-full h-full object-cover rounded-full">`;
            }

            return `
                <div class="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="relative w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center border border-slate-100 dark:border-white/5 shrink-0">
                            ${avatarHtml}
                            <img src="${REACTION_ICONS[r.reaction_type]}" class="absolute -bottom-1 -right-1 w-4 h-4 border border-white rounded-full bg-white dark:bg-dark-card shadow-sm">
                        </div>
                        <span class="font-bold text-slate-800 dark:text-dark-text text-[14px]">${name}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    static openReactorsModal(contentId) {
        const reactions = this.cache[contentId] || [];
        const modal = document.getElementById('who-reacted-modal');
        if (!modal) return;
        if (reactions.length === 0) return;

        this.currentModalReactions = reactions;
        this.renderModalList('all');

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.querySelector('.transform').classList.remove('translate-y-full');
        }, 10);
    }
}

export class AuthorService {
    static renderAuthorBlock(profileData, postedTimeStr, extraBadgesHtml = '', rightSideHtml = '') {
        const pData = profileData || { full_name: 'System User', role: 'admin' };
        
        const name = window.sanitizeHTML(pData.full_name || 'Unknown User');
        const role = window.sanitizeHTML(pData.role || 'student');
        
        let roleDisplay = 'Student';
        let roleClass = 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-dark-textSecondary border border-slate-200 dark:border-white/10';
        let roleIcon = '';
        if (role === 'admin') { 
            roleDisplay = 'ADMIN'; 
            roleClass = 'bg-gradient-to-r from-[#1E293B] to-[#334155] text-[#F8FAFC] shadow-sm border border-[#475569]'; 
            roleIcon = '<i data-lucide="shield-check" class="w-2.5 h-2.5 mr-0.5 text-amber-400"></i>';
        }
        else if (role === 'cr') { 
            roleDisplay = 'CR'; 
            roleClass = 'bg-blue-500 text-white shadow-sm'; 
        }

        const initial = name.charAt(0).toUpperCase();
        let avatarHtml = `<span class="font-bold text-[12px] text-slate-400 dark:text-dark-textSecondary m-0">${initial}</span>`;
        if (pData.profile_url) {
            avatarHtml = `<img src="${window.sanitizeUrl(pData.profile_url)}" class="w-full h-full object-cover rounded-full m-0">`;
        }

        return `
            <div class="flex items-start justify-between w-full mb-[8px] overflow-hidden">
                <div class="flex items-start gap-2.5 min-w-0 w-full">
                    <div class="w-[28px] h-[28px] rounded-full bg-slate-200 dark:bg-white/10 shrink-0 flex items-center justify-center relative overflow-hidden ring-1 ring-slate-100 m-0">
                        ${avatarHtml}
                    </div>
                    <div class="flex flex-col gap-[4px] min-w-0 flex-1 m-0">
                        <div class="flex justify-between items-center w-full m-0">
                            <div class="flex items-center gap-[6px] min-w-0">
                                <span class="text-[12px] font-semibold text-gray-800 dark:text-dark-text leading-none tracking-tight shrink-0 m-0">${name}</span>
                                <span class="text-[10px] font-bold px-[5px] py-[1.5px] rounded-[4px] leading-[1.2] shrink-0 uppercase tracking-[0.03em] ${roleClass} flex items-center w-auto max-w-full m-0">${roleIcon}${roleDisplay}</span>
                            </div>
                            ${postedTimeStr ? `<span class="text-[11px] font-normal text-gray-500 dark:text-dark-textSecondary shrink-0 m-0">${postedTimeStr}</span>` : ''}
                        </div>
                        ${extraBadgesHtml ? `
                        <div class="flex items-center gap-[6px] flex-wrap w-full mt-[4px] m-0">
                            ${extraBadgesHtml}
                        </div>` : ''}
                    </div>
                </div>
                ${rightSideHtml ? `<div class="shrink-0 ml-2">${rightSideHtml}</div>` : ''}
            </div>
        `;
    }
}

// Global outside click dismissal for Reaction Picker portal
document.addEventListener('pointerdown', (e) => {
    const portal = document.getElementById('reaction-picker-portal');
    if (!portal) return;
    
    if (e.target && typeof e.target.closest === 'function') {
        if (!e.target.closest('.reaction-container') && !e.target.closest('#reaction-picker-portal')) {
            ReactionService.hidePickerPortal();
        }
    } else {
        // Fallback if click is outside any element node (e.g. document boundary)
        ReactionService.hidePickerPortal();
    }
});

// Keep picker alive when mouse enters the portal (desktop hover)
document.addEventListener('mouseenter', (e) => {
    const portal = document.getElementById('reaction-picker-portal');
    if (!portal) return;

    if (e.target && (e.target.id === 'reaction-picker-portal' || (typeof e.target.closest === 'function' && e.target.closest('#reaction-picker-portal')))) {
        clearTimeout(ReactionService._mouseLeaveTimer);
    }
}, true);

document.addEventListener('mouseleave', (e) => {
    if (e.target && e.target.id === 'reaction-picker-portal') {
        ReactionService._mouseLeaveTimer = setTimeout(() => {
            ReactionService.hidePickerPortal();
        }, 300);
    }
}, true);
