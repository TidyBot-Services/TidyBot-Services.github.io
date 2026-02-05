// ============================================
// TIDYBOT ARMY TIMELINE
// Activity log for autonomous coding agent
// Virtual scrolling for performance
// ============================================

// Activity log data - loaded from logs/entries.json
let activityLog = [];

// Load entries from JSON file
async function loadActivityLog() {
    try {
        // Try relative path first, then absolute
        let response = await fetch('./logs/entries.json');

        if (!response.ok) {
            console.error('Failed to fetch entries:', response.status, response.statusText);
            throw new Error(`HTTP ${response.status}`);
        }

        const entries = await response.json();
        console.log(`Loaded ${entries.length} entries from JSON`);

        // Add ID to each entry
        activityLog = entries.map((entry, index) => ({
            ...entry,
            id: String(index + 1).padStart(3, '0'),
            status: 'completed'
        }));

        return activityLog;
    } catch (error) {
        console.error('Failed to load activity log:', error);

        // Fallback: show error message in UI
        const container = document.querySelector('.events-viewport');
        if (container) {
            container.innerHTML = `<div style="color: var(--color-warning); padding: 2rem; font-family: var(--font-mono);">
                Failed to load entries. Check console for details.<br>
                Error: ${error.message}
            </div>`;
        }

        activityLog = [];
        return activityLog;
    }
}

// Type labels and colors (EVA palette)
const typeConfig = {
    setup: { label: 'Setup', color: '#9d4edd' },
    feature: { label: 'Feature', color: '#39ff14' },
    fix: { label: 'Bug Fix', color: '#ff3366' },
    refactor: { label: 'Refactor', color: '#ff6b00' },
    test: { label: 'Testing', color: '#00d4ff' },
    docs: { label: 'Docs', color: '#6b6b7b' },
    deploy: { label: 'Deploy', color: '#ff6b00' }
};

// Virtual scrolling config
const CARD_BUFFER = 3;   // Cards to render on each side of current

// State
let currentIndex = 0;
let isAnimating = false;
let renderedRange = { start: 0, end: 0 };

// DOM Elements - initialized after DOM ready
let elements = {};

// Initialize
function init() {
    // Start at the newest (last) entry
    currentIndex = activityLog.length - 1;

    updateRenderedCards();
    updateUI();
    updateSliderPosition(false); // No animation on init
    bindEvents();
    initMouseTracking();

    // Position robot after render
    requestAnimationFrame(() => {
        positionRobot();
    });

    // Handle resize
    window.addEventListener('resize', debounce(() => {
        updateSliderPosition(false);
        positionRobot();
    }, 100));

    console.log(`Timeline loaded with ${activityLog.length} entries (virtual scrolling enabled)`);
}

// Debounce utility
function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// Virtual scrolling: only render cards and nodes in visible range
function updateRenderedCards(forceRerender = false) {
    const start = Math.max(0, currentIndex - CARD_BUFFER);
    const end = Math.min(activityLog.length - 1, currentIndex + CARD_BUFFER);

    // Check if we need to re-render
    if (!forceRerender && start === renderedRange.start && end === renderedRange.end) {
        // Just update active state
        updateCardActiveStates();
        return false;
    }

    renderedRange = { start, end };

    // Render nodes and cards together
    const nodesHTML = [];
    const cardsHTML = [];

    for (let i = start; i <= end; i++) {
        const entry = activityLog[i];
        const isActive = i === currentIndex;
        const isPrev = i === currentIndex - 1;
        const isNext = i === currentIndex + 1;

        nodesHTML.push(createNodeHTML(entry, i, isActive));
        cardsHTML.push(createCardHTML(entry, i, isActive, isPrev, isNext));
    }

    elements.timelineNodes.innerHTML = nodesHTML.join('');
    elements.cardsRow.innerHTML = cardsHTML.join('');
    return true; // Did re-render
}

// Create HTML for a single node
function createNodeHTML(entry, index, isActive) {
    return `
        <div class="node-wrapper">
            <div class="timeline-node ${isActive ? 'active' : ''}" data-index="${index}">
                <div class="node-dot" style="--node-color: ${typeConfig[entry.type].color}">
                    <div class="node-pulse"></div>
                    <div class="node-core"></div>
                </div>
                <div class="node-label">
                    <span class="node-number">${entry.timestamp.split(' ')[0].slice(5)}</span>
                    <span class="node-title">${typeConfig[entry.type].label}</span>
                </div>
            </div>
        </div>
    `;
}

