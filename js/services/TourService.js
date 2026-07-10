// TourService.js - MCT Notify App Onboarding Tour Service

export class TourService {
    static steps = [
        {
            selector: '#tag-scroll-container',
            title: 'Today at a Glance',
            description: 'Get a quick summary of your day including exams, classes, and unread notice counters.'
        },
        {
            selector: '#dashboard-quick-access-section',
            title: 'Quick Access Actions',
            description: 'Access shortcuts to Routines, Materials, and schedules. Swipe horizontally on the buttons to access more items!'
        },
        {
            selector: '#dashboard-today-routine',
            title: "Today's Classes",
            description: "View your classes for today (or tomorrow), faculty initials, room assignments, and real-time class states."
        },
        {
            selector: '#dashboard-recent-notices',
            title: 'Unread Updates',
            description: 'Read the latest general announcements, homework assignments, and newly added routines.'
        },
        {
            selector: '.nav-profile-btn',
            title: 'Profile & Settings',
            description: 'Edit your name, update your profile picture, change notification settings, or sign out safely.'
        }
    ];

    static currentStep = 0;
    static overlayEl = null;
    static spotlightEl = null;
    static cardEl = null;
    static _scrollListener = null;

    static async checkAndStartTour() {
        if (!window.authState?.user) return;

        // 1. Check local storage
        if (localStorage.getItem('mct_app_tour_completed') === 'true') {
            console.log("[TOUR] Skipped: completed locally");
            return;
        }

        // 2. Check Supabase profile state
        if (window.authState.profile?.tour_completed) {
            console.log("[TOUR] Skipped: profile tour_completed is true. Syncing to local storage.");
            localStorage.setItem('mct_app_tour_completed', 'true');
            return;
        }

        // 3. Initiate tour after a short delay to let dashboard settle
        console.log("[TOUR] Initializing onboarding app tour...");
        setTimeout(() => {
            // Check again that we are on the student dashboard before launching
            if (window.isScreenActive && window.isScreenActive('screen-student-dashboard')) {
                this.startTour();
            }
        }, 1500);
    }

