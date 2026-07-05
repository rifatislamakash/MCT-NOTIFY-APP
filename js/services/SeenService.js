export class SeenService {
    static cache = {}; // { contentId: [ { user_id, profiles: {} }, ... ] }
    static pendingMarks = {};

    static async fetchSeenForContent(contentType, contentIds) {
        if (!contentIds || contentIds.length === 0) return;
        
        try {
            // Uncached IDs
            const idsToFetch = contentIds.filter(id => !this.cache[id]);
            if (idsToFetch.length === 0) return;
            
            idsToFetch.forEach(id => { this.cache[id] = []; });
            
            const { data, error } = await window.supabase
                .from('item_views')
                .select(`
                    user_id,
                    item_id,
                    created_at,
                    profiles (
                        full_name,
                        avatar_url,
                        batch
                    )
                `)
                .eq('item_type', contentType)
                .in('item_id', idsToFetch)
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            if (data) {
                data.forEach(row => {
                    this.cache[row.item_id].push(row);
                });
            }
        } catch (error) {
            console.error(`[SEEN] Error fetching seen for ${contentType}:`, error);
        }
    }

    static async markAsSeen(contentId, contentType) {
        if (!window.authState?.user) return; // Must be logged in
        if (!contentId || !contentType) return;

        // Prevent rapid duplicate requests in a session
        const lockKey = `${contentId}_${contentType}`;
        if (this.pendingMarks[lockKey]) return;
        
        const userId = window.authState.user.id;
        
        // Ensure cache initialized
        if (!this.cache[contentId]) this.cache[contentId] = [];
        
        // Check if already seen locally
        if (this.cache[contentId].some(s => s.user_id === userId)) {
            return; // Already seen
        }

        this.pendingMarks[lockKey] = true;

        try {
            // Optimistic Update
            const profile = window.authState.profile || { full_name: 'Me', avatar_url: null, batch: null };
            this.cache[contentId].unshift({
                user_id: userId,
                item_id: contentId,
                created_at: new Date().toISOString(),
                profiles: profile
            });

            // Update DOM if it exists
            this.updateSeenDOM(contentId, contentType);

            // Send to backend via RPC
            const { error } = await window.supabase.rpc('mark_as_seen', {
                p_item_id: contentId,
                p_item_type: contentType
            });

            if (error) throw error;
        } catch (error) {
            console.error("[SEEN] Failed to mark as seen:", error);
            // Revert on error (optional, but for seen we can just silently fail)
        }
    }

    static renderSeenBlock(contentType, contentId) {
        const seen = this.cache[contentId] || [];
        const total = seen.length;
        if (total === 0) return `<div id="seen-block-${contentId}" class="seen-block-container empty hidden"></div>`;

        let avatarsHtml = '';
        const displaySeen = seen.slice(0, 3);
        avatarsHtml = displaySeen.map((s, idx) => `
            <img src="${s.profiles?.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(s.profiles?.full_name || 'U') + '&background=random'}" 
                 class="w-[26px] h-[26px] rounded-full border-[2.5px] border-white dark:border-dark-card object-cover pointer-events-none shadow-sm" 
                 style="margin-left: ${idx > 0 ? '-10px' : '0'}; z-index: ${10 - idx};" 
                 alt="${s.profiles?.full_name || 'User'}">
        `).join('');
        
        if (total > 3) {
            avatarsHtml += `
                <div class="w-[26px] h-[26px] rounded-full border-[2.5px] border-white dark:border-dark-card bg-slate-800 dark:bg-slate-700 text-white text-[9px] font-bold flex items-center justify-center shrink-0 shadow-sm" 
                     style="margin-left: -10px; z-index: 7;">
                    +${total - 3}
                </div>
            `;
        }

        return `
            <div id="seen-block-${contentId}" class="seen-block-container flex items-center cursor-pointer hover:opacity-80 transition-opacity mr-2"
                 onclick="event.stopPropagation(); window.SeenService.openSeenList('${contentType}', '${contentId}')"
                 title="${total} viewed this">
                ${avatarsHtml}
            </div>
        `;
    }

    static updateSeenDOM(contentId, contentType) {
        const block = document.getElementById(`seen-block-${contentId}`);
        if (block) {
            block.outerHTML = this.renderSeenBlock(contentType, contentId);
        }
    }

    static openSeenList(contentType, contentId) {
        const seen = this.cache[contentId] || [];
        if (seen.length === 0) return;

        // Use the Reaction modal container logic to display a beautiful list
        const modal = document.getElementById('reaction-details-modal');
        const overlay = document.getElementById('reaction-details-overlay');
        const header = document.getElementById('who-reacted-header');
        const list = document.getElementById('who-reacted-list');
        const title = document.getElementById('reaction-details-title');

        if (!modal || !header || !list || !title) return;

        title.innerText = "Seen By";
        header.innerHTML = `<div class="px-4 py-3 flex items-center gap-2 border-b-2 border-[#4226E9] text-[#4226E9] font-bold text-[13px]"><i data-lucide="eye" class="w-4 h-4"></i> Viewers (${seen.length})</div>`;
        
        list.innerHTML = seen.map(s => `
            <div class="flex items-center gap-3 p-3 border-b border-slate-50 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-dark-bg/50 transition-colors">
                <img src="${s.profiles?.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(s.profiles?.full_name || 'U') + '&background=random'}" 
                     class="w-10 h-10 rounded-full object-cover shrink-0 bg-slate-100">
                <div class="flex-1 min-w-0">
                    <h5 class="text-[14px] font-bold text-slate-800 dark:text-dark-text truncate leading-tight">${s.profiles?.full_name || 'Unknown User'}</h5>
                    ${s.profiles?.batch ? `<p class="text-[11px] text-slate-500 dark:text-dark-textSecondary mt-0.5 truncate">Batch ${s.profiles.batch}</p>` : ''}
                </div>
            </div>
        `).join('');

        if (window.lucide) window.lucide.createIcons();

        // Show modal
        modal.classList.remove('pointer-events-none', 'opacity-0', 'translate-y-full');
        modal.classList.add('translate-y-0');
        overlay.classList.remove('pointer-events-none', 'opacity-0');
    }
    
    // Setup intersection observer for feed auto-marking
    static initScrollTracking() {
        if (!('IntersectionObserver' in window)) return;
        
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const type = el.getAttribute('data-seen-type');
                    const id = el.getAttribute('data-seen-id');
                    if (id && type) {
                        this.markAsSeen(id, type);
                        // Once marked, stop observing to save resources
                        this.observer.unobserve(el);
                    }
                }
            });
        }, { threshold: 0.5, rootMargin: '0px' });
    }

    static observeElement(element, type, id) {
        if (this.observer && element) {
            element.setAttribute('data-seen-type', type);
            element.setAttribute('data-seen-id', id);
            this.observer.observe(element);
        }
    }
}

window.SeenService = SeenService;