// Create HTML for a single card
function createCardHTML(entry, index, isActive, isPrev, isNext) {
    let classes = 'event-card';
    if (isActive) classes += ' active';
    if (isPrev) classes += ' prev';
    if (isNext) classes += ' next-card';

    return `
        <article class="${classes}" data-index="${index}">
            <div class="corner-bl"></div>
            <div class="event-header">
                <span class="event-number">#${entry.id}</span>
                <span class="event-date">${entry.timestamp}</span>
            </div>
            <div class="event-content">
                <span class="event-type" style="--type-color: ${typeConfig[entry.type].color}">
                    ${typeConfig[entry.type].label}
                </span>
                <h2 class="event-title">${entry.title}</h2>
                <p class="event-description">${entry.description}</p>
                <div class="event-files">
                    <span class="files-label">Files changed</span>
                    <div class="files-list">
                        ${entry.files.map(f => `<code class="file-path">${f}</code>`).join('')}
                    </div>
                </div>
            </div>
        </article>
    `;
}

// Update active states without re-rendering
function updateCardActiveStates() {
    // Update cards
    const cards = document.querySelectorAll('.event-card');
    cards.forEach(card => {
        const index = parseInt(card.dataset.index, 10);
        card.classList.remove('active', 'prev', 'next-card');
        if (index === currentIndex) {
            card.classList.add('active');
        } else if (index === currentIndex - 1) {
            card.classList.add('prev');
        } else if (index === currentIndex + 1) {
            card.classList.add('next-card');
        }
    });

    // Update nodes
    const nodes = document.querySelectorAll('.timeline-node');
    nodes.forEach(node => {
        const index = parseInt(node.dataset.index, 10);
        node.classList.toggle('active', index === currentIndex);
    });
}

// Update all UI elements
function updateUI() {
    const entry = activityLog[currentIndex];
    const totalEntries = activityLog.length;

    // Update entry indicator with animation
    animateText(elements.entryNumber, String(currentIndex + 1).padStart(3, '0'));
    animateText(elements.entryType, typeConfig[entry.type].label);

    // Update nav counter
    if (elements.counterCurrent) {
        elements.counterCurrent.textContent = `#${String(currentIndex + 1).padStart(3, '0')}`;
    }

    // Update navigation buttons
    elements.prevBtn.disabled = currentIndex === 0;
    elements.nextBtn.disabled = currentIndex === totalEntries - 1;

    // Position robot
    positionRobot();
}

// Animate text change
function animateText(element, newText) {
    if (!element || element.textContent === newText) return;

    element.style.opacity = '0';
    element.style.transform = 'translateY(10px)';

    setTimeout(() => {
        element.textContent = newText;
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
    }, 200);
}

// Navigation
function goToIndex(index) {
    if (isAnimating || index < 0 || index >= activityLog.length) return;

    isAnimating = true;
    currentIndex = index;

    // Check if target card is currently rendered
    const isRendered = index >= renderedRange.start && index <= renderedRange.end;

    if (isRendered) {
        // Card exists - just animate to it
        updateCardActiveStates();
        updateSliderPosition(true);
        updateUI();

        setTimeout(() => {
            // Update buffer after animation
            const didRerender = updateRenderedCards();
            if (didRerender) {
                updateSliderPosition(false);
            }
            isAnimating = false;
        }, 750);
    } else {
        // Card not rendered - re-render centered on new position, then animate
        // First, snap to approximate position
        elements.eventsSlider.style.transition = 'none';
        updateRenderedCards(true);

        // Position so the "previous" card is visible (to animate FROM)
        const cards = document.querySelectorAll('.event-card');
        const cardWidth = cards[0]?.offsetWidth || 500;
        const gap = 24;
        // Start slightly offset so we can animate in
        const startOffset = (CARD_BUFFER - 1) * (cardWidth + gap);
        elements.eventsSlider.style.transform = `translateX(-${startOffset}px)`;

        // Force reflow
        elements.eventsSlider.offsetHeight;

        // Re-enable transition and animate to correct position
        elements.eventsSlider.style.transition = '';

        requestAnimationFrame(() => {
            updateSliderPosition(true);
            updateUI();
        });

        setTimeout(() => {
            isAnimating = false;
        }, 750);
    }
}

function goToPrev() {
    if (currentIndex > 0) {
        goToIndex(currentIndex - 1);
    }
}

function goToNext() {
    if (currentIndex < activityLog.length - 1) {
        goToIndex(currentIndex + 1);
    }
}