    static startTour() {
        this.cleanup();
        this.currentStep = 0;

        const shell = document.getElementById('app-viewport-shell') || document.body;

        // Create overlay container
        const overlay = document.createElement('div');
        overlay.id = 'tour-overlay-root';
        overlay.style.cssText = `
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            z-index: 99998; pointer-events: none; overflow: hidden;
            background: rgba(0,0,0,0.1);
        `;

        // Create spotlight mask element
        const spotlight = document.createElement('div');
        spotlight.id = 'tour-spotlight-mask';
        spotlight.style.cssText = `
            position: absolute; border-radius: 16px;
            box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.75);
            z-index: 99999; pointer-events: none;
            transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        // Create tooltip card container
        const card = document.createElement('div');
        card.id = 'tour-tooltip-card';
        card.style.cssText = `
            position: absolute; z-index: 999999;
            transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: auto; width: 280px;
        `;

        overlay.appendChild(spotlight);
        overlay.appendChild(card);
        shell.appendChild(overlay);

        this.overlayEl = overlay;
        this.spotlightEl = spotlight;
        this.cardEl = card;

        this.renderStep();
    }

    static renderStep() {
        if (this.currentStep >= this.steps.length) {
            this.finishTour();
            return;
        }

        // Clean up previous scroll listener if any
        if (this._scrollListener) {
            this._scrollListener.el.removeEventListener('scroll', this._scrollListener.fn);
            this._scrollListener = null;
        }

        const step = this.steps[this.currentStep];
        const targetEl = document.querySelector(step.selector);

        if (!targetEl) {
            console.warn(`[TOUR] Target selector not found: ${step.selector}, skipping to next.`);
            this.currentStep++;
            this.renderStep();
            return;
        }

        // Scroll the element into view inside the scroll parent if necessary
        targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });

        // Step 2 is the Quick Access section - require swipe scroll
        const isQuickAccessStep = this.currentStep === 1;
        const nextButtonHtml = isQuickAccessStep
            ? `<button id="tour-next-btn" disabled class="bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500 text-[11px] font-bold px-3 py-1.5 rounded-lg outline-none cursor-not-allowed transition-all">Swipe left to unlock</button>`
            : `<button onclick="window.TourService.nextStep()" class="bg-[#4226E9] hover:bg-[#341BC5] text-white text-[11px] font-extrabold px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all outline-none">
                ${this.currentStep === this.steps.length - 1 ? 'Finish' : 'Next'}
               </button>`;

        // Update card contents
        this.cardEl.innerHTML = `
            <div class="bg-white dark:bg-dark-card rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-4 border border-slate-100 dark:border-white/5 flex flex-col gap-2.5">
                <div class="flex justify-between items-center">
                    <span class="text-[9px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Step ${this.currentStep + 1} of ${this.steps.length}</span>
                    <button onclick="window.TourService.skipTour()" class="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-dark-textSecondary active:scale-95 transition-all outline-none">Skip guide</button>
                </div>
                <h4 class="font-extrabold text-[13px] text-slate-800 dark:text-dark-text leading-tight">${step.title}</h4>
                <p class="text-[11px] text-slate-500 dark:text-dark-textSecondary leading-relaxed">${step.description}</p>
                <div class="flex justify-between items-center mt-1">
                    <button onclick="window.TourService.prevStep()" class="text-[11px] font-bold text-slate-400 hover:text-slate-600 active:scale-95 transition-all outline-none ${this.currentStep === 0 ? 'invisible' : ''}">Back</button>
                    ${nextButtonHtml}
                </div>
            </div>
        `;

        // Scroll detector for Step 2 Quick Access
        if (isQuickAccessStep) {
            setTimeout(() => {
                const scrollContainer = document.getElementById('quick-access-scroll-container');
                if (scrollContainer) {
                    const onScroll = () => {
                        if (scrollContainer.scrollLeft > 20) {
                            scrollContainer.removeEventListener('scroll', onScroll);
                            this._scrollListener = null;
                            
                            const nextBtn = document.getElementById('tour-next-btn');
                            if (nextBtn) {
                                nextBtn.removeAttribute('disabled');
                                nextBtn.innerText = 'Next';
                                nextBtn.className = 'bg-[#4226E9] hover:bg-[#341BC5] text-white text-[11px] font-extrabold px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all outline-none cursor-pointer';
                                nextBtn.onclick = () => window.TourService.nextStep();
                            }
                        }
                    };
                    scrollContainer.addEventListener('scroll', onScroll);
                    this._scrollListener = { el: scrollContainer, fn: onScroll };
                }
            }, 150);
        }

        // Update spotlight and card positioning on next tick (so scroll has started)
        setTimeout(() => {
            if (!this.overlayEl) return;
            
            const shell = document.getElementById('app-viewport-shell') || document.body;
            const rect = targetEl.getBoundingClientRect();
            const shellRect = shell.getBoundingClientRect();

            const top = rect.top - shellRect.top;
            const left = rect.left - shellRect.left;
            const width = rect.width;
            const height = rect.height;

            // Apply spotlight highlight with a small padding
            this.spotlightEl.style.top = `${top - 6}px`;
            this.spotlightEl.style.left = `${left - 6}px`;
            this.spotlightEl.style.width = `${width + 12}px`;
            this.spotlightEl.style.height = `${height + 12}px`;

            // Tooltip card positioning logic
            let cardTop = top + height + 12;
            let cardLeft = left + (width / 2) - 140; // Center tooltip horizontally

            // Flip above target if target is too low in the viewport
            if (cardTop + 140 > shellRect.height) {
                cardTop = top - 150;
            }

            // Clamp card boundaries horizontally
            if (cardLeft < 8) cardLeft = 8;
            if (cardLeft + 280 > shellRect.width - 8) {
                cardLeft = shellRect.width - 280 - 8;
            }

            this.cardEl.style.top = `${cardTop}px`;
            this.cardEl.style.left = `${cardLeft}px`;
        }, 100);
    }

    static nextStep() {
        this.currentStep++;
        this.renderStep();
    }

    static prevStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.renderStep();
        }
    }

    static skipTour() {
        this.finishTour();
    }

    static finishTour() {
        console.log("[TOUR] Onboarding tour completed.");
        
        // Save state locally
        localStorage.setItem('mct_app_tour_completed', 'true');
        
        // Save state to database asynchronously
        if (window.authState?.user?.id && window._supabase) {
            window._supabase
                .from('profiles')
                .update({ tour_completed: true })
                .eq('id', window.authState.user.id)
                .then(({ error }) => {
                    if (error) {
                        if (error.message && error.message.includes("tour_completed")) {
                            console.info("[DEVELOPER TIP] Supabase profiles table does not have 'tour_completed' column. Storing completed state locally instead. (To sync across devices, add column: 'tour_completed' type: boolean, default: false)");
                        } else {
                            console.warn("[TOUR] Failed to update tour state in DB:", error);
                        }
                    } else {
                        console.log("[TOUR] Tour state synced to database successfully.");
                    }
                });
        }

        this.cleanup();
    }

    static cleanup() {
        if (this._scrollListener) {
            this._scrollListener.el.removeEventListener('scroll', this._scrollListener.fn);
            this._scrollListener = null;
        }
        if (this.overlayEl) {
            this.overlayEl.remove();
            this.overlayEl = null;
            this.spotlightEl = null;
            this.cardEl = null;
        }
    }
}

// Bind globally for inline HTML event click callbacks
window.TourService = TourService;
window.TourService.nextStep = TourService.nextStep.bind(TourService);
window.TourService.prevStep = TourService.prevStep.bind(TourService);
window.TourService.skipTour = TourService.skipTour.bind(TourService);
