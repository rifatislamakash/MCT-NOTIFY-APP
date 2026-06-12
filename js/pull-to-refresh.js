(function() {
    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    let ptrSpinner = null;
    let touchStartScrollTop = 0;

    function initPTR() {
        if (document.getElementById('ptr-spinner')) return;

        ptrSpinner = document.createElement('div');
        ptrSpinner.id = 'ptr-spinner';
        ptrSpinner.className = 'fixed top-0 inset-x-0 h-16 flex items-center justify-center z-[9999] transition-transform duration-200 pointer-events-none -translate-y-full';
        ptrSpinner.innerHTML = `
            <div class="bg-white rounded-full p-2.5 shadow-md border border-slate-100 flex items-center justify-center mt-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-600 animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            </div>
        `;
        document.body.appendChild(ptrSpinner);

        document.addEventListener('touchstart', (e) => {
            // Check if we are touching a scrollable element or the body
            const scrollContainer = e.target.closest('.overflow-y-auto, .overflow-y-scroll') || document.documentElement;
            touchStartScrollTop = scrollContainer.scrollTop;
            
            // Only initiate pull if we are at the very top
            if (touchStartScrollTop <= 0) {
                startY = e.touches[0].clientY;
                isPulling = true;
                ptrSpinner.style.transition = 'none';
            }
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            currentY = e.touches[0].clientY;
            let dy = currentY - startY;

            // Only pull if pulling down
            if (dy > 0) {
                // Visual pull effect with resistance
                let pullDistance = Math.min(dy * 0.4, 80); 
                ptrSpinner.style.transform = `translateY(${pullDistance - 64}px)`;
            }
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (!isPulling) return;
            isPulling = false;
            let dy = currentY - startY;
            ptrSpinner.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

            // If pulled past threshold (100px), trigger refresh
            if (dy > 120) {
                ptrSpinner.style.transform = 'translateY(16px)';
                if (typeof showLoader === 'function') {
                    showLoader(true, "Refreshing...");
                }
                setTimeout(() => {
                    window.location.reload(true);
                }, 300);
            } else {
                // Snap back
                ptrSpinner.style.transform = 'translateY(-100%)';
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPTR);
    } else {
        initPTR();
    }
})();