// Update slider position for virtual scrolling
function updateSliderPosition(animate = true) {
    const cards = document.querySelectorAll('.event-card');
    if (cards.length === 0) return;

    // Find the active card in the rendered cards
    let activeCardIndex = -1;
    cards.forEach((card, i) => {
        if (parseInt(card.dataset.index, 10) === currentIndex) {
            activeCardIndex = i;
        }
    });

    if (activeCardIndex === -1) return;

    const card = cards[activeCardIndex];
    const cardWidth = card.offsetWidth;
    const gap = 24;

    // Offset to show the active card (accounting for buffer cards before it)
    const offset = activeCardIndex * (cardWidth + gap);

    if (!animate) {
        elements.eventsSlider.style.transition = 'none';
        elements.eventsSlider.style.transform = `translateX(-${offset}px)`;
        elements.eventsSlider.offsetHeight; // Force reflow
        elements.eventsSlider.style.transition = '';
    } else {
        elements.eventsSlider.style.transform = `translateX(-${offset}px)`;
    }

    // Position robot after slider moves
    requestAnimationFrame(() => positionRobot());
}

// Position robot - now handled by CSS since active card is always at same position
function positionRobot() {
    // Robot position is fixed via CSS at center of first card position
    // This function kept for potential future dynamic positioning
}

// Event bindings
function bindEvents() {
    elements.prevBtn.addEventListener('click', goToPrev);
    elements.nextBtn.addEventListener('click', goToNext);

    elements.timelineNodes.addEventListener('click', (e) => {
        const node = e.target.closest('.timeline-node');
        if (node) {
            const index = parseInt(node.dataset.index, 10);
            goToIndex(index);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') goToPrev();
        if (e.key === 'ArrowRight') goToNext();
    });

    // Touch/swipe
    let touchStartX = 0;
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        const diff = touchStartX - e.changedTouches[0].screenX;
        if (Math.abs(diff) > 50) {
            diff > 0 ? goToNext() : goToPrev();
        }
    }, { passive: true });

    // Mouse wheel on viewport
    elements.eventsViewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.deltaY > 0 ? goToNext() : goToPrev();
    }, { passive: false });
}

// Mouse tracking for card hover effect
function initMouseTracking() {
    document.addEventListener('mousemove', (e) => {
        document.querySelectorAll('.event-card').forEach(card => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mouse-x', `${((e.clientX - rect.left) / rect.width) * 100}%`);
            card.style.setProperty('--mouse-y', `${((e.clientY - rect.top) / rect.height) * 100}%`);
        });
    });
}

// Generate single-layer honeycomb with varied styles
function initHoneycomb() {
    const container = document.querySelector('.honeycomb-bg');
    if (!container) return;

    const colors = ['#ff6b00', '#ff6b00', '#7b2cbf', '#39ff14'];

    // Hex dimensions for proper tessellation (pointy-top hexagon)
    const hexRadius = 45;
    const hexW = Math.sqrt(3) * hexRadius;
    const hexH = 2 * hexRadius;
    const horizSpacing = hexW;
    const vertSpacing = hexH * 0.75;

    // Calculate grid size to cover viewport
    const cols = Math.ceil(window.innerWidth / horizSpacing) + 4;
    const rows = Math.ceil(window.innerHeight / vertSpacing) + 4;

    // Create one SVG for the entire honeycomb
    const svgWidth = cols * horizSpacing + hexW;
    const svgHeight = rows * vertSpacing + hexH;

    let paths = '';

    // Track which cells should be filled (create organic clusters)
    const grid = [];
    for (let y = 0; y < rows; y++) {
        grid[y] = [];
        for (let x = 0; x < cols; x++) {
            grid[y][x] = false;
        }
    }

    // Seed random cluster starting points
    const numSeeds = 12 + Math.floor(Math.random() * 8);
    const seeds = [];
    for (let i = 0; i < numSeeds; i++) {
        seeds.push({
            x: Math.floor(Math.random() * cols),
            y: Math.floor(Math.random() * rows)
        });
    }

    // Grow clusters from seeds
    seeds.forEach(seed => {
        const clusterSize = 8 + Math.floor(Math.random() * 25);
        const toVisit = [seed];
        let added = 0;

        while (toVisit.length > 0 && added < clusterSize) {
            const idx = Math.floor(Math.random() * toVisit.length);
            const cell = toVisit.splice(idx, 1)[0];

            if (cell.x < 0 || cell.x >= cols || cell.y < 0 || cell.y >= rows) continue;
            if (grid[cell.y][cell.x]) continue;

            grid[cell.y][cell.x] = true;
            added++;

            // Add neighbors with some probability
            const neighbors = cell.y % 2 === 0
                ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1]]
                : [[-1, 0], [1, 0], [0, -1], [0, 1], [1, -1], [1, 1]];

            neighbors.forEach(([dx, dy]) => {
                if (Math.random() < 0.7) {
                    toVisit.push({ x: cell.x + dx, y: cell.y + dy });
                }
            });
        }
    });

    // Draw hexagons where grid is true
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (!grid[y][x]) continue;

            const px = x * horizSpacing + (y % 2) * (horizSpacing / 2) + hexRadius;
            const py = y * vertSpacing + hexRadius;

            const color = colors[Math.floor(Math.random() * colors.length)];
            const style = Math.random();
            const opacity = 0.4 + Math.random() * 0.6;
            const r = hexRadius;
            const hw = r * Math.sqrt(3) / 2;

            const hexPath = `M${px} ${py - r}L${px + hw} ${py - r/2}L${px + hw} ${py + r/2}L${px} ${py + r}L${px - hw} ${py + r/2}L${px - hw} ${py - r/2}Z`;

            if (style < 0.3) {
                // Hollow
                paths += `<path d="${hexPath}" fill="none" stroke="${color}" stroke-width="1.5" opacity="${opacity}"/>`;
            } else if (style < 0.5) {
                // Solid
                paths += `<path d="${hexPath}" fill="${color}" opacity="${opacity * 0.25}"/>`;
            } else if (style < 0.65) {
                // Striped
                const patternId = `stripe-${x}-${y}`;
                paths += `<defs><pattern id="${patternId}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke="${color}" stroke-width="1.5" opacity="${opacity}"/>
                </pattern></defs>`;
                paths += `<path d="${hexPath}" fill="url(#${patternId})"/>`;
            } else if (style < 0.85) {
                // Partial edges
                const edges = [
                    `M${px} ${py - r}L${px + hw} ${py - r/2}`,
                    `M${px + hw} ${py - r/2}L${px + hw} ${py + r/2}`,
                    `M${px + hw} ${py + r/2}L${px} ${py + r}`,
                    `M${px} ${py + r}L${px - hw} ${py + r/2}`,
                    `M${px - hw} ${py + r/2}L${px - hw} ${py - r/2}`,
                    `M${px - hw} ${py - r/2}L${px} ${py - r}`
                ];
                const numEdges = 2 + Math.floor(Math.random() * 3);
                const startEdge = Math.floor(Math.random() * 6);
                for (let e = 0; e < numEdges; e++) {
                    paths += `<path d="${edges[(startEdge + e) % 6]}" stroke="${color}" stroke-width="1.5" opacity="${opacity}" stroke-linecap="round"/>`;
                }
            } else {
                // Dotted
                paths += `<path d="${hexPath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 4" opacity="${opacity}"/>`;
            }
        }
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'hex-layer';
    wrapper.innerHTML = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
    container.appendChild(wrapper);
}

