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
            return `<img src="${REACTION_ICONS[type]}" class="w-[18px] h-[18px] border-2 border-white rounded-full ${index > 0 ? '-ml-1.5' : ''} bg-white shadow-sm" style="z-index: ${3 - index}">`;
        }).join('');

        return `
            <div onclick="event.stopPropagation(); window.ReactionService.openReactorsModal('${contentId}')" 
                 class="flex items-center gap-1.5 cursor-pointer shrink-0 min-w-0 hover:opacity-80 transition-opacity"
                 title="View reactions">
                <div class="flex items-center shrink-0">
                    ${iconsHtml}
                </div>
                <span class="text-[11px] font-bold text-slate-500 shrink-0">${reactions.length}</span>
            </div>
        `;
    }

    static gestureState = {};

    static handlePointerDown(event, contentType, contentId) {
        event.stopPropagation();
        const gid = `${contentType}_${contentId}`;
        const currentTarget = event.currentTarget;
        this.gestureState[gid] = this.gestureState[gid] || { clicks: 0, lastClickTime: 0 };
        this.gestureState[gid].isLongPress = false;
        
        this.gestureState[gid].longPressTimer = setTimeout(() => {
            this.gestureState[gid].isLongPress = true;
            const container = currentTarget.closest('.reaction-container');
            if (container) container.classList.add('force-hovered');
        }, 500); // 500ms long press
    }

    static handlePointerUp(event, contentType, contentId, defaultReaction) {
        event.stopPropagation();
        event.preventDefault(); // prevent ghost clicks
        const gid = `${contentType}_${contentId}`;
        const state = this.gestureState[gid];
        if (!state) return;

        clearTimeout(state.longPressTimer);

        if (state.isLongPress) {
            // Long press handled. Keep menu open.
            return;
        }

        // Handle single vs double click
        const now = Date.now();
        if (now - state.lastClickTime < 300) {
            // Double click
            clearTimeout(state.clickTimer);
            this.toggleReaction(contentType, contentId, 'love');
            state.lastClickTime = 0;
            const container = event.currentTarget.closest('.reaction-container');
            if (container) container.classList.remove('force-hovered');
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

    static closeReactionTray(event) {
        const container = event.currentTarget.closest('.reaction-container');
        if (container) {
            container.classList.remove('force-hovered');
            container.classList.remove('hovered');
        }
    }

    static getReactionPickerHTML(contentType, contentId) {
        const reactions = this.cache[contentId] || [];
        const myReaction = reactions.find(r => r.user_id === window.authState?.user?.id);
        
        let actionIcon = `
            <div class="relative inline-flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors group">
                <i data-lucide="smile" class="w-4 h-4"></i>
                <div class="absolute -bottom-[2px] -right-[3px] bg-[#f3f4f6] group-hover:bg-slate-200 transition-colors rounded-full p-[1px]">
                    <i data-lucide="plus" class="w-2.5 h-2.5 font-bold"></i>
                </div>
            </div>
        `;
        if (myReaction) {
            actionIcon = `<img src="${REACTION_ICONS[myReaction.reaction_type]}" class="w-[18px] h-[18px] pointer-events-none select-none hover:scale-110 transition-transform" style="-webkit-touch-callout: none;">`;
        }

        const types = ['like', 'love', 'haha', 'sad', 'angry', 'cool'];
        const pickerItems = types.map((type, index) => `
            <div onclick="event.stopPropagation(); window.ReactionService.closeReactionTray(event); window.ReactionService.toggleReaction('${contentType}', '${contentId}', '${type}')" 
                 onmouseup="event.stopPropagation();" ontouchend="event.stopPropagation(); event.preventDefault(); window.ReactionService.closeReactionTray(event); window.ReactionService.toggleReaction('${contentType}', '${contentId}', '${type}')"
                 class="reaction-icon-wrapper w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-transform hover:scale-125 origin-bottom select-none"
                 style="animation: pickerEmojiBounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; animation-delay: ${index * 0.05}s; opacity: 0; -webkit-touch-callout: none;">
                <img src="${REACTION_ICONS[type]}" class="w-7 h-7 pointer-events-none select-none" style="-webkit-touch-callout: none;" alt="${type}">
            </div>
        `).join('');

        return `
            <div class="reaction-container relative inline-flex items-center shrink-0" 
                 onmouseenter="this.classList.add('hovered')" 
                 onmouseleave="this.classList.remove('hovered'); this.classList.remove('force-hovered')">
                
                <button onpointerdown="window.ReactionService.handlePointerDown(event, '${contentType}', '${contentId}')"
                        onpointerup="window.ReactionService.handlePointerUp(event, '${contentType}', '${contentId}', '${myReaction ? myReaction.reaction_type : 'like'}')"
                        onpointerleave="window.ReactionService.handlePointerLeave(event, '${contentType}', '${contentId}')"
                        onclick="event.stopPropagation(); event.preventDefault();"
                        class="reaction-trigger-btn flex items-center justify-center transition-transform active:scale-90 outline-none">
                    ${actionIcon}
                </button>
                
                <div class="reaction-picker absolute bg-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-slate-100 p-1 flex items-center gap-1 opacity-0 pointer-events-none transition-all duration-300 translate-y-3 scale-95 origin-bottom-right whitespace-nowrap scrollbar-hide"
                     style="position: absolute !important; bottom: calc(100% + 6px) !important; right: -8px !important; max-width: calc(100vw - 24px) !important; overflow-x: auto !important; z-index: 9999 !important;"
                     onclick="event.stopPropagation();" onmouseup="event.stopPropagation();" ontouchend="event.stopPropagation();">
                    ${pickerItems}
                </div>
            </div>
        `;
    }

    static renderReactionBlock(contentType, contentId) {
        const isAdmin = (window.currentUserRole === 'admin' || window.currentUserRole === 'cr' || window.isAdminEmail(window.currentUserEmail));
        const reactions = this.cache[contentId] || [];
        const myReaction = reactions.find(r => r.user_id === window.authState?.user?.id);
        const activeClass = myReaction ? 'bg-indigo-50 border border-indigo-100 hover:bg-indigo-100' : 'bg-[#f3f4f6] border border-transparent hover:bg-slate-200';

        return `
            <div class="flex items-center justify-end w-full" id="reaction-block-${contentId}">
                <div class="flex items-center gap-[6px] px-[10px] py-[4px] rounded-[20px] shrink-0 min-w-0 transition-colors ${activeClass}">
                    ${this.getReactionPickerHTML(contentType, contentId)}
                    ${this.getReactionSummaryHTML(contentType, contentId)}
                </div>
                ${isAdmin ? `
                <button onclick="event.stopPropagation(); triggerImmediateNotification('${contentType}', '${contentId}', this)" class="px-2.5 py-1.5 bg-[#4226E9] hover:bg-[#341BC5] text-white rounded-[6px] text-[10px] font-bold transition-colors flex items-center gap-1 shrink-0 ml-3 mr-[2px]">
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

        let headerHtml = `<div onclick="window.ReactionService.renderModalList('all')" class="px-4 py-2 border-b-2 ${filterType === 'all' ? 'border-[#4226E9] text-[#4226E9]' : 'border-transparent text-slate-500'} font-bold cursor-pointer whitespace-nowrap transition-colors">All ${this.currentModalReactions.length}</div>`;
        
        Object.keys(counts).sort((a,b) => counts[b] - counts[a]).forEach(type => {
            const isActive = filterType === type;
            headerHtml += `<div onclick="window.ReactionService.renderModalList('${type}')" class="px-4 py-2 border-b-2 ${isActive ? 'border-[#4226E9] text-[#4226E9]' : 'border-transparent text-slate-500'} font-bold flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 whitespace-nowrap transition-colors"><img src="${REACTION_ICONS[type]}" class="w-4 h-4"> ${counts[type]}</div>`;
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
                        <div class="relative w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center border border-slate-100 shrink-0">
                            ${avatarHtml}
                            <img src="${REACTION_ICONS[r.reaction_type]}" class="absolute -bottom-1 -right-1 w-4 h-4 border border-white rounded-full bg-white shadow-sm">
                        </div>
                        <span class="font-bold text-slate-800 text-[14px]">${name}</span>
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
        let roleClass = 'bg-slate-100 text-slate-500 border border-slate-200';
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
        let avatarHtml = `<span class="font-bold text-[12px] text-slate-400 m-0">${initial}</span>`;
        if (pData.profile_url) {
            avatarHtml = `<img src="${window.sanitizeUrl(pData.profile_url)}" class="w-full h-full object-cover rounded-full m-0">`;
        }

        return `
            <div class="flex items-start justify-between w-full mb-[8px] overflow-hidden">
                <div class="flex items-start gap-2.5 min-w-0 w-full">
                    <div class="w-[28px] h-[28px] rounded-full bg-slate-200 shrink-0 flex items-center justify-center relative overflow-hidden ring-1 ring-slate-100 m-0">
                        ${avatarHtml}
                    </div>
                    <div class="flex flex-col gap-[4px] min-w-0 flex-1 m-0">
                        <div class="flex justify-between items-center w-full m-0">
                            <div class="flex items-center gap-[6px] min-w-0">
                                <span class="text-[12px] font-semibold text-gray-800 leading-none tracking-tight shrink-0 m-0">${name}</span>
                                <span class="text-[10px] font-bold px-[5px] py-[1.5px] rounded-[4px] leading-[1.2] shrink-0 uppercase tracking-[0.03em] ${roleClass} flex items-center w-auto max-w-full m-0">${roleIcon}${roleDisplay}</span>
                            </div>
                            ${postedTimeStr ? `<span class="text-[11px] font-normal text-gray-500 shrink-0 m-0">${postedTimeStr}</span>` : ''}
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

// Global outside click dismissal for Reaction Picker menus
document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.reaction-container')) {
        document.querySelectorAll('.reaction-container.force-hovered, .reaction-container.hovered').forEach(el => {
            el.classList.remove('force-hovered', 'hovered');
        });
    }
});
