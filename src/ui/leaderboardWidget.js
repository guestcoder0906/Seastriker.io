export class LeaderboardWidget {
    constructor(game) {
        this.game = game;
        this.container = document.getElementById('leaderboard');
        this.playersList = document.getElementById('players-list');
        
        this.isMinimized = false;
        this.isExpanded = false;
        
        // Dragging state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.containerStartX = 0;
        this.containerStartY = 0;
        this.currentDragX = 0;
        this.currentDragY = 0;
        this.dragRafId = null;
        
        // Resizing state
        this.isResizing = false;
        this.resizeStartX = 0;
        this.resizeStartY = 0;
        this.startWidth = 220;
        this.startHeight = 200;
        this.startLeft = 0;
        this.startTop = 0;
        this.currentResizeX = 0;
        this.currentResizeY = 0;
        this.resizeSide = 'left'; // 'left' or 'right'
        this.resizeRafId = null;
        
        this.defaultWidth = 220;
        this.defaultHeight = 200;
        this.expandedWidth = 320;
        this.expandedHeight = 360;
        
        this.cachedPlayersData = [];
        this.pendingUpdate = false;
        
        this.init();
    }

    init() {
        if (!this.container) return;

        // Ensure proper base styles and structure
        this.container.classList.add('custom-leaderboard-widget');
        
        // Create header structure with clear grip and other-side resize handle
        this.container.innerHTML = `
            <div id="leaderboard-header" class="leaderboard-header" title="Drag to move">
                <div class="leaderboard-title-wrap">
                    <span class="leaderboard-drag-grip" title="Drag to move">⋮⋮</span>
                    <span class="leaderboard-icon">🏆</span>
                    <span class="leaderboard-title">Leaderboard</span>
                    <span id="leaderboard-count-badge" class="leaderboard-count-badge">0</span>
                </div>
                <div class="leaderboard-controls">
                    <button type="button" id="leaderboard-expand-btn" class="leaderboard-btn" title="Expand / Contract" aria-label="Expand or contract leaderboard">
                        <svg class="expand-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <polyline points="9 21 3 21 3 15"></polyline>
                            <line x1="21" y1="3" x2="14" y2="10"></line>
                            <line x1="3" y1="21" x2="10" y2="14"></line>
                        </svg>
                        <svg class="contract-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                            <polyline points="4 14 10 14 10 20"></polyline>
                            <polyline points="20 10 14 10 14 4"></polyline>
                            <line x1="14" y1="10" x2="21" y2="3"></line>
                            <line x1="10" y1="14" x2="3" y2="21"></line>
                        </svg>
                    </button>
                    <button type="button" id="leaderboard-minimize-btn" class="leaderboard-btn" title="Minimize / Restore" aria-label="Minimize leaderboard">
                        <span class="min-icon">−</span>
                    </button>
                </div>
            </div>
            <div id="leaderboard-body" class="leaderboard-body">
                <div class="leaderboard-column-headers">
                    <span class="col-rank"># STRIKER</span>
                    <span class="col-kills">KILLS</span>
                </div>
                <div id="players-list" class="players-list"></div>
            </div>
            <!-- Resize handle placed on the other side (bottom-left corner) -->
            <div id="leaderboard-resize-handle-left" class="leaderboard-resize-handle leaderboard-resize-handle-left" title="Drag corner to expand or contract">
                <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor">
                    <circle cx="2" cy="8" r="1.2"></circle>
                    <circle cx="6" cy="8" r="1.2"></circle>
                    <circle cx="2" cy="4" r="1.2"></circle>
                </svg>
            </div>
            <!-- Also support bottom-right corner for convenience -->
            <div id="leaderboard-resize-handle-right" class="leaderboard-resize-handle leaderboard-resize-handle-right" title="Drag corner to expand or contract">
                <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor">
                    <circle cx="8" cy="8" r="1.2"></circle>
                    <circle cx="4" cy="8" r="1.2"></circle>
                    <circle cx="8" cy="4" r="1.2"></circle>
                </svg>
            </div>
        `;

        this.header = document.getElementById('leaderboard-header');
        this.body = document.getElementById('leaderboard-body');
        this.playersList = document.getElementById('players-list');
        this.minimizeBtn = document.getElementById('leaderboard-minimize-btn');
        this.expandBtn = document.getElementById('leaderboard-expand-btn');
        this.resizeHandleLeft = document.getElementById('leaderboard-resize-handle-left');
        this.resizeHandleRight = document.getElementById('leaderboard-resize-handle-right');
        this.countBadge = document.getElementById('leaderboard-count-badge');

        this.setupEventInterceptors();
        this.setupDragging();
        this.setupResizing();
        this.setupToggles();
    }

    setupEventInterceptors() {
        // Prevent mouse/touch/wheel on leaderboard from passing to canvas
        const stopProp = (e) => {
            e.stopPropagation();
        };

        const events = ['mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'touchend', 'wheel'];
        events.forEach(evName => {
            this.container.addEventListener(evName, stopProp, { passive: false });
        });
    }

    setupToggles() {
        if (this.minimizeBtn) {
            this.minimizeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMinimize();
            });
        }

        if (this.expandBtn) {
            this.expandBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleExpand();
            });
        }

        // Double click header to toggle minimize
        if (this.header) {
            this.header.addEventListener('dblclick', (e) => {
                if (e.target.closest('.leaderboard-btn')) return;
                this.toggleMinimize();
            });
        }
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        
        if (this.isMinimized) {
            this.container.classList.add('minimized');
            if (this.minimizeBtn) {
                this.minimizeBtn.innerHTML = '<span class="min-icon">+</span>';
                this.minimizeBtn.title = 'Restore';
            }
        } else {
            this.container.classList.remove('minimized');
            if (this.minimizeBtn) {
                this.minimizeBtn.innerHTML = '<span class="min-icon">−</span>';
                this.minimizeBtn.title = 'Minimize';
            }
        }
    }

    toggleExpand() {
        if (this.isMinimized) {
            this.toggleMinimize();
        }

        this.isExpanded = !this.isExpanded;
        const expandIcon = this.expandBtn?.querySelector('.expand-icon');
        const contractIcon = this.expandBtn?.querySelector('.contract-icon');

        if (this.isExpanded) {
            this.container.classList.add('expanded');
            this.container.style.width = `${this.expandedWidth}px`;
            this.container.style.height = `${this.expandedHeight}px`;
            if (expandIcon) expandIcon.style.display = 'none';
            if (contractIcon) contractIcon.style.display = 'block';
            if (this.expandBtn) this.expandBtn.title = 'Contract';
        } else {
            this.container.classList.remove('expanded');
            this.container.style.width = `${this.defaultWidth}px`;
            this.container.style.height = `${this.defaultHeight}px`;
            if (expandIcon) expandIcon.style.display = 'block';
            if (contractIcon) contractIcon.style.display = 'none';
            if (this.expandBtn) this.expandBtn.title = 'Expand';
        }
    }

    setupDragging() {
        if (!this.header) return;

        const updateDragPosition = () => {
            if (!this.isDragging) return;

            const deltaX = this.currentDragX - this.dragStartX;
            const deltaY = this.currentDragY - this.dragStartY;

            let newLeft = this.containerStartX + deltaX;
            let newTop = this.containerStartY + deltaY;

            // Viewport boundary clamping
            const maxLeft = Math.max(0, window.innerWidth - this.container.offsetWidth);
            const maxTop = Math.max(0, window.innerHeight - this.container.offsetHeight);

            newLeft = Math.max(5, Math.min(maxLeft - 5, newLeft));
            newTop = Math.max(5, Math.min(maxTop - 5, newTop));

            this.container.style.left = `${newLeft}px`;
            this.container.style.top = `${newTop}px`;

            this.dragRafId = null;
        };

        const onDragStart = (e) => {
            if (e.target.closest('.leaderboard-btn')) return;
            e.preventDefault();
            e.stopPropagation();

            this.isDragging = true;
            const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const clientY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

            this.dragStartX = clientX;
            this.dragStartY = clientY;
            this.currentDragX = clientX;
            this.currentDragY = clientY;

            const rect = this.container.getBoundingClientRect();
            this.containerStartX = rect.left;
            this.containerStartY = rect.top;

            this.container.style.right = 'auto';
            this.container.style.bottom = 'auto';
            this.container.style.left = `${this.containerStartX}px`;
            this.container.style.top = `${this.containerStartY}px`;

            this.container.classList.add('dragging');
            document.body.classList.add('leaderboard-drag-active');

            if (this.header.setPointerCapture && e.pointerId !== undefined) {
                try {
                    this.header.setPointerCapture(e.pointerId);
                } catch (err) {}
            }
        };

        const onDragMove = (e) => {
            if (!this.isDragging) return;
            e.preventDefault();
            e.stopPropagation();

            this.currentDragX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : this.currentDragX);
            this.currentDragY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : this.currentDragY);

            if (!this.dragRafId) {
                this.dragRafId = requestAnimationFrame(updateDragPosition);
            }
        };

        const onDragEnd = (e) => {
            if (!this.isDragging) return;
            this.isDragging = false;
            
            if (this.dragRafId) {
                cancelAnimationFrame(this.dragRafId);
                this.dragRafId = null;
            }

            this.container.classList.remove('dragging');
            document.body.classList.remove('leaderboard-drag-active');

            if (this.header.releasePointerCapture && e && e.pointerId !== undefined) {
                try {
                    this.header.releasePointerCapture(e.pointerId);
                } catch (err) {}
            }

            // If an update was queued while dragging, render it now
            if (this.pendingUpdate) {
                this.pendingUpdate = false;
                this.renderPlayersList(this.cachedPlayersData);
            }
        };

        // Pointer Events (fastest, unified path)
        if (window.PointerEvent) {
            this.header.addEventListener('pointerdown', onDragStart, { passive: false });
            window.addEventListener('pointermove', onDragMove, { passive: false });
            window.addEventListener('pointerup', onDragEnd);
            window.addEventListener('pointercancel', onDragEnd);
        } else {
            // Mouse fallbacks
            this.header.addEventListener('mousedown', onDragStart);
            window.addEventListener('mousemove', onDragMove);
            window.addEventListener('mouseup', onDragEnd);

            // Touch fallbacks
            this.header.addEventListener('touchstart', onDragStart, { passive: false });
            window.addEventListener('touchmove', onDragMove, { passive: false });
            window.addEventListener('touchend', onDragEnd);
        }
    }

    setupResizing() {
        const updateResizeDimensions = () => {
            if (!this.isResizing) return;

            const deltaX = this.currentResizeX - this.resizeStartX;
            const deltaY = this.currentResizeY - this.resizeStartY;

            let newWidth, newHeight, newLeft;
            const minW = 180;
            const maxW = Math.min(500, window.innerWidth - 20);
            const minH = 130;
            const maxH = Math.min(window.innerHeight - 20, 650);

            if (this.resizeSide === 'left') {
                newWidth = this.startWidth - deltaX;
                newWidth = Math.max(minW, Math.min(maxW, newWidth));
                newLeft = this.startLeft + (this.startWidth - newWidth);
                newLeft = Math.max(5, newLeft);

                this.container.style.left = `${newLeft}px`;
            } else {
                newWidth = this.startWidth + deltaX;
                newWidth = Math.max(minW, Math.min(maxW, newWidth));
            }

            newHeight = this.startHeight + deltaY;
            newHeight = Math.max(minH, Math.min(maxH, newHeight));

            this.container.style.width = `${newWidth}px`;
            this.container.style.height = `${newHeight}px`;

            this.defaultWidth = newWidth;
            this.defaultHeight = newHeight;

            this.resizeRafId = null;
        };

        const attachHandle = (handleEl, side) => {
            if (!handleEl) return;

            const onResizeStart = (e) => {
                if (this.isMinimized) return;
                e.preventDefault();
                e.stopPropagation();

                this.isResizing = true;
                this.resizeSide = side;

                const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
                const clientY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

                this.resizeStartX = clientX;
                this.resizeStartY = clientY;
                this.currentResizeX = clientX;
                this.currentResizeY = clientY;

                const rect = this.container.getBoundingClientRect();
                this.startWidth = rect.width;
                this.startHeight = rect.height;
                this.startLeft = rect.left;
                this.startTop = rect.top;

                if (side === 'left') {
                    this.container.style.right = 'auto';
                    this.container.style.left = `${rect.left}px`;
                    this.container.style.top = `${rect.top}px`;
                }

                this.container.classList.add('resizing');
                document.body.classList.add('leaderboard-resize-active');

                if (handleEl.setPointerCapture && e.pointerId !== undefined) {
                    try {
                        handleEl.setPointerCapture(e.pointerId);
                    } catch (err) {}
                }
            };

            const onResizeMove = (e) => {
                if (!this.isResizing || this.resizeSide !== side) return;
                e.preventDefault();
                e.stopPropagation();

                this.currentResizeX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : this.currentResizeX);
                this.currentResizeY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : this.currentResizeY);

                if (!this.resizeRafId) {
                    this.resizeRafId = requestAnimationFrame(updateResizeDimensions);
                }
            };

            const onResizeEnd = (e) => {
                if (!this.isResizing) return;
                this.isResizing = false;

                if (this.resizeRafId) {
                    cancelAnimationFrame(this.resizeRafId);
                    this.resizeRafId = null;
                }

                this.container.classList.remove('resizing');
                document.body.classList.remove('leaderboard-resize-active');

                if (handleEl.releasePointerCapture && e && e.pointerId !== undefined) {
                    try {
                        handleEl.releasePointerCapture(e.pointerId);
                    } catch (err) {}
                }

                if (this.pendingUpdate) {
                    this.pendingUpdate = false;
                    this.renderPlayersList(this.cachedPlayersData);
                }
            };

            if (window.PointerEvent) {
                handleEl.addEventListener('pointerdown', onResizeStart, { passive: false });
                window.addEventListener('pointermove', onResizeMove, { passive: false });
                window.addEventListener('pointerup', onResizeEnd);
                window.addEventListener('pointercancel', onResizeEnd);
            } else {
                handleEl.addEventListener('mousedown', onResizeStart);
                window.addEventListener('mousemove', onResizeMove);
                window.addEventListener('mouseup', onResizeEnd);

                handleEl.addEventListener('touchstart', onResizeStart, { passive: false });
                window.addEventListener('touchmove', onResizeMove, { passive: false });
                window.addEventListener('touchend', onResizeEnd);
            }
        };

        attachHandle(this.resizeHandleLeft, 'left');
        attachHandle(this.resizeHandleRight, 'right');
    }

    update(players) {
        this.cachedPlayersData = players;

        if (this.countBadge) {
            this.countBadge.textContent = players.length;
        }

        // Avoid destroying and re-rendering DOM nodes while active drag/resize is in progress
        if (this.isDragging || this.isResizing) {
            this.pendingUpdate = true;
            return;
        }

        this.renderPlayersList(players);
    }

    renderPlayersList(players) {
        if (!this.playersList) {
            this.playersList = document.getElementById('players-list');
            if (!this.playersList) return;
        }

        const currentScroll = this.playersList.scrollTop;
        const fragment = document.createDocumentFragment();

        players.forEach((player, index) => {
            const row = document.createElement('div');
            row.className = 'player-entry';
            if (player.isLocal) row.classList.add('is-local');
            if (player.isAI) row.classList.add('is-ai');

            let rankDisplay = `${index + 1}`;
            if (index === 0) rankDisplay = '🥇';
            else if (index === 1) rankDisplay = '🥈';
            else if (index === 2) rankDisplay = '🥉';

            const nameWrap = document.createElement('div');
            nameWrap.className = 'player-name-wrap';

            const rankEl = document.createElement('span');
            rankEl.className = 'player-rank';
            rankEl.textContent = rankDisplay;

            const nameEl = document.createElement('span');
            nameEl.className = 'player-name';
            nameEl.textContent = player.name;
            if (player.isLocal) {
                nameEl.textContent += ' (You)';
            }

            nameWrap.appendChild(rankEl);
            nameWrap.appendChild(nameEl);

            const killsEl = document.createElement('div');
            killsEl.className = 'player-kills-badge';
            killsEl.textContent = player.kills || 0;

            row.appendChild(nameWrap);
            row.appendChild(killsEl);
            fragment.appendChild(row);
        });

        this.playersList.innerHTML = '';
        this.playersList.appendChild(fragment);
        this.playersList.scrollTop = currentScroll;
    }
}