// Mouse float effect for honeycomb background
function initParallax() {
    const honeycomb = document.querySelector('.honeycomb-bg');
    if (!honeycomb) return;

    // Respond to mouse movement for subtle floating effect
    document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 15;
        const y = (e.clientY / window.innerHeight - 0.5) * 15;
        honeycomb.style.transform = `translate(${x}px, ${y}px)`;
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize DOM elements
    elements = {
        entryNumber: document.querySelector('.current-phase'),
        entryType: document.querySelector('.phase-title-text'),
        counterCurrent: document.querySelector('.counter-current'),
        eventsSlider: document.querySelector('.events-slider'),
        eventsViewport: document.querySelector('.events-viewport'),
        timelineBar: document.querySelector('.timeline-bar'),
        timelineNodes: document.querySelector('.timeline-nodes'),
        cardsRow: document.querySelector('.cards-row'),
        prevBtn: document.querySelector('.nav-btn.prev'),
        nextBtn: document.querySelector('.nav-btn.next'),
        robot: document.querySelector('.robot')
    };

    console.log('DOM elements:', elements);
    console.log('cardsRow exists:', !!elements.cardsRow);
    console.log('timelineNodes exists:', !!elements.timelineNodes);

    // Initialize background first (doesn't depend on data)
    initHoneycomb();
    initParallax();

    await loadActivityLog();

    if (activityLog.length === 0) {
        console.warn('No log entries found');
        return;
    }

    init();
});

// Export API
window.TidyBotTimeline = {
    goToIndex,
    goToFirst: () => goToIndex(0),
    goToLast: () => goToIndex(activityLog.length - 1),
    getCurrentEntry: () => activityLog[currentIndex],
    getAllEntries: () => activityLog,
    getEntryCount: () => activityLog.length,
    // Add entry dynamically (won't persist to JSON file)
    addEntry: (entry) => {
        entry.id = String(activityLog.length + 1).padStart(3, '0');
        entry.status = 'completed';
        activityLog.push(entry);
        // Jump to the new entry (will re-render)
        goToIndex(activityLog.length - 1);
    },
    // Reload entries from JSON file
    reload: async () => {
        await loadActivityLog();
        currentIndex = activityLog.length - 1;
        renderedRange = { start: 0, end: 0 };
        updateRenderedCards(true);
        updateUI();
        updateSliderPosition(false);
    }
};
