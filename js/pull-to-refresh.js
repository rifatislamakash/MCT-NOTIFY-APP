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
            // Ignore if touching interactive elements like buttons, inputs, links, textareas
            if (e.target.closest('button, a, input, textarea, select, [role="button"], [onclick]')) {
                return;
            }

            // Robust check: Ensure all scrollable parent containers are at scrollTop 0
            let isAtTop = true;
            let el = e.target;
            while (el && el !== document.body && el !== document.documentElement) {
                if (el.nodeType === 1) { // Element node
                    const style = window.getComputedStyle(el);
                    const overflowY = style.overflowY;
                    if (overflowY === 'auto' || overflowY === 'scroll' || el.classList.contains('overflow-y-auto')) {
                        if (el.scrollTop > 0) {
                            isAtTop = false;
                            break;
                        }
                    }
                }
                el = el.parentNode;
            }

            if (!isAtTop) return;
            if (document.documentElement.scrollTop > 0 || document.body.scrollTop > 0) return;

            startY = e.touches[0].clientY;
            startX = e.touches[0].clientX;
            currentY = startY;
            isPulling = true;
            isHorizontalSwipe = false;
            ptrSpinner.style.transition = 'none';
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            currentY = e.touches[0].clientY;
            const currentX = e.touches[0].clientX;
            
            let dy = currentY - startY;
            let dx = Math.abs(currentX - startX);

            // If the user swiped horizontally more than vertically initially, cancel pull
            if (!isHorizontalSwipe && dx > Math.abs(dy) && dx > 10) {
                isHorizontalSwipe = true;
                isPulling = false;
                ptrSpinner.style.transform = 'translateY(-100%)';
                return;
            }

            // Only pull if pulling down significantly
            if (dy > 15 && !isHorizontalSwipe) {
                /* preventDefault removed to fix iOS WebKit thread freeze */
                
                // Visual pull effect with resistance
                let pullDistance = Math.min((dy - 15) * 0.4, 80); 
                ptrSpinner.style.transform = `translateY(${pullDistance - 64}px)`;
            } else if (dy < 0) {
                // Scrolled up, cancel pull
                isPulling = false;
                ptrSpinner.style.transform = 'translateY(-100%)';
            }
        }, { passive: false });

        document.addEventListener('touchend', () => {
            if (!isPulling) return;
            isPulling = false;
            
            if (isHorizontalSwipe) return;
            
            let dy = currentY - startY;
            ptrSpinner.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

            // Trigger threshold tuned to 100px for a solid pull
            if (dy > 100) {
                ptrSpinner.style.transform = 'translateY(16px)';
                if (typeof showLoader === 'function') {
                    showLoader(true, "Refreshing...");
                }
                setTimeout(() => {
                    if (typeof window.location.reload === 'function') {
                        window.location.reload();
                    }
                }, 300);
            } else {
                // Snap back on low pull / miss pull
                ptrSpinner.style.transform = 'translateY(-100%)';
            }
            
            currentY = 0;
            startY = 0;
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPTR);
    } else {
        initPTR();
    }
})();
