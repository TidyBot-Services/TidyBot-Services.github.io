// ============================================
// TIDYBOT UNIVERSE — HEX GALLERY
// Two galleries (services / skills) with
// scattered hexes, popup overlay detail view
// ============================================

// ============================================
// LOCAL DEMO PAGE DETECTION
// ============================================
// IS_LOCAL_PAGE: true when on the /local/ tab (shows status badges, loads graph data)
// IS_LOCAL_SERVER: true when running on localhost (enables WebSocket to orchestrator)
const IS_LOCAL_PAGE = window.location.pathname.includes('/local');
const IS_LOCAL_SERVER = ['localhost', '127.0.0.1', ''].includes(window.location.hostname) || /^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(window.location.hostname);
const IS_LOCAL = IS_LOCAL_PAGE;
const BASE_PATH = (window.location.pathname.includes('/local') || window.location.pathname.includes('/updates')) ? '../' : './';
const AGENT_SERVER = `http://${window.location.hostname || 'localhost'}:8080`;
let _activeServer = AGENT_SERVER;  // current target's agent server (switched by target tabs)
let _activeTargetName = '';        // current target name for tab re-selection after popup rebuild
let ws = null;
let wsConnected = false;
let _execAutoplayTimer = null;

function initLocalMode() {
    if (!IS_LOCAL_PAGE) return;

    // Connect WebSocket only when actually running locally
    if (IS_LOCAL_SERVER) connectWS();
}

function connectWS() {
    const wsUrl = `ws://${window.location.hostname || 'localhost'}:8765`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        wsConnected = true;
        const el = document.getElementById('ws-status');
        if (el) el.textContent = 'WS: connected';
    };

    ws.onmessage = (evt) => {
        try {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'status_update') {
                handleStatusUpdate(msg.payload);
            } else if (msg.type === 'full_sync') {
                handleFullSync(msg.payload);
            } else if (msg.type === 'agent_message') {
                // Live reasoning trace from agent
                const isUser = msg.agent_type === 'user';
                const role = isUser ? 'you' : (msg.agent_type === 'evaluator' ? 'evaluator' : 'agent');
                const msgTarget = msg.target || '';
                // If message is target-specific, only render in DOM when that target tab is active
                const shouldRenderDom = !msgTarget || msgTarget === _activeTargetName;
                if (!isUser && shouldRenderDom) appendChatMsg(msg.entry_id, role, msg.text);
                // Persist to entry data: put into target_agents[target].agent_log if target-specific,
                // else entry.agent_log
                const g = galleries.skills;
                if (g) {
                    const entry = g.entries.find(e => e.title === msg.entry_id || e.name === msg.entry_id);
                    if (entry) {
                        if (msgTarget && entry.target_agents && entry.target_agents[msgTarget]) {
                            const ta = entry.target_agents[msgTarget];
                            if (!ta.agent_log) ta.agent_log = [];
                            ta.agent_log.push({text: msg.text, role});
                        } else {
                            if (!entry.agent_log) entry.agent_log = [];
                            entry.agent_log.push({text: msg.text, role});
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[WS] parse error:', e);
        }
    };

    ws.onclose = () => {
        wsConnected = false;
        const el = document.getElementById('ws-status');
        if (el) el.textContent = 'WS: disconnected (reconnecting...)';
        setTimeout(connectWS, 2000);
    };

    ws.onerror = () => { /* close handler will fire */ };
}

function sendWS(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

function escapeHTML(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Wrap chat text with inline keyword highlighting.
// Order matters: backticks first (so we don't double-wrap inside <code>),
// then keyword classes on the remaining text.
const KW_FAIL_RE     = /\b(fail(?:ed|s|ing|ure)?|error(?:s)?|killed|crash(?:ed|es)?|broken|wrong|never|cannot|can'?t|missed|miss|exception|timeout|stuck|drop(?:ped)?|lost|outside|❌|⚠️)\b/gi;
const KW_SUCCESS_RE  = /\b(success(?:ful(?:ly)?)?|succeed(?:s|ed)?|perfect(?:ly)?|great|excellent|works?|working|fixed|fix|correct|passed|pass|done|✓|✅)\b/gi;
const KW_WARN_RE     = /\b(but|however|issue(?:s)?|problem(?:s)?|warning|careful|note|caveat)\b/gi;

function highlightChatText(raw) {
    // 1. escape HTML
    let s = escapeHTML(raw);
    // 2. wrap `backticked` text first (and protect from kw replace)
    const codeSlots = [];
    s = s.replace(/`([^`]+)`/g, (_m, inner) => {
        codeSlots.push(inner);
        return `\u0000C${codeSlots.length - 1}\u0000`;
    });
    // 3. apply keyword classes (fail wins over success wins over warn)
    s = s.replace(KW_FAIL_RE, '<span class="kw-fail">$1</span>');
    s = s.replace(KW_SUCCESS_RE, '<span class="kw-success">$1</span>');
    s = s.replace(KW_WARN_RE, '<span class="kw-warn">$1</span>');
    // 4. restore code slots as <code>
    s = s.replace(/\u0000C(\d+)\u0000/g, (_m, i) => `<code>${codeSlots[+i]}</code>`);
    return s;
}

function appendChatMsg(entryId, role, text) {
    const log = document.getElementById(`chat-log-${entryId}`);
    if (!log || !text.trim()) return;
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg-${role}`;
    div.innerHTML = `<span class="chat-msg-role">${escapeHTML(role)}</span><span class="chat-msg-text">${highlightChatText(text)}</span>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

function appendAndPersistChat(entryId, role, text) {
    appendChatMsg(entryId, role, text);
    const g = galleries.skills;
    if (g) {
        const entry = g.entries.find(e => e.title === entryId || e.name === entryId);
        if (entry) {
            if (!entry.agent_log) entry.agent_log = [];
            entry.agent_log.push({text, role});
        }
    }
}

// Make it global for inline onclick handlers
window.appendChatMsg = appendChatMsg;
window.appendAndPersistChat = appendAndPersistChat;
window.sendWS = sendWS;

function handleStatusUpdate(entry) {
    // Update matching entry in skills gallery (data only)
    const g = galleries.skills;
    if (!g) return;
    const idx = g.entries.findIndex(e => e.title === entry.name);
    if (idx < 0) return;

    Object.assign(g.entries[idx], {
        status: entry.status,
        agent_id: entry.agent_id,
        agent_status_text: entry.agent_status_text,
        agent_type: entry.agent_type || g.entries[idx].agent_type,
        target_agents: entry.target_agents || g.entries[idx].target_agents,
        success_rate: entry.success_rate,
        progress_history: entry.progress_history
    });

    // In-place DOM update — find all hex cards matching this entry and patch them
    const statusClasses = ['status-writing', 'status-testing', 'status-review', 'status-failed', 'status-done', 'status-planned'];
    const newStatusClass = entry.status ? `status-${entry.status}` : '';
    // Build per-target or single agent HTML
    let agentHTML = '';
    const ta = entry.target_agents || g.entries[idx].target_agents;
    if (ta && Object.keys(ta).length > 1) {
        agentHTML = Object.entries(ta).map(([tname, a]) => {
            const c = agentStatusColors[a.status] || '#6b6b7b';
            return `<div class="hex-target-agent"><span class="status-dot" style="background:${c}"></span><span class="target-label">${tname}</span> <span style="color:${c}">${a.status}</span></div>`;
        }).join('');
    } else if (entry.agent_status_text) {
        agentHTML = `<span class="status-dot ${entry.status || ''}"></span>${entry.agent_status_text}`;
    }

    // Determine container class based on multi-target or single
    const isMultiTarget = ta && Object.keys(ta).length > 1;
    const agentContainerClass = isMultiTarget ? 'hex-target-agents' : 'hex-agent-status';

    function _patchAgentEl(card) {
        card.classList.remove(...statusClasses);
        if (newStatusClass) card.classList.add(newStatusClass);
        // Remove old agent elements (both types)
        card.querySelector('.hex-agent-status')?.remove();
        card.querySelector('.hex-target-agents')?.remove();
        if (agentHTML) {
            const el = document.createElement('div');
            el.className = agentContainerClass;
            el.innerHTML = agentHTML;
            card.querySelector('.hex-content')?.appendChild(el);
        }
    }

    // Update gallery hex cards
    const galleryCard = g.track?.querySelectorAll(`.hex-card[data-gallery="skills"][data-index="${idx}"]`);
    if (galleryCard) galleryCard.forEach(_patchAgentEl);

    // Update tree hex cards
    const treeCard = document.querySelector(`.tree-hex-card[data-title="${entry.name}"]`);
    if (treeCard) _patchAgentEl(treeCard);

    // Update open popup if it's showing this skill
    if (activePopup && activePopup.galleryName === 'skills') {
        const popupEntry = g.entries[activePopup.index];
        if (popupEntry && popupEntry.title === entry.name) {
            const badge = document.querySelector('.chat-status-badge');
            const hadTwoCol = !!document.querySelector('.popup-two-col');
            const prevStatus = badge?.dataset.status;
            const statusChanged = prevStatus && prevStatus !== entry.status;

            // Re-render popup when: switching to/from agent_done/done/failed (buttons change),
            // or when going from single-col to two-col
            if (!hadTwoCol || (statusChanged && ['review', 'done', 'failed'].includes(entry.status))) {
                // Save chat log before re-render
                const chatLog = document.getElementById(`chat-log-${entry.name}`);
                const savedHTML = chatLog ? chatLog.innerHTML : '';
                openPopup('skills', activePopup.index);
                // Restore chat log
                const newLog = document.getElementById(`chat-log-${entry.name}`);
                if (newLog && savedHTML) newLog.innerHTML = savedHTML;
            } else {
                // Just update badge text/color in place
                if (badge) {
                    const statusColor = {writing:'#9d4edd', testing:'#00bfff', review:'#39ff14', done:'#39ff14', failed:'#ff3366', planned:'#666'}[entry.status] || '#ff8800';
                    badge.style.background = statusColor;
                    badge.textContent = (entry.status || 'idle').toUpperCase().replace('AGENT_DONE', 'REVIEW');
                    badge.dataset.status = entry.status;
                    if (entry.status === 'review') badge.classList.add('badge-blink');
                    else badge.classList.remove('badge-blink');
                }
                // Only update label to entry.agent_id if no target tab is selected,
                // otherwise the label should stick to the active tab's agent
                if (!_activeTargetName) {
                    const agentLabel = document.querySelector('.chat-agent-label');
                    if (agentLabel && entry.agent_id) agentLabel.textContent = entry.agent_id;
                }
            }
        }
    }
}

function handleFullSync(payload) {
    // Support both old (array) and new ({entries, agents}) payload formats
    const entries = Array.isArray(payload) ? payload : (payload.entries || []);
    const agentsList = Array.isArray(payload) ? [] : (payload.agents || []);

    // Render agents list
    renderAgentsList(agentsList);

    const g = galleries.skills;
    if (!g) return;
    // Build map of existing in-memory agent_log to preserve live WS messages
    const prevLogs = {};
    if (g.entries) {
        for (const e of g.entries) {
            if (e.agent_log && e.agent_log.length) prevLogs[e.title] = e.agent_log;
        }
    }
    g.entries = prepareEntries(entries.map((repo, i) => {
        const serverLog = repo.agent_log || [];
        const prevLog = prevLogs[repo.name] || [];
        // Keep whichever log is longer (live WS accumulates more than server persists)
        const mergedLog = prevLog.length > serverLog.length ? prevLog : serverLog;
        return {
            id: String(i + 1).padStart(3, '0'),
            timestamp: repo.created_at ? new Date(repo.created_at).toISOString().slice(0, 16).replace('T', ' ') : '',
            type: 'repo',
            title: repo.name,
            description: repo.description || 'No description',
            language: repo.language || 'Unknown',
            stars: repo.stars || 0,
            html_url: repo.html_url || '',
            updated_at: repo.updated_at ? new Date(repo.updated_at).toISOString().slice(0, 16).replace('T', ' ') : '',
            success_rate: repo.success_rate ?? null,
            total_trials: repo.total_trials ?? null,
            institutions_tested: repo.institutions_tested ?? null,
            trial_images: repo.trial_images || [],
            image: (repo.trial_images && repo.trial_images.length > 0) ? repo.trial_images[0] : null,
            dependencies: repo.dependencies || [],
            service_dependencies: repo.service_dependencies || [],
            sdk_functions: repo.sdk_functions || [],
            status: repo.status || null,
            agent_id: repo.agent_id || null,
            agent_status_text: repo.agent_status_text || null,
            agent_type: repo.agent_type || null,
            target_results: repo.target_results || null,
            target_agents: repo.target_agents || null,
            target_trial_images: repo.target_trial_images || null,
            task_env: repo.task_env || null,
            agent_log: mergedLog,
            progress_history: repo.progress_history || [],
            _isRepo: true
        };
    }));
    renderGallery('skills');
    renderSkillTree(g.entries);
}

const agentStatusColors = {
    starting: '#ffd700',
    running:  '#9d4edd',
    done:     '#39ff14',
    stopped:  '#6b6b7b',
    error:    '#ff3366',
};

function renderAgentsList(agentsList) {
    const container = document.getElementById('agents-list');
    if (!container) return;
    if (!agentsList.length) {
        container.innerHTML = '<div class="agents-empty">No active agents</div>';
        return;
    }
    container.innerHTML = agentsList.map(a => {
        const color = agentStatusColors[a.status] || '#6b6b7b';
        const targetLabel = a.target ? `<span class="agent-target">${a.target}</span>` : '';
        return `<div class="agent-row">
            <span class="agent-dot" style="background:${color}"></span>
            <span class="agent-id">${a.agent_id}</span>
            <span class="agent-skill">${a.skill}</span>
            ${targetLabel}
            <span class="agent-type">${a.agent_type}</span>
            <span class="agent-status" style="color:${color}">${a.status}</span>
        </div>`;
    }).join('');
}

const typeConfig = {
    setup:    { label: 'Setup',    color: '#9d4edd' },
    feature:  { label: 'Feature',  color: '#39ff14' },
    fix:      { label: 'Bug Fix',  color: '#ff3366' },
    refactor: { label: 'Refactor', color: '#ff6b00' },
    test:     { label: 'Testing',  color: '#00d4ff' },
    docs:     { label: 'Docs',     color: '#6b6b7b' },
    deploy:   { label: 'Deploy',   color: '#ff6b00' },
    repo:     { label: 'Repo',     color: '#00d4ff' },
    hardware_service: { label: 'Hardware', color: '#ff3b30' },
    agent_service:    { label: 'Agent',    color: '#9d4edd' },
    software_service: { label: 'Software', color: '#ffd700' }
};

const HEX_SIZES = {
    xl: { w: 270, h: 310 },
    lg: { w: 210, h: 242 },
    md: { w: 190, h: 219 },
    sm: { w: 175, h: 202 },
    xs: { w: 155, h: 178 }
};

// ============================================
// LAYOUT CONFIG
// ============================================

function getLayoutConfig() {
    const w = window.innerWidth;
    if (w <= 600)  return { sizeScale: 0.65, baseSpacing: 120, galleryH: 480, padX: 130, minGap: 14, lineGap: 14, minSizeClass: 'md' };
    if (w <= 968)  return { sizeScale: 0.72, baseSpacing: 145, galleryH: 550, padX: 90,  minGap: 18, lineGap: 16 };
    return                { sizeScale: 1,    baseSpacing: 190, galleryH: 700, padX: 160, minGap: 24, lineGap: 20 };
}

// ============================================
// STATE
// ============================================

const galleries = {};       // keyed by name
let activePopup = null;     // { galleryName, index } | null
let layoutConfig = getLayoutConfig();

// ============================================
// DATA LOADING
// ============================================

function classifyServiceRepo(name) {
    const n = name.toLowerCase();
    if (/arm|gripper|mocap|base|camera/.test(n)) return 'hardware_service';
    if (/agent/.test(n)) return 'agent_service';
    return 'software_service';
}

const IGNORED_REPOS = [
    'wishlist', 'services_wishlist', 'backend_wishlist',
    'Tidybot-Universe',
    '.github',                       // org meta repo
    'TidyBot-Services.github.io',    // the site itself
    // Not "noun-shaped resources behind a uniform API" — protocol specs,
    // utility libs, data/task definitions, upstream forks, viz tools.
    'camera-protocol',               // protocol spec, not runtime service
    'gripper-protocol',
    'franka-protocol',
    'common',                        // shared utility lib
    'system_logger',                 // infra (runs inside agent_server)
    'maniskill-tidyverse',           // sim adapter + cuRobo planner code
    'maniskill-robocasa-tasks',      // task definitions (data/specs)
    'robocasa',                      // upstream framework fork
    'robosuite',                     // upstream framework fork
    'grounded-sam2',                 // upstream model (service is grounded-sam2-service)
    'websim',                        // browser sim viewer
];

async function loadRepos(file) {
    try {
        const r = await fetch(file);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const allRepos = await r.json();
        const repos = allRepos.filter(repo => !IGNORED_REPOS.includes(repo.name));
        return repos.map((repo, i) => ({
            id: String(i + 1).padStart(3, '0'),
            timestamp: repo.created_at
                ? new Date(repo.created_at).toISOString().slice(0, 16).replace('T', ' ')
                : '',
            type: 'repo',
            title: repo.name,
            description: repo.description || 'No description',
            language: repo.language || 'Unknown',
            stars: repo.stars || 0,
            html_url: repo.html_url,
            updated_at: repo.updated_at
                ? new Date(repo.updated_at).toISOString().slice(0, 16).replace('T', ' ')
                : '',
            success_rate: repo.success_rate ?? null,
            total_trials: repo.total_trials ?? null,
            institutions_tested: repo.institutions_tested ?? null,
            trial_images: (repo.trial_images || []).map(u => u.startsWith('http') ? u : BASE_PATH + u),
            image: (repo.trial_images && repo.trial_images.length > 0) ? (repo.trial_images[0].startsWith('http') ? repo.trial_images[0] : BASE_PATH + repo.trial_images[0]) : null,
            dependencies: repo.dependencies || [],
            service_dependencies: repo.service_dependencies || [],
            sdk_functions: repo.sdk_functions || [],
            status: repo.status || null,
            agent_id: repo.agent_id || null,
            agent_status_text: repo.agent_status_text || null,
            target_results: repo.target_results || null,
            target_agents: repo.target_agents || null,
            target_trial_images: repo.target_trial_images || null,
            agent_log: repo.agent_log || [],
            progress_history: repo.progress_history || [],
            _isRepo: true
        }));
    } catch (e) {
        console.error('Failed to load repos:', e);
        return [];
    }
}

async function loadServices() {
    const repos = await loadRepos(BASE_PATH + 'logs/services.json');
    return repos.map(repo => ({
        ...repo,
        type: classifyServiceRepo(repo.title)
    }));
}

function isAgentRepo(name) {
    return /agent/i.test(name);
}

function splitAgentServices(services) {
    const agents = services.filter(s => isAgentRepo(s.title));
    const nonAgents = services.filter(s => !isAgentRepo(s.title));
    return { agents, nonAgents };
}

function prepareEntries(entries) {
    const sorted = [...entries].sort((a, b) => {
        const tA = a.timestamp ? a.timestamp.replace(' ', 'T') : '';
        const tB = b.timestamp ? b.timestamp.replace(' ', 'T') : '';
        return new Date(tA) - new Date(tB);
    });
    return sorted.map((e, i) => ({ ...e, id: String(i + 1).padStart(3, '0') }));
}

// ============================================
// LAYOUT: HEX POSITIONING
// ============================================

const SIZE_ORDER = ['xs', 'sm', 'md', 'lg', 'xl'];

function getHexSizeClass(entry, index, cfg) {
    const hash = ((index * 2654435761) >>> 0) % 100;
    let size;
    switch (entry.type) {
        case 'feature': case 'deploy':
            if (hash < 35) size = 'xl';
            else if (hash < 70) size = 'lg';
            else size = 'md';
            break;
        case 'setup': case 'repo': case 'refactor':
        case 'hardware_service': case 'agent_service': case 'software_service':
            if (hash < 10) size = 'xl';
            else if (hash < 30) size = 'lg';
            else if (hash < 65) size = 'md';
            else if (hash < 85) size = 'sm';
            else size = 'xs';
            break;
        default:
            if (hash < 5) size = 'lg';
            else if (hash < 25) size = 'md';
            else if (hash < 60) size = 'sm';
            else size = 'xs';
            break;
    }
    if (cfg.minSizeClass) {
        const minIdx = SIZE_ORDER.indexOf(cfg.minSizeClass);
        if (SIZE_ORDER.indexOf(size) < minIdx) size = cfg.minSizeClass;
    }
    return size;
}

function getScaledSize(sizeClass, cfg) {
    const b = HEX_SIZES[sizeClass];
    return { w: Math.round(b.w * cfg.sizeScale), h: Math.round(b.h * cfg.sizeScale) };
}

function computeHexY(index, hexH, cfg) {
    const lineY = cfg.galleryH / 2;
    const edgePad = 12;

    // Pseudo-random 0..1 from index (deterministic)
    const raw = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    const frac = raw - Math.floor(raw);

    // Alternate sides: even above, odd below
    if (index % 2 === 0) {
        // Above line: center from edge to (lineY - halfH - lineGap)
        const closest = lineY - hexH / 2 - cfg.lineGap;
        const farthest = hexH / 2 + edgePad;
        return farthest + frac * (closest - farthest);
    } else {
        // Below line: center from (lineY + halfH + lineGap) to bottom edge
        const closest = lineY + hexH / 2 + cfg.lineGap;
        const farthest = cfg.galleryH - hexH / 2 - edgePad;
        return closest + frac * (farthest - closest);
    }
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh, gap) {
    return Math.abs(ax - bx) < (aw + bw) / 2 + gap &&
           Math.abs(ay - by) < (ah + bh) / 2 + gap;
}

function computeLayout(entries, cfg) {
    const positions = [];

    entries.forEach((entry, i) => {
        const sizeClass = getHexSizeClass(entry, i, cfg);
        const size = getScaledSize(sizeClass, cfg);
        const y = computeHexY(i, size.h, cfg);

        const jitter = ((i * 73 + 17) % 81) - 40;
        let x = cfg.padX + i * cfg.baseSpacing + jitter;

        // Resolve overlaps
        let iter = 0;
        while (iter < 80) {
            let hit = false;
            for (const p of positions) {
                if (rectsOverlap(x, y, size.w, size.h, p.x, p.y, p.w, p.h, cfg.minGap)) {
                    x = p.x + (p.w + size.w) / 2 + cfg.minGap;
                    hit = true;
                    break;
                }
            }
            if (!hit) break;
            iter++;
        }

        positions.push({ x, y, w: size.w, h: size.h, sizeClass, entry, index: i });
    });

    return positions;
}

// ============================================
// RENDERING
// ============================================

function renderGallery(name) {
    const g = galleries[name];
    if (!g) return;
    const cfg = layoutConfig;
    const lineY = cfg.galleryH / 2;

    g.viewport.style.height = cfg.galleryH + 'px';
    g.hexLayout = computeLayout(g.entries, cfg);

    let maxX = cfg.padX;
    for (const h of g.hexLayout) {
        const r = h.x + h.w / 2;
        if (r > maxX) maxX = r;
    }
    const totalW = maxX + cfg.padX;
    g.track.style.width = totalW + 'px';
    g.scrollMax = Math.max(0, totalW - g.viewport.offsetWidth);

    let html = '';

    // Timeline line
    html += `<div class="gallery-line" style="top:${lineY}px;"></div>`;

    // Robot at end of line
    const robotType = name === 'skills' ? 'cyan' : 'purple';
    const robotX = totalW - cfg.padX * 0.6;
    html += createRobotHTML(robotType, robotX, lineY);

    // Connectors
    g.hexLayout.forEach((hex, i) => {
        const hexBottom = hex.y + hex.h / 2;
        const hexTop = hex.y - hex.h / 2;
        let connTop, connH;

        if (hex.y < lineY) {
            connTop = hexBottom;
            connH = lineY - hexBottom;
        } else {
            connTop = lineY;
            connH = hexTop - lineY;
        }

        if (connH > 2) {
            html += `<div class="hex-connector" data-gallery="${name}" data-index="${i}"
                style="left:${hex.x}px;top:${connTop}px;height:${connH}px;"></div>`;
        }
    });

    // Dots on line
    g.hexLayout.forEach((hex, i) => {
        html += `<div class="hex-dot" data-gallery="${name}" data-index="${i}"
            style="left:${hex.x}px;top:${lineY}px;"></div>`;
    });

    // Hex cards
    g.hexLayout.forEach((hex, i) => {
        const entry = hex.entry;
        const hexLeft = hex.x - hex.w / 2;
        const hexTop = hex.y - hex.h / 2;
        const typeColor = typeConfig[entry.type]?.color || '#ff6b00';
        const typeLabel = typeConfig[entry.type]?.label || entry.type;
        const dateStr = entry.timestamp ? entry.timestamp.split(' ')[0].slice(5) : '';
        const title = entry.title || 'Untitled';
        const isMobile = cfg.sizeScale < 0.7;
        const maxLen = isMobile
            ? { xl: 34, lg: 28, md: 22, sm: 16, xs: 12 }[hex.sizeClass] || 22
            : { xl: 44, lg: 36, md: 28, sm: 20, xs: 14 }[hex.sizeClass] || 28;
        const titleDisplay = title.length > maxLen ? title.slice(0, maxLen - 2) + '…' : title;
        const repoName = entry.repo ? entry.repo.replace('tidybot-', '') : '';
        const floatDelay = ((i * 0.7) % 5).toFixed(1);
        const patternIdx = i % 4;
        const hasImage = entry.image ? 'has-image' : '';
        const bgStyle = entry.image ? `background-image:url(${entry.image});` : '';

        const statusClass = IS_LOCAL && entry.status ? `status-${entry.status}` : '';
        let agentStatusHTML = '';
        if (IS_LOCAL && entry.target_agents && Object.keys(entry.target_agents).length > 1) {
            // Multi-target: show per-target status lines
            agentStatusHTML = `<div class="hex-target-agents">${Object.entries(entry.target_agents).map(([tname, ta]) => {
                const c = agentStatusColors[ta.status] || '#6b6b7b';
                return `<div class="hex-target-agent"><span class="status-dot" style="background:${c}"></span><span class="target-label">${tname}</span> <span style="color:${c}">${ta.status}</span></div>`;
            }).join('')}</div>`;
        } else if (IS_LOCAL && entry.agent_status_text) {
            agentStatusHTML = `<div class="hex-agent-status"><span class="status-dot ${entry.status || ''}"></span>${entry.agent_status_text}</div>`;
        }

        html += `<div class="hex-card hex-${hex.sizeClass} ${statusClass}" data-gallery="${name}" data-index="${i}"
            style="left:${hexLeft}px;top:${hexTop}px;width:${hex.w}px;height:${hex.h}px;
                   --float-delay:${floatDelay}s;">
            <div class="hex-border">
                <div class="hex-inner">
                    <div class="hex-bg pattern-${patternIdx} ${hasImage}"
                         style="--type-color:${typeColor};${bgStyle}"></div>
                    <div class="hex-content">
                        <span class="hex-type" style="color:${typeColor};">${typeLabel}</span>
                        <h3 class="hex-title">${titleDisplay}</h3>
                        <span class="hex-date">${dateStr}</span>
                        ${entry.success_rate != null ? `<span class="hex-rate"><span class="hex-rate-label">Success </span>${entry.success_rate}%</span>` : ''}
                        ${entry.target_results ? `<div class="hex-target-dots">${Object.entries(entry.target_results).map(([n,r]) => `<span class="target-dot ${r.passed ? 'pass' : 'fail'}" title="${n}: ${r.passed ? 'PASS' : 'FAIL'}"></span>`).join('')}</div>` : ''}
                        ${repoName ? `<span class="hex-repo">${repoName}</span>` : ''}
                        ${agentStatusHTML}
                    </div>
                </div>
            </div>
        </div>`;
    });

    g.track.innerHTML = html;

    // Count
    if (g.countEl) g.countEl.textContent = `${g.entries.length} entries`;

    // Staggered entrance
    g.track.querySelectorAll('.hex-card').forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 35);
    });
}

function createRobotHTML(type, x, lineY) {
    if (type === 'purple') {
        return `<div class="gallery-robot robot-purple" style="left:${x}px;top:${lineY}px;">
            <div class="robot-antenna"></div>
            <div class="robot-head">
                <div class="robot-eye left"></div>
                <div class="robot-eye right"></div>
            </div>
            <div class="robot-body">
                <div class="robot-wheel left"></div>
                <div class="robot-wheel right"></div>
            </div>
        </div>`;
    }
    return `<div class="gallery-robot robot-cyan" style="left:${x}px;top:${lineY}px;">
        <div class="robot-alt-flag"></div>
        <div class="robot-alt-head">
            <div class="robot-alt-visor"></div>
        </div>
        <div class="robot-alt-body">
            <div class="robot-alt-chest"></div>
            <div class="robot-wheel left"></div>
            <div class="robot-wheel right"></div>
        </div>
    </div>`;
}

// ============================================
// SCROLLING
// ============================================

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function tick() {
    for (const name in galleries) {
        const g = galleries[name];
        const dx = g.scrollTarget - g.scrollPos;
        if (Math.abs(dx) > 0.5) {
            g.scrollPos += dx * 0.12;
        } else {
            g.scrollPos = g.scrollTarget;
        }
        g.track.style.transform = `translateX(${-g.scrollPos}px)`;

        if (g.progressFill) {
            const pct = g.scrollMax > 0 ? (g.scrollPos / g.scrollMax) * 100 : 0;
            g.progressFill.style.width = `${pct}%`;
        }
    }
    requestAnimationFrame(tick);
}

// ============================================
// EXECUTION VIEWER
// ============================================

async function fetchLatestExecution(skillName) {
    // Delegates to the target-aware variant (uses _activeServer)
    return fetchLatestExecutionFromServer(_activeServer, skillName);
}

// Fetch latest substantial execution from a specific agent server.
// Prefers executions with more frames (filters out short exploratory --no-eval runs).
async function fetchLatestExecutionFromServer(serverUrl, skillName) {
    try {
        const resp = await fetch(`${serverUrl}/code/jobs`);
        if (!resp.ok) return null;
        const data = await resp.json();
        const jobs = data.jobs || [];
        const candidates = jobs.filter(j =>
            j.execution_id && j.status === 'completed' &&
            (j.holder === `dev:${skillName}` || j.holder === skillName || (j.holder || '').includes(skillName))
        );
        if (!candidates.length) return null;

        // Fetch meta for the 5 most recent candidates in parallel, pick the one with most frames
        const topN = candidates.slice(0, 5);
        const metas = await Promise.all(topN.map(j =>
            fetch(`${serverUrl}/code/recordings/${j.execution_id}`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
        ));

        let best = null;
        for (let i = 0; i < metas.length; i++) {
            const rec = metas[i];
            if (!rec) continue;
            const frames = (rec.frames || []).filter(f => f.endsWith('.jpg'));
            if (frames.length === 0) continue;
            if (!best || frames.length > best._frameCount) {
                best = { ...rec, execution_id: topN[i].execution_id, _frameCount: frames.length, _serverUrl: serverUrl };
            }
        }
        return best;
    } catch (e) { return null; }
}

function buildExecViewerHTMLForServer(execData, serverUrl) {
    if (!execData || !execData.frames || execData.frames.length === 0) return '';
    const execId = execData.execution_id;
    const frames = execData.frames;
    const cameras = execData.cameras || [];
    const frameUrl = (f) => `${serverUrl}/code/recordings/${execId}/frames/${f}`;

    const camGroups = {};
    for (const f of frames) {
        const match = f.match(/^\d+_(.+)\.jpg$/);
        const cam = match ? match[1] : 'unknown';
        if (!camGroups[cam]) camGroups[cam] = [];
        camGroups[cam].push(f);
    }
    const camNames = Object.keys(camGroups);
    const defaultCam = camNames[0] || '';
    const defaultFrames = camGroups[defaultCam] || [];
    const camTabs = camNames.length > 1
        ? `<div class="exec-cam-tabs">${camNames.map((c, i) =>
            `<button class="exec-cam-tab${i === 0 ? ' active' : ''}" data-cam="${c}">${c.replace(/_/g, ' ')}</button>`
        ).join('')}</div>` : '';
    return `<div class="popup-trial-gallery exec-viewer" data-exec-id="${execId}">
        <span class="popup-files-label">Latest Execution</span>
        ${camTabs}
        <div class="trial-hero exec-hero">
            <img class="trial-hero-img exec-hero-img" src="${frameUrl(defaultFrames[0])}" alt="Execution frame">
            <span class="trial-counter exec-counter">1 / ${defaultFrames.length}</span>
            <div class="exec-controls"><button class="exec-play-btn" title="Play/Pause">▶</button></div>
        </div>
        <div class="exec-progress-bar"><div class="exec-progress-fill"></div></div>
        <div class="trial-strip exec-strip">
            ${defaultFrames.slice(0, 20).map((f, i) =>
                `<div class="trial-thumb${i === 0 ? ' active' : ''}" data-index="${i}" style="background-image:url(${frameUrl(f)});"></div>`
            ).join('')}
        </div>
    </div>`;
}

function buildExecViewerHTML(execData) {
    if (!execData || !execData.frames || execData.frames.length === 0) return '';
    const execId = execData.execution_id;
    const frames = execData.frames;
    const cameras = execData.cameras || [];
    const _server = execData._serverUrl || _activeServer;
    const frameUrl = (f) => `${_server}/code/recordings/${execId}/frames/${f}`;

    // Group frames by camera
    const camGroups = {};
    for (const f of frames) {
        // Frame format: 0000_camera_name.jpg
        const match = f.match(/^\d+_(.+)\.jpg$/);
        const cam = match ? match[1] : 'unknown';
        if (!camGroups[cam]) camGroups[cam] = [];
        camGroups[cam].push(f);
    }

    const camNames = Object.keys(camGroups);
    const defaultCam = camNames[0] || '';
    const defaultFrames = camGroups[defaultCam] || [];

    // Camera tab buttons
    const camTabs = camNames.length > 1
        ? `<div class="exec-cam-tabs">${camNames.map((c, i) =>
            `<button class="exec-cam-tab${i === 0 ? ' active' : ''}" data-cam="${c}">${c.replace(/_/g, ' ')}</button>`
        ).join('')}</div>`
        : '';

    const duration = execData.duration ? `${execData.duration.toFixed(1)}s` : '';

    return `<div class="popup-trial-gallery exec-viewer" data-exec-id="${execId}">
        <span class="popup-files-label">Latest Execution ${duration ? `<span class="exec-duration">(${duration})</span>` : ''}</span>
        ${camTabs}
        <div class="trial-hero exec-hero">
            <img class="trial-hero-img exec-hero-img" src="${frameUrl(defaultFrames[0])}" alt="Execution frame">
            <span class="trial-counter exec-counter">1 / ${defaultFrames.length}</span>
            <div class="exec-controls">
                <button class="exec-play-btn" title="Play/Pause">▶</button>
            </div>
        </div>
        <div class="exec-progress-bar"><div class="exec-progress-fill"></div></div>
        <div class="trial-strip exec-strip">
            ${defaultFrames.slice(0, 20).map((f, i) =>
                `<div class="trial-thumb${i === 0 ? ' active' : ''}" data-index="${i}" style="background-image:url(${frameUrl(f)});"></div>`
            ).join('')}
        </div>
    </div>`;
}

function wireExecViewer(execData, targetViewer) {
    let viewer = targetViewer;
    if (!viewer) {
        const slot = document.querySelector('.exec-viewer-slot');
        viewer = slot ? slot.querySelector('.exec-viewer') : document.querySelectorAll('.exec-viewer')[document.querySelectorAll('.exec-viewer').length - 1];
    }
    if (!viewer || !execData) return;

    const execId = execData.execution_id;
    const frames = execData.frames;
    const serverUrl = execData._serverUrl || _activeServer;
    const frameUrl = (f) => `${serverUrl}/code/recordings/${execId}/frames/${f}`;

    // Group frames by camera
    const camGroups = {};
    for (const f of frames) {
        const match = f.match(/^\d+_(.+)\.jpg$/);
        const cam = match ? match[1] : 'unknown';
        if (!camGroups[cam]) camGroups[cam] = [];
        camGroups[cam].push(f);
    }

    let currentCam = Object.keys(camGroups)[0] || '';
    let currentFrames = camGroups[currentCam] || [];
    let currentIdx = 0;
    let playing = false;

    const heroImg = viewer.querySelector('.exec-hero-img');
    const counter = viewer.querySelector('.exec-counter');
    const playBtn = viewer.querySelector('.exec-play-btn');
    const progressFill = viewer.querySelector('.exec-progress-fill');
    const strip = viewer.querySelector('.exec-strip');

    function showFrame(idx) {
        currentIdx = idx;
        heroImg.src = frameUrl(currentFrames[idx]);
        counter.textContent = `${idx + 1} / ${currentFrames.length}`;
        if (progressFill) progressFill.style.width = `${((idx + 1) / currentFrames.length) * 100}%`;
        // Update thumb highlights
        strip.querySelectorAll('.trial-thumb').forEach((t, i) => t.classList.toggle('active', i === idx));
    }

    function play() {
        playing = true;
        playBtn.textContent = '⏸';
        advance();
    }

    function pause() {
        playing = false;
        playBtn.textContent = '▶';
        if (_execAutoplayTimer) { clearTimeout(_execAutoplayTimer); _execAutoplayTimer = null; }
    }

    function advance() {
        if (!playing) return;
        currentIdx = (currentIdx + 1) % currentFrames.length;
        showFrame(currentIdx);
        _execAutoplayTimer = setTimeout(advance, 200);
    }

    function switchCam(cam) {
        currentCam = cam;
        currentFrames = camGroups[cam] || [];
        currentIdx = 0;
        // Rebuild strip
        strip.innerHTML = currentFrames.slice(0, 20).map((f, i) =>
            `<div class="trial-thumb${i === 0 ? ' active' : ''}" data-index="${i}" style="background-image:url(${frameUrl(f)});"></div>`
        ).join('');
        // Re-wire thumb clicks
        strip.querySelectorAll('.trial-thumb').forEach(t => {
            t.addEventListener('click', () => { pause(); showFrame(parseInt(t.dataset.index, 10)); });
        });
        showFrame(0);
        counter.textContent = `1 / ${currentFrames.length}`;
    }

    // Wire controls
    playBtn.addEventListener('click', () => playing ? pause() : play());

    // Wire camera tabs
    viewer.querySelectorAll('.exec-cam-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            viewer.querySelectorAll('.exec-cam-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            switchCam(tab.dataset.cam);
        });
    });

    // Wire thumb clicks
    strip.querySelectorAll('.trial-thumb').forEach(t => {
        t.addEventListener('click', () => { pause(); showFrame(parseInt(t.dataset.index, 10)); });
    });

    // Auto-play on load
    play();
}

function wireStaticExecViewer(viewer, imgUrls) {
    // Group URLs by camera name (parsed from filename)
    const camGroups = {};
    for (const url of imgUrls) {
        const fname = url.split('/').pop();
        const m = fname.match(/^\d+_(.+)\.jpg$/) || fname.match(/^[a-z]_\d+_(.+)\.jpg$/);
        const cam = m ? m[1] : 'unknown';
        if (!camGroups[cam]) camGroups[cam] = [];
        camGroups[cam].push(url);
    }

    let currentCam = Object.keys(camGroups)[0] || '';
    let currentFrames = camGroups[currentCam] || [];
    let currentIdx = 0;
    let playing = false;

    const heroImg = viewer.querySelector('.exec-hero-img');
    const counter = viewer.querySelector('.exec-counter');
    const playBtn = viewer.querySelector('.exec-play-btn');
    const progressFill = viewer.querySelector('.exec-progress-fill');
    const strip = viewer.querySelector('.exec-strip');

    function showFrame(idx) {
        currentIdx = idx;
        heroImg.src = currentFrames[idx];
        counter.textContent = `${idx + 1} / ${currentFrames.length}`;
        if (progressFill) progressFill.style.width = `${((idx + 1) / currentFrames.length) * 100}%`;
        strip.querySelectorAll('.trial-thumb').forEach((t, i) => t.classList.toggle('active', i === idx));
    }

    function play() {
        playing = true;
        playBtn.textContent = '\u23f8';
        advance();
    }

    function pause() {
        playing = false;
        playBtn.textContent = '\u25b6';
        if (_execAutoplayTimer) { clearTimeout(_execAutoplayTimer); _execAutoplayTimer = null; }
    }

    function advance() {
        if (!playing) return;
        currentIdx = (currentIdx + 1) % currentFrames.length;
        showFrame(currentIdx);
        _execAutoplayTimer = setTimeout(advance, 200);
    }

    function switchCam(cam) {
        currentCam = cam;
        currentFrames = camGroups[cam] || [];
        currentIdx = 0;
        strip.innerHTML = currentFrames.slice(0, 20).map((f, i) =>
            `<div class="trial-thumb${i === 0 ? ' active' : ''}" data-index="${i}" style="background-image:url(${f});"></div>`
        ).join('');
        strip.querySelectorAll('.trial-thumb').forEach(t => {
            t.addEventListener('click', () => { pause(); showFrame(parseInt(t.dataset.index, 10)); });
        });
        showFrame(0);
    }

    playBtn.addEventListener('click', () => playing ? pause() : play());

    viewer.querySelectorAll('.exec-cam-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            viewer.querySelectorAll('.exec-cam-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            switchCam(tab.dataset.cam);
        });
    });

    strip.querySelectorAll('.trial-thumb').forEach(t => {
        t.addEventListener('click', () => { pause(); showFrame(parseInt(t.dataset.index, 10)); });
    });

    play();
}

// ============================================
// POPUP
// ============================================

function openPopup(galleryName, index) {
    const g = galleries[galleryName];
    if (!g) return;
    const entry = g.entries[index];
    if (!entry) return;

    // Deselect previous
    if (activePopup) {
        deactivateHex(activePopup.galleryName, activePopup.index);
    }

    // Activate new
    activePopup = { galleryName, index };
    activateHex(galleryName, index);

    // Center scroll on hex
    const hex = g.hexLayout[index];
    if (hex) {
        g.scrollTarget = clamp(hex.x - g.viewport.offsetWidth / 2, 0, g.scrollMax);
    }

    // Build popup content
    const typeColor = typeConfig[entry.type]?.color || '#ff6b00';
    const typeLabel = typeConfig[entry.type]?.label || entry.type;

    let filesHTML = '';
    if (entry.files && entry.files.length > 0) {
        filesHTML = `<div class="popup-files">
            <span class="popup-files-label">Files changed</span>
            <div class="popup-files-list">
                ${entry.files.map(f => `<code class="popup-file">${f}</code>`).join('')}
            </div>
        </div>`;
    }

    let depsHTML = '';
    if (entry.dependencies && entry.dependencies.length > 0) {
        depsHTML = `<div class="popup-files">
            <span class="popup-files-label">Dependencies</span>
            <div class="popup-files-list">
                ${entry.dependencies.map(d => `<code class="popup-file">${d}</code>`).join('')}
            </div>
        </div>`;
    }

    let servicesHTML = '';
    if (entry.service_dependencies && entry.service_dependencies.length > 0) {
        servicesHTML = `<div class="popup-files">
            <span class="popup-files-label">Services</span>
            <div class="popup-files-list">
                ${entry.service_dependencies.map(s => `<code class="popup-file">${s}</code>`).join('')}
            </div>
        </div>`;
    }

    let sdkHTML = '';
    if (entry.sdk_functions && entry.sdk_functions.length > 0) {
        sdkHTML = `<div class="popup-files">
            <span class="popup-files-label">SDK</span>
            <div class="popup-files-list">
                ${entry.sdk_functions.map(f => `<code class="popup-file">${f}</code>`).join('')}
            </div>
        </div>`;
    }

    let repoMeta = '';
    if (entry._isRepo) {
        repoMeta = `<div class="popup-files">
            <span class="popup-files-label">Language</span>
            <div class="popup-files-list">
                <code class="popup-file">${entry.language || 'Unknown'}</code>
            </div>
        </div>`;
        if (entry.success_rate != null) {
            repoMeta += `<div class="popup-stats">
                <div class="popup-stat">
                    <span class="popup-stat-value" style="color:${typeColor};">${entry.success_rate}%</span>
                    <span class="popup-stat-label">Success Rate</span>
                </div>
                <div class="popup-stat">
                    <span class="popup-stat-value">${entry.total_trials ?? '—'}</span>
                    <span class="popup-stat-label">Total Trials</span>
                </div>
                <div class="popup-stat">
                    <span class="popup-stat-value">${entry.institutions_tested ?? '—'}</span>
                    <span class="popup-stat-label">Institutions</span>
                </div>
            </div>`;
        }
        // Per-target validation results
        if (entry.target_results && Object.keys(entry.target_results).length > 0) {
            repoMeta += `<div class="popup-target-results">
                <h4 style="margin:12px 0 6px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">Target Validation</h4>
                <table style="width:100%;font-size:12px;border-collapse:collapse;">
                    <tr style="color:#666;"><th style="text-align:left;padding:4px 8px;">Target</th><th style="text-align:center;padding:4px 8px;">Status</th></tr>
                    ${Object.entries(entry.target_results).map(([name, r]) =>
                        `<tr style="border-top:1px solid #222;">
                            <td style="padding:4px 8px;color:#c9d1d9;">${name}</td>
                            <td style="padding:4px 8px;text-align:center;">
                                <span style="color:${r.passed ? '#4caf50' : '#f44336'};font-weight:600;">${r.passed ? 'PASS' : 'FAIL'}</span>
                            </td>
                        </tr>`
                    ).join('')}
                </table>
            </div>`;
        }
    }

    let repoLink = '';
    if (entry._isRepo && entry.html_url) {
        repoLink = `<a href="${entry.html_url}" target="_blank" rel="noopener noreferrer" class="popup-repo-link">View Repo →</a>`;
    }

    let trialHTML = '';
    if (entry.trial_images && entry.trial_images.length > 0) {
        const imgs = entry.trial_images;
        // Check if images follow execution frame naming (NNNN_camera.jpg)
        const isExecFrames = imgs.some(u => /\d{4}_\w+_camera/.test(u) || /\d{4}_\w+\.jpg/.test(u.split('/').pop()));
        if (isExecFrames) {
            // Render as exec viewer with camera tabs and play button
            const camGroups = {};
            for (const url of imgs) {
                const fname = url.split('/').pop();
                const m = fname.match(/^\d+_(.+)\.jpg$/) || fname.match(/^[a-z]_\d+_(.+)\.jpg$/);
                const cam = m ? m[1] : 'unknown';
                if (!camGroups[cam]) camGroups[cam] = [];
                camGroups[cam].push(url);
            }
            const camNames = Object.keys(camGroups);
            const defaultCam = camNames[0] || '';
            const defaultFrames = camGroups[defaultCam] || [];
            const camTabs = camNames.length > 1
                ? `<div class="exec-cam-tabs">${camNames.map((c, i) =>
                    `<button class="exec-cam-tab${i === 0 ? ' active' : ''}" data-cam="${c}">${c.replace(/_/g, ' ')}</button>`
                ).join('')}</div>` : '';
            trialHTML = `<div class="popup-trial-gallery exec-viewer" data-static-exec="true">
                <span class="popup-files-label">Execution Recording</span>
                ${camTabs}
                <div class="trial-hero exec-hero">
                    <img class="trial-hero-img exec-hero-img" src="${defaultFrames[0]}" alt="Execution frame">
                    <span class="trial-counter exec-counter">1 / ${defaultFrames.length}</span>
                    <div class="exec-controls">
                        <button class="exec-play-btn" title="Play/Pause">▶</button>
                    </div>
                </div>
                <div class="exec-progress-bar"><div class="exec-progress-fill"></div></div>
                <div class="trial-strip exec-strip">
                    ${defaultFrames.slice(0, 20).map((f, i) =>
                        `<div class="trial-thumb${i === 0 ? ' active' : ''}" data-index="${i}" style="background-image:url(${f});"></div>`
                    ).join('')}
                </div>
            </div>`;
            // Stash grouped data on entry for wireup
            entry._staticExecData = { frames: imgs, cameras: camNames.map(c => ({name: c})) };
        } else {
            // Split into wrist (first half) and base (second half) rows
            const half = Math.ceil(imgs.length / 2);
            const wristImgs = imgs.slice(0, half);
            const baseImgs = imgs.slice(half);

            const makeRow = (list, offset) => list.map((url, i) =>
                `<div class="trial-thumb${offset + i === 0 ? ' active' : ''}" data-index="${offset + i}" style="background-image:url(${url});"></div>`
            ).join('');

            const wristRow = wristImgs.length > 0
                ? `<span class="trial-row-label">Wrist Cam</span><div class="trial-strip">${makeRow(wristImgs, 0)}</div>` : '';
            const baseRow = baseImgs.length > 0
                ? `<span class="trial-row-label">Base Cam</span><div class="trial-strip">${makeRow(baseImgs, half)}</div>` : '';

            trialHTML = `<div class="popup-trial-gallery">
                <span class="popup-files-label">Successful Trial</span>
                <div class="trial-hero">
                    <img class="trial-hero-img" src="${imgs[0]}" alt="Trial photo 1">
                    <span class="trial-counter">1 / ${imgs.length}</span>
                </div>
                ${wristRow}
                ${baseRow}
            </div>`;
        }
    }

    // Info column (shared between done and in-dev)
    const infoHTML = `
        <div class="popup-header">
            <span class="popup-number" style="color:${typeColor};">#${entry.id}</span>
            <span class="popup-type" style="--type-color:${typeColor};">${typeLabel}</span>
            <span class="popup-date">${entry.timestamp || ''}</span>
        </div>
        ${trialHTML}
        <div class="exec-viewer-slot"></div>
        <h2 class="popup-title">${entry.title}</h2>
        <p class="popup-desc">${entry.description}</p>
        ${filesHTML}
        ${depsHTML}
        ${servicesHTML}
        ${sdkHTML}
        ${repoMeta}
        ${repoLink}
    `;

    const hasAgent = IS_LOCAL && entry.status;
    const isFailed = IS_LOCAL && entry.status === 'failed';
    const isDone = IS_LOCAL && entry.status === 'done';
    const isAgentDone = IS_LOCAL && entry.status === 'review';
    const isActive = entry.status === 'writing' || entry.status === 'testing';
    const needsAttention = isAgentDone || isFailed || isActive;

    if (hasAgent) {
        // Two-column layout: left info, right live agent chat (always in local mode)
        const popupCard = document.querySelector('.popup-card');
        if (popupCard) popupCard.classList.add('popup-wide');

        const statusLabel = (entry.status || 'idle').toUpperCase().replace('AGENT_DONE', 'REVIEW');
        const statusColor = {writing:'#9d4edd', testing:'#00bfff', review:'#39ff14', done:'#39ff14', failed:'#ff3366', planned:'#666'}[entry.status] || '#ff8800';

        const actionHTML = isFailed ? `
            <div class="inject-controls">
                <button class="inject-retry-btn" onclick="sendWS({type:'retry',skill:'${entry.title}'});">Retry</button>
            </div>` : isDone ? `
            <div class="inject-controls">
                <input class="inject-input" id="inject-edit-${entry.title}" type="text"
                       placeholder="Describe edit to spawn agent..."
                       onkeydown="if(event.key==='Enter'){document.getElementById('chat-log-${entry.title}').innerHTML='';sendWS({type:'edit',skill:'${entry.title}',text:this.value});this.value='';}">
                <button class="inject-send-btn" onclick="const inp=document.getElementById('inject-edit-${entry.title}');document.getElementById('chat-log-${entry.title}').innerHTML='';sendWS({type:'edit',skill:'${entry.title}',text:inp.value});inp.value='';">Edit Skill</button>
            </div>` : '';

        // Build bottom controls based on state
        let chatInputHTML = '';
        const hasAgent = !!entry.agent_id;
        const killBtn = hasAgent
            ? `<button class="inject-stop-btn" style="background:#600;border-color:#900;" onclick="if(confirm('Kill agent? Session will be destroyed.')){sendWS({type:'kill',agent_id:'${entry.agent_id||''}'});}">Kill</button>`
            : '';
        const spawnBtn = `<button class="inject-retry-btn" onclick="sendWS({type:'retry',skill:'${entry.title}'});">Spawn Agent</button>`;
        if (!hasAgent) {
            // No live agent — show Spawn button
            chatInputHTML = `<div class="chat-input-row">${spawnBtn}</div>`;
        } else if (isDone) {
            // Confirmed done, agent alive — hint + kill
            chatInputHTML = `<div class="chat-input-row">
                <input class="inject-input" id="inject-input-${entry.title}" type="text"
                       placeholder="Send hint to agent..."
                       onkeydown="if(event.key==='Enter'){sendWS({type:'inject',agent_id:'${entry.agent_id||''}',text:this.value});appendAndPersistChat('${entry.title}','you',this.value);this.value='';}">
                <button class="inject-send-btn" onclick="const inp=document.getElementById('inject-input-${entry.title}');sendWS({type:'inject',agent_id:'${entry.agent_id||''}',text:inp.value});appendAndPersistChat('${entry.title}','you',inp.value);inp.value='';">Send</button>
                ${killBtn}
            </div>`;
        } else if (isAgentDone) {
            // Review — hint + Test + Done + Kill
            chatInputHTML = `<div class="chat-input-row">
                <input class="inject-input" id="inject-input-${entry.title}" type="text"
                       placeholder="Send follow-up hint..."
                       onkeydown="if(event.key==='Enter'){sendWS({type:'inject',agent_id:'${entry.agent_id||''}',text:this.value});appendAndPersistChat('${entry.title}','you',this.value);this.value='';}">
                <button class="inject-send-btn" onclick="const inp=document.getElementById('inject-input-${entry.title}');sendWS({type:'inject',agent_id:'${entry.agent_id||''}',text:inp.value});appendAndPersistChat('${entry.title}','you',inp.value);inp.value='';">Send</button>
                <button class="inject-test-btn" onclick="document.getElementById('chat-log-${entry.title}').innerHTML='';sendWS({type:'test',skill:'${entry.title}'});">Test</button>
                <button class="inject-done-btn" onclick="sendWS({type:'confirm_done',skill:'${entry.title}',agent_id:'${entry.agent_id||''}'});">Done</button>
                ${killBtn}
            </div>`;
        } else {
            // Active — hint + Stop + Kill
            const isTestAgent = entry.agent_type === 'test';
            const stopBtnClass = isTestAgent ? 'inject-test-btn' : 'inject-stop-btn';
            const stopLabel = isTestAgent ? 'Stop Test' : 'Pause';
            chatInputHTML = `<div class="chat-input-row">
                <input class="inject-input" id="inject-input-${entry.title}" type="text"
                       placeholder="Send hint to agent..."
                       onkeydown="if(event.key==='Enter'){sendWS({type:'inject',agent_id:'${entry.agent_id||''}',text:this.value});appendAndPersistChat('${entry.title}','you',this.value);this.value='';}">
                <button class="inject-send-btn" onclick="const inp=document.getElementById('inject-input-${entry.title}');sendWS({type:'inject',agent_id:'${entry.agent_id||''}',text:inp.value});appendAndPersistChat('${entry.title}','you',inp.value);inp.value='';">Send</button>
                <button class="${stopBtnClass}" onclick="sendWS({type:'stop',agent_id:'${entry.agent_id||''}'});">${stopLabel}</button>
                ${killBtn}
            </div>`;
        }

        // Build target tabs if multiple targets
        const ta = entry.target_agents;
        const multiTarget = ta && Object.keys(ta).length > 1;
        let targetTabsHTML = '';
        if (multiTarget) {
            targetTabsHTML = `<div class="chat-target-tabs">${Object.entries(ta).map(([tname, a], i) => {
                const c = agentStatusColors[a.status] || '#6b6b7b';
                return `<button class="chat-target-tab${i === 0 ? ' active' : ''}" data-target="${tname}" data-agent-id="${a.agent_id}" style="border-bottom-color:${c};">
                    <span class="status-dot" style="background:${c}"></span>${tname}
                </button>`;
            }).join('')}</div>`;
        }

        document.getElementById('popup-inner').innerHTML = `
            <div class="popup-two-col">
                <div class="popup-col-info">
                    ${infoHTML}
                    ${actionHTML}
                </div>
                <div class="popup-col-chat">
                    ${targetTabsHTML}
                    <div class="chat-header">
                        <span class="chat-status-badge${needsAttention ? ' badge-blink' : ''}" data-status="${entry.status}" style="background:${statusColor};">${statusLabel}</span>
                        <span class="chat-agent-label">${entry.agent_id || 'agent'}</span>
                    </div>
                    <div class="chat-log" id="chat-log-${entry.title}">
                        ${(entry.agent_log || []).map(msg => {
                            const text = typeof msg === 'string' ? msg : msg.text;
                            const savedRole = typeof msg === 'object' ? msg.role : null;
                            const isExperiment = /^Ran \d+/.test(text);
                            const role = isExperiment ? 'experiment' : savedRole || 'agent';
                            const cls = `chat-msg-${role}`;
                            return `<div class="chat-msg ${cls}">
                                <span class="chat-msg-role">${escapeHTML(role)}</span>
                                <span class="chat-msg-text">${highlightChatText(text)}</span>
                            </div>`;
                        }).join('')}
                    </div>
                    ${chatInputHTML}
                </div>
            </div>
        `;

        // Wire up target tab switching — simple approach:
        // Set _activeServer, swap entry data, and re-open popup
        if (multiTarget) {
            // On initial open, select tab matching _activeTargetName (if set)
            if (_activeTargetName) {
                document.querySelectorAll('.chat-target-tab').forEach(t => {
                    t.classList.toggle('active', t.dataset.target === _activeTargetName);
                });
            }

            document.querySelectorAll('.chat-target-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const targetName = tab.dataset.target;
                    const agentId = tab.dataset.agentId;
                    const targetInfo = ta[targetName];
                    if (!targetInfo) return;

                    // 1. Set global active server so all video code uses this target
                    _activeServer = targetInfo.agent_server || AGENT_SERVER;
                    _activeTargetName = targetName;

                    // 2. Update entry data with this target's agent info
                    const g = galleries.skills;
                    if (g && activePopup) {
                        const e = g.entries[activePopup.index];
                        if (e) {
                            e.agent_id = agentId;
                            e.agent_log = targetInfo.agent_log || [];
                            e.agent_status_text = targetInfo.status;

                            // Fetch the latest execution for THIS skill on THIS target's server
                            // (matches by holder=dev:<skill> and prefers recordings with >20 frames)
                            fetchLatestExecutionFromServer(_activeServer, entry.title)
                                .then(recData => {
                                    if (recData) {
                                        let frames = (recData.frames || []).filter(f => f.endsWith('.jpg'));
                                        if (frames.length > 20) {
                                            const step = frames.length / 20;
                                            frames = Array.from({length: 20}, (_, i) => frames[Math.floor(i * step)]);
                                        }
                                        e.trial_images = frames.map(f => `${_activeServer}/code/recordings/${recData.execution_id}/frames/${f}`);
                                        e.image = e.trial_images[0] || null;
                                        e._staticExecData = null;
                                    }
                                    openPopup('skills', activePopup.index);
                                })
                                .catch(() => {
                                    openPopup('skills', activePopup.index);
                                });
                        }
                    }
                });
            });
        }
    } else {
        // Single column for skills with no agent activity
        const popupCard = document.querySelector('.popup-card');
        if (popupCard) popupCard.classList.remove('popup-wide');

        let editHTML = '';
        if (IS_LOCAL) {
            editHTML = `
            <div class="inject-controls">
                <input class="inject-input" id="inject-input-${entry.id}" type="text"
                       placeholder="Describe edit to spawn agent..."
                       onkeydown="if(event.key==='Enter'){sendWS({type:'edit',skill:'${entry.title}',text:this.value});this.value='';}">
                <button class="inject-send-btn" onclick="const inp=document.getElementById('inject-input-${entry.id}');sendWS({type:'edit',skill:'${entry.title}',text:inp.value});inp.value='';">Edit Skill</button>
            </div>`;
        }

        document.getElementById('popup-inner').innerHTML = `
            ${infoHTML}
            ${editHTML}
        `;
    }

    // Wire up trial gallery / static exec viewer
    const trialGallery = document.querySelector('.popup-trial-gallery');
    if (trialGallery) {
        if (trialGallery.dataset.staticExec && entry._staticExecData) {
            // Wire as exec viewer using static image URLs
            wireStaticExecViewer(trialGallery, entry.trial_images);
        } else {
            const heroImg = trialGallery.querySelector('.trial-hero-img');
            const counter = trialGallery.querySelector('.trial-counter');
            const thumbs = trialGallery.querySelectorAll('.trial-thumb');
            thumbs.forEach(thumb => {
                thumb.addEventListener('click', () => {
                    const idx = parseInt(thumb.dataset.index, 10);
                    heroImg.src = entry.trial_images[idx];
                    heroImg.alt = `Trial photo ${idx + 1}`;
                    counter.textContent = `${idx + 1} / ${entry.trial_images.length}`;
                    thumbs.forEach(t => t.classList.remove('active'));
                    thumb.classList.add('active');
                });
            });
        }
    }

    document.getElementById('popup-overlay').classList.add('open');

    // Async: load latest execution frames into the viewer slot
    if (IS_LOCAL) {
        const slot = document.querySelector('.exec-viewer-slot');
        if (slot) {
            fetchLatestExecution(entry.title).then(execData => {
                if (execData && slot.isConnected) {
                    slot.innerHTML = buildExecViewerHTML(execData);
                    wireExecViewer(execData);
                }
            });
        }
    }
}

function closePopup() {
    // Stop any running autoplay
    if (_execAutoplayTimer) { clearTimeout(_execAutoplayTimer); _execAutoplayTimer = null; }
    document.getElementById('popup-overlay').classList.remove('open');
    const popupCard = document.querySelector('.popup-card');
    if (popupCard) popupCard.classList.remove('popup-wide');
    if (activePopup) {
        deactivateHex(activePopup.galleryName, activePopup.index);
        activePopup = null;
    }
}

function activateHex(galleryName, index) {
    const section = galleries[galleryName]?.section;
    if (!section) return;
    section.querySelectorAll(`[data-index="${index}"]`).forEach(el => el.classList.add('active'));
}

function deactivateHex(galleryName, index) {
    const section = galleries[galleryName]?.section;
    if (!section) return;
    section.querySelectorAll(`[data-index="${index}"]`).forEach(el => el.classList.remove('active'));
}

// ============================================
// EVENTS
// ============================================

function setupGalleryEvents(name) {
    const g = galleries[name];
    let dragMoved = false;

    // Mouse drag
    g.viewport.addEventListener('mousedown', (e) => {
        g.dragging = true;
        dragMoved = false;
        g.dragX = e.clientX;
        g.dragScroll = g.scrollTarget;
    });

    window.addEventListener('mousemove', (e) => {
        if (!g.dragging) return;
        const dx = g.dragX - e.clientX;
        if (Math.abs(dx) > 4) {
            dragMoved = true;
            g.viewport.style.cursor = 'grabbing';
        }
        g.scrollTarget = clamp(g.dragScroll + dx, 0, g.scrollMax);
    });

    window.addEventListener('mouseup', () => {
        if (g.dragging) {
            g.dragging = false;
            g.viewport.style.cursor = 'grab';
        }
    });

    // Touch
    g.viewport.addEventListener('touchstart', (e) => {
        g.dragging = true;
        g.touchLocked = false;
        dragMoved = false;
        g.dragX = e.touches[0].clientX;
        g.dragY = e.touches[0].clientY;
        g.dragScroll = g.scrollTarget;
    }, { passive: true });

    g.viewport.addEventListener('touchmove', (e) => {
        if (!g.dragging) return;
        const dx = g.dragX - e.touches[0].clientX;
        const dy = g.dragY - e.touches[0].clientY;

        // First significant movement decides: horizontal = gallery scroll, vertical = page scroll
        if (!g.touchLocked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            g.touchLocked = true;
            g.touchHorizontal = Math.abs(dx) > Math.abs(dy);
        }

        if (!g.touchLocked || !g.touchHorizontal) return; // let vertical scroll through

        e.preventDefault();
        dragMoved = true;
        g.scrollTarget = clamp(g.dragScroll + dx, 0, g.scrollMax);
    }, { passive: false });

    g.viewport.addEventListener('touchend', () => { g.dragging = false; g.touchLocked = false; });

    // Click
    g.viewport.addEventListener('click', (e) => {
        if (dragMoved) return;
        const hex = e.target.closest('.hex-card');
        if (hex) { openPopup(name, parseInt(hex.dataset.index, 10)); return; }
        const dot = e.target.closest('.hex-dot');
        if (dot) { openPopup(name, parseInt(dot.dataset.index, 10)); return; }
    });
}

function setupGlobalEvents() {
    // Popup close
    document.getElementById('popup-backdrop').addEventListener('click', closePopup);
    document.getElementById('popup-close').addEventListener('click', closePopup);

    // Global wheel: block browser-back gesture & route horizontal to galleries / tree
    window.addEventListener('wheel', (e) => {
        const ax = Math.abs(e.deltaX);
        const ay = Math.abs(e.deltaY);

        // Strict horizontal detection: must be clearly horizontal, not a slight diagonal
        if (ax < 3 || ax < ay * 2) return; // let vertical / diagonal scroll through normally

        // This is a horizontal-dominant gesture — always block browser back
        e.preventDefault();

        // Check if cursor is within the tree viewport
        const treeVp = document.getElementById('skills-tree');
        if (treeVp && treeVp.style.display !== 'none') {
            const treeRect = treeVp.getBoundingClientRect();
            if (e.clientY >= treeRect.top && e.clientY <= treeRect.bottom) {
                treeVp.scrollLeft += e.deltaX;
                return;
            }
        }

        // Find if cursor is within a gallery section
        for (const name in galleries) {
            const g = galleries[name];
            const rect = g.section.getBoundingClientRect();
            if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                g.scrollTarget = clamp(g.scrollTarget + e.deltaX, 0, g.scrollMax);
                break;
            }
        }
    }, { passive: false });

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePopup();
        if (e.key === 'ArrowRight') {
            for (const n in galleries) {
                galleries[n].scrollTarget = clamp(galleries[n].scrollTarget + 200, 0, galleries[n].scrollMax);
            }
        }
        if (e.key === 'ArrowLeft') {
            for (const n in galleries) {
                galleries[n].scrollTarget = clamp(galleries[n].scrollTarget - 200, 0, galleries[n].scrollMax);
            }
        }
    });

    // Resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            layoutConfig = getLayoutConfig();
            for (const name in galleries) {
                const g = galleries[name];
                const frac = g.scrollMax > 0 ? g.scrollPos / g.scrollMax : 0;
                renderGallery(name);
                g.scrollTarget = g.scrollMax * frac;
                g.scrollPos = g.scrollTarget;
            }
        }, 150);
    });
}

// ============================================
// HONEYCOMB BACKGROUND
// ============================================

function initHoneycomb() {
    const container = document.querySelector('.honeycomb-bg');
    if (!container) return;

    const colors = ['#ff6b00', '#ff6b00', '#7b2cbf', '#39ff14'];
    const hexRadius = 45;
    const hexW = Math.sqrt(3) * hexRadius;
    const hexH = 2 * hexRadius;
    const horizSpacing = hexW;
    const vertSpacing = hexH * 0.75;
    const cols = Math.ceil(window.innerWidth / horizSpacing) + 4;
    const rowCount = Math.ceil(window.innerHeight / vertSpacing) + 4;
    const svgWidth = cols * horizSpacing + hexW;
    const svgHeight = rowCount * vertSpacing + hexH;
    let paths = '';

    const grid = [];
    for (let y = 0; y < rowCount; y++) {
        grid[y] = [];
        for (let x = 0; x < cols; x++) grid[y][x] = false;
    }

    const numSeeds = 12 + Math.floor(Math.random() * 8);
    for (let i = 0; i < numSeeds; i++) {
        const seed = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rowCount) };
        const clusterSize = 8 + Math.floor(Math.random() * 25);
        const toVisit = [seed];
        let added = 0;
        while (toVisit.length > 0 && added < clusterSize) {
            const idx = Math.floor(Math.random() * toVisit.length);
            const cell = toVisit.splice(idx, 1)[0];
            if (cell.x < 0 || cell.x >= cols || cell.y < 0 || cell.y >= rowCount) continue;
            if (grid[cell.y][cell.x]) continue;
            grid[cell.y][cell.x] = true;
            added++;
            const nb = cell.y % 2 === 0
                ? [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1]]
                : [[-1,0],[1,0],[0,-1],[0,1],[1,-1],[1,1]];
            nb.forEach(([dx,dy]) => { if (Math.random()<0.7) toVisit.push({x:cell.x+dx,y:cell.y+dy}); });
        }
    }

    for (let y = 0; y < rowCount; y++) {
        for (let x = 0; x < cols; x++) {
            if (!grid[y][x]) continue;
            const px = x * horizSpacing + (y % 2) * (horizSpacing / 2) + hexRadius;
            const py = y * vertSpacing + hexRadius;
            const color = colors[Math.floor(Math.random() * colors.length)];
            const style = Math.random();
            const opacity = 0.4 + Math.random() * 0.6;
            const r = hexRadius, hw = r * Math.sqrt(3) / 2;
            const hp = `M${px} ${py-r}L${px+hw} ${py-r/2}L${px+hw} ${py+r/2}L${px} ${py+r}L${px-hw} ${py+r/2}L${px-hw} ${py-r/2}Z`;

            if (style < 0.3) {
                paths += `<path d="${hp}" fill="none" stroke="${color}" stroke-width="1.5" opacity="${opacity}"/>`;
            } else if (style < 0.5) {
                paths += `<path d="${hp}" fill="${color}" opacity="${opacity*0.25}"/>`;
            } else if (style < 0.65) {
                const pid = `s-${x}-${y}`;
                paths += `<defs><pattern id="${pid}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${color}" stroke-width="1.5" opacity="${opacity}"/></pattern></defs>`;
                paths += `<path d="${hp}" fill="url(#${pid})"/>`;
            } else if (style < 0.85) {
                const edges = [
                    `M${px} ${py-r}L${px+hw} ${py-r/2}`,`M${px+hw} ${py-r/2}L${px+hw} ${py+r/2}`,
                    `M${px+hw} ${py+r/2}L${px} ${py+r}`,`M${px} ${py+r}L${px-hw} ${py+r/2}`,
                    `M${px-hw} ${py+r/2}L${px-hw} ${py-r/2}`,`M${px-hw} ${py-r/2}L${px} ${py-r}`
                ];
                const n = 2+Math.floor(Math.random()*3), s = Math.floor(Math.random()*6);
                for (let e=0;e<n;e++) paths += `<path d="${edges[(s+e)%6]}" stroke="${color}" stroke-width="1.5" opacity="${opacity}" stroke-linecap="round"/>`;
            } else {
                paths += `<path d="${hp}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 4" opacity="${opacity}"/>`;
            }
        }
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'hex-layer';
    wrapper.innerHTML = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
    container.appendChild(wrapper);
}

function initParallax() {
    const honeycomb = document.querySelector('.honeycomb-bg');
    if (!honeycomb) return;
    document.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 15;
        const y = (e.clientY / window.innerHeight - 0.5) * 15;
        honeycomb.style.transform = `translate(${x}px, ${y}px)`;
    });
}

// ============================================
// AGENTS SECTION (hex + blurb, no timeline)
// ============================================

const AGENT_BLURBS = {
    agent_server: 'The central server between AI agents and the physical robot. Agents submit Python code that moves the arm, drives the base, and operates the gripper. Handles lease queueing, safety envelopes, trajectory recording, and a live dashboard with robot face display.',
    agent_system_logger: 'State recording library used by the agent server. Polls all subsystems at configurable Hz, stores unified waypoints with threshold filtering, and orchestrates coordinated rewind across arm, base, and gripper.'
};

const AGENT_IMAGES = {
    agent_server: [
        { src: 'images/agent_server_dashboard.png', caption: 'Service dashboard — robot state, map position, trajectory, and lease queue' },
        { src: 'images/agent_server_code_exec.png', caption: 'Code execution logs — sandboxed skill runs with live output' },
        { src: 'images/agent_server_face.png', caption: 'Robot face display — shows status and announces actions with audio' },
    ],
    // agent_system_logger: [
    //     { src: 'images/logger_1.png', caption: 'System logger dashboard' },
    // ],
};

function renderAgents(entries) {
    const grid = document.getElementById('agents-grid');
    if (!grid) return;

    const hexSize = HEX_SIZES.lg;

    grid.innerHTML = entries.map((entry, i) => {
        const typeColor = typeConfig[entry.type]?.color || '#9d4edd';
        const typeLabel = typeConfig[entry.type]?.label || 'Agent';
        const blurb = AGENT_BLURBS[entry.title] || entry.description;
        const patternIdx = i % 4;
        const floatDelay = (i * 1.2).toFixed(1);

        return `<div class="agent-item">
            <div class="agent-hex hex-card hex-lg visible"
                 style="width:${hexSize.w}px;height:${hexSize.h}px;--float-delay:${floatDelay}s;position:relative;"
                 data-url="${entry.html_url || ''}">
                <div class="hex-border">
                    <div class="hex-inner">
                        <div class="hex-bg pattern-${patternIdx}"
                             style="--type-color:${typeColor};"></div>
                        <div class="hex-content">
                            <span class="hex-type" style="color:${typeColor};">${typeLabel}</span>
                            <h3 class="hex-title">${entry.title}</h3>
                            <span class="hex-date">${entry.language || ''}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="agent-blurb">
                <h3 class="agent-blurb-title">${entry.title}</h3>
                <p class="agent-blurb-text">${blurb}</p>
                ${entry.html_url ? `<a href="${entry.html_url}" target="_blank" rel="noopener noreferrer" class="popup-repo-link">View Repo →</a>` : ''}
                ${AGENT_IMAGES[entry.title] ? `<div class="agent-thumbs">${AGENT_IMAGES[entry.title].map(img => `<img class="agent-thumb" src="${img.src}" data-caption="${img.caption}" alt="${img.caption}">`).join('')}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    // Click to open repo
    grid.querySelectorAll('.agent-hex').forEach(hex => {
        hex.style.cursor = 'pointer';
        hex.addEventListener('click', () => {
            const url = hex.dataset.url;
            if (url) window.open(url, '_blank');
        });
    });
}

// ============================================
// LIGHTBOX (for agent image gallery)
// ============================================

function openLightbox(src, caption) {
    const overlay = document.getElementById('lightbox-overlay');
    overlay.querySelector('.lightbox-img').src = src;
    overlay.querySelector('.lightbox-caption').textContent = caption || '';
    overlay.classList.add('open');
}

function closeLightbox() {
    document.getElementById('lightbox-overlay').classList.remove('open');
}

function initLightbox() {
    const overlay = document.getElementById('lightbox-overlay');
    if (!overlay) return;

    overlay.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
    overlay.querySelector('.lightbox-close').addEventListener('click', closeLightbox);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) {
            closeLightbox();
        }
    });

    document.addEventListener('click', (e) => {
        const thumb = e.target.closest('.agent-thumb');
        if (thumb) {
            openLightbox(thumb.src, thumb.dataset.caption);
        }
    });
}

// ============================================
// DEPENDENCY TREE VIEW
// ============================================

function computeTreeLayout(entries) {
    // Build name→entry map
    const byName = {};
    entries.forEach(e => { byName[e.title] = e; });

    // Build adjacency: who depends on whom, and who is depended on
    const depsOf = {};   // name → [dep names]
    const usedBy = {};   // name → [parent names]
    entries.forEach(e => {
        const deps = (e.dependencies || []).filter(d => byName[d]);
        depsOf[e.title] = deps;
        deps.forEach(d => {
            if (!usedBy[d]) usedBy[d] = [];
            usedBy[d].push(e.title);
        });
    });

    // Assign layers: leaf (no deps) = 0, composite = max(dep layers) + 1
    const layerOf = {};
    function getLayer(name) {
        if (layerOf[name] !== undefined) return layerOf[name];
        const deps = depsOf[name] || [];
        if (deps.length === 0) {
            layerOf[name] = 0;
        } else {
            layerOf[name] = Math.max(...deps.map(getLayer)) + 1;
        }
        return layerOf[name];
    }
    entries.forEach(e => getLayer(e.title));

    // Group by layer
    const layers = {};
    let maxLayer = 0;
    entries.forEach(e => {
        const l = layerOf[e.title];
        if (!layers[l]) layers[l] = [];
        layers[l].push(e);
        if (l > maxLayer) maxLayer = l;
    });

    // Layout parameters
    const hexSize = HEX_SIZES.lg;
    const cfg = layoutConfig;
    const hw = Math.round(hexSize.w * cfg.sizeScale);
    const hh = Math.round(hexSize.h * cfg.sizeScale);
    const hGap = Math.round(40 * cfg.sizeScale);
    const vGap = Math.round(80 * cfg.sizeScale);

    // Position nodes: top layer (highest) at top, layer 0 at bottom
    // Center each row horizontally relative to the widest row
    const nodes = [];
    const nodeByName = {};
    const labelPadLeft = 90;

    // Find the widest row to determine total width
    let maxRowW = 0;
    for (let l = maxLayer; l >= 0; l--) {
        const row = layers[l] || [];
        const rowW = row.length * hw + (row.length - 1) * hGap;
        if (rowW > maxRowW) maxRowW = rowW;
    }

    for (let l = maxLayer; l >= 0; l--) {
        const row = layers[l] || [];
        const rowY = (maxLayer - l) * (hh + vGap);
        const rowW = row.length * hw + (row.length - 1) * hGap;
        const offsetX = labelPadLeft + (maxRowW - rowW) / 2;

        row.forEach((entry, i) => {
            const x = offsetX + i * (hw + hGap) + hw / 2;
            const y = rowY + hh / 2;
            const node = { entry, x, y, w: hw, h: hh, layer: l };
            nodes.push(node);
            nodeByName[entry.title] = node;
        });
    }

    // Compute edges
    const edges = [];
    entries.forEach(e => {
        const deps = depsOf[e.title] || [];
        deps.forEach(depName => {
            if (nodeByName[e.title] && nodeByName[depName]) {
                edges.push({ from: nodeByName[e.title], to: nodeByName[depName] });
            }
        });
    });

    // Compute total dimensions
    let maxX = 0, maxY = 0;
    nodes.forEach(n => {
        const r = n.x + n.w / 2;
        const b = n.y + n.h / 2;
        if (r > maxX) maxX = r;
        if (b > maxY) maxY = b;
    });

    return { nodes, edges, totalW: maxX + 40, totalH: maxY + 40, maxLayer, hexW: hw, hexH: hh, vGap, labelPadLeft };
}

function renderSkillTree(entries) {
    const treeContainer = document.getElementById('skills-tree');
    const nodesContainer = document.getElementById('tree-nodes');
    const edgesSvg = document.getElementById('tree-edges');
    if (!treeContainer || !nodesContainer || !edgesSvg) return;

    const layout = computeTreeLayout(entries);
    const cfg = layoutConfig;

    // Set container size
    nodesContainer.style.width = layout.totalW + 'px';
    nodesContainer.style.height = layout.totalH + 'px';
    edgesSvg.setAttribute('width', layout.totalW);
    edgesSvg.setAttribute('height', layout.totalH);
    edgesSvg.style.width = layout.totalW + 'px';
    edgesSvg.style.height = layout.totalH + 'px';

    // Render layer labels
    let nodesHTML = '';
    const layerLabels = {};
    layout.nodes.forEach(n => {
        if (layerLabels[n.layer] === undefined) {
            layerLabels[n.layer] = n.y;
        }
    });
    Object.entries(layerLabels).forEach(([layer, y]) => {
        const label = parseInt(layer) === 0 ? 'Primitives' : `Composed L${layer}`;
        nodesHTML += `<div class="tree-layer-label" style="top:${y}px;">${label}</div>`;
    });

    // SDK module badge config — one color per module
    const sdkBadgeConfig = {
        arm:     { letter: 'A', cls: 'sdk-arm' },
        base:    { letter: 'B', cls: 'sdk-base' },
        gripper: { letter: 'G', cls: 'sdk-gripper' },
        sensors: { letter: 'S', cls: 'sdk-sensors' },
        yolo:    { letter: 'Y', cls: 'sdk-yolo' },
        display: { letter: 'D', cls: 'sdk-display' },
        rewind:  { letter: 'R', cls: 'sdk-rewind' }
    };

    // Render hex cards
    layout.nodes.forEach((node, i) => {
        const entry = node.entry;
        const hexLeft = node.x - node.w / 2;
        const hexTop = node.y - node.h / 2;
        const baseTypeColor = typeConfig[entry.type]?.color || '#ff6b00';
        // Skills with a ground-truth test get the hardware-red tint (same as
        // hardware_service repos on the home page) to mark them as live-validated.
        const typeColor = entry.task_env ? '#ff3b30' : baseTypeColor;
        const typeLabel = typeConfig[entry.type]?.label || entry.type;
        const title = entry.title || 'Untitled';
        const floatDelay = ((i * 0.7) % 5).toFixed(1);
        const patternIdx = i % 4;

        // Derive SDK modules from sdk_functions
        let sdkBadgesHTML = '';
        if (entry.sdk_functions && entry.sdk_functions.length > 0) {
            const modules = [...new Set(entry.sdk_functions.map(f => f.split('.')[0]))];
            const badges = modules
                .filter(m => sdkBadgeConfig[m])
                .map(m => {
                    const cfg = sdkBadgeConfig[m];
                    return `<span class="sdk-badge ${cfg.cls}" title="${m}">${cfg.letter}</span>`;
                })
                .join('');
            if (badges) {
                sdkBadgesHTML = `<div class="hex-sdk-badges">${badges}</div>`;
            }
        }

        const treeStatusClass = IS_LOCAL && entry.status ? `status-${entry.status}` : '';
        let treeAgentHTML = '';
        if (IS_LOCAL && entry.target_agents && Object.keys(entry.target_agents).length > 1) {
            treeAgentHTML = `<div class="hex-target-agents">${Object.entries(entry.target_agents).map(([tname, ta]) => {
                const c = agentStatusColors[ta.status] || '#6b6b7b';
                return `<div class="hex-target-agent"><span class="status-dot" style="background:${c}"></span><span class="target-label">${tname}</span> <span style="color:${c}">${ta.status}</span></div>`;
            }).join('')}</div>`;
        } else if (IS_LOCAL && entry.agent_status_text) {
            treeAgentHTML = `<div class="hex-agent-status"><span class="status-dot ${entry.status || ''}"></span>${entry.agent_status_text}</div>`;
        }

        nodesHTML += `<div class="tree-hex-card hex-lg ${treeStatusClass}" data-title="${entry.title}" data-entry-index="${i}"
            style="left:${hexLeft}px;top:${hexTop}px;width:${node.w}px;height:${node.h}px;
                   --float-delay:${floatDelay}s;">
            <div class="hex-border">
                <div class="hex-inner">
                    <div class="hex-bg pattern-${patternIdx}"
                         style="--type-color:${typeColor};"></div>
                    <div class="hex-content">
                        <span class="hex-type" style="color:${typeColor};">${typeLabel}</span>
                        <h3 class="hex-title">${title}</h3>
                        ${entry.success_rate != null ? `<span class="hex-rate"><span class="hex-rate-label">Success </span>${entry.success_rate}%</span>` : ''}
                        ${entry.target_results ? `<div class="hex-target-dots">${Object.entries(entry.target_results).map(([n,r]) => `<span class="target-dot ${r.passed ? 'pass' : 'fail'}" title="${n}: ${r.passed ? 'PASS' : 'FAIL'}"></span>`).join('')}</div>` : ''}
                        ${sdkBadgesHTML}
                        ${treeAgentHTML}
                    </div>
                </div>
            </div>
        </div>`;
    });

    nodesContainer.innerHTML = nodesHTML;

    // Render SVG edges
    // Hex clip-path vertices: top at 3.75% of height, bottom at 96.25%
    // Inset endpoints so edges connect at the hex boundary, not the bounding box
    const hexInset = 0.13;
    let edgePaths = '';
    layout.edges.forEach(edge => {
        const fromX = edge.from.x;
        const fromY = edge.from.y + edge.from.h * (0.5 - hexInset); // bottom vertex of parent hex
        const toX = edge.to.x;
        const toY = edge.to.y - edge.to.h * (0.5 - hexInset); // top vertex of child hex
        const midY = (fromY + toY) / 2;

        edgePaths += `<path class="tree-edge-path" data-from="${edge.from.entry.title}" data-to="${edge.to.entry.title}"
            d="M${fromX},${fromY} C${fromX},${midY} ${toX},${midY} ${toX},${toY}" />`;
    });
    edgesSvg.innerHTML = edgePaths;

    // Build adjacency lookup for hover highlighting
    const byName = {};
    entries.forEach(e => { byName[e.title] = e; });
    const childrenOf = {};  // name → [child names] (direct dependencies)
    const parentsOf = {};   // name → [parent names] (who depends on this)
    entries.forEach(e => {
        const deps = (e.dependencies || []).filter(d => byName[d]);
        childrenOf[e.title] = deps;
        deps.forEach(d => {
            if (!parentsOf[d]) parentsOf[d] = [];
            parentsOf[d].push(e.title);
        });
    });

    // Staggered entrance
    nodesContainer.querySelectorAll('.tree-hex-card').forEach((card, i) => {
        setTimeout(() => card.classList.add('visible'), i * 60);
    });

    // Hover highlighting + click handler
    nodesContainer.querySelectorAll('.tree-hex-card').forEach(card => {
        const title = card.dataset.title;

        card.addEventListener('mouseenter', () => {
            nodesContainer.classList.add('has-highlight');

            // Highlight children (dependencies)
            (childrenOf[title] || []).forEach(child => {
                const el = nodesContainer.querySelector(`[data-title="${child}"]`);
                if (el) el.classList.add('highlight-child');
                edgesSvg.querySelectorAll(`[data-from="${title}"][data-to="${child}"]`)
                    .forEach(p => p.classList.add('highlight-child'));
            });

            // Highlight parents (who depends on this)
            (parentsOf[title] || []).forEach(parent => {
                const el = nodesContainer.querySelector(`[data-title="${parent}"]`);
                if (el) el.classList.add('highlight-parent');
                edgesSvg.querySelectorAll(`[data-from="${parent}"][data-to="${title}"]`)
                    .forEach(p => p.classList.add('highlight-parent'));
            });
        });

        card.addEventListener('mouseleave', () => {
            nodesContainer.classList.remove('has-highlight');
            nodesContainer.querySelectorAll('.highlight-child, .highlight-parent')
                .forEach(el => el.classList.remove('highlight-child', 'highlight-parent'));
            edgesSvg.querySelectorAll('.highlight-child, .highlight-parent')
                .forEach(el => el.classList.remove('highlight-child', 'highlight-parent'));
        });

        card.addEventListener('click', () => {
            const g = galleries.skills;
            if (!g) return;
            const idx = g.entries.findIndex(e => e.title === title);
            if (idx >= 0) openPopup('skills', idx);
        });
    });
}

// ============================================
// INIT
// ============================================

function initGallery(name, entries) {
    const section = document.querySelector(`.gallery-section[data-gallery="${name}"]`);
    if (!section) return;

    galleries[name] = {
        entries,
        hexLayout: [],
        scrollPos: 0,
        scrollTarget: 0,
        scrollMax: 0,
        dragging: false,
        dragX: 0,
        dragScroll: 0,
        section,
        viewport: section.querySelector('.gallery-viewport'),
        track: section.querySelector('.gallery-track'),
        progressFill: section.querySelector('.gallery-progress-fill'),
        countEl: section.querySelector('.gallery-count')
    };

    renderGallery(name);
    setupGalleryEvents(name);

    // Start scrolled to end (most recent)
    const g = galleries[name];
    g.scrollTarget = g.scrollMax;
    g.scrollPos = g.scrollMax;
}

document.addEventListener('DOMContentLoaded', async () => {
    initHoneycomb();
    initParallax();
    initLightbox();

    const services = await loadServices();
    const { agents, nonAgents } = splitAgentServices(services);

    // Skills: on local mode, init empty gallery first so WS full_sync can populate it,
    // then connect WS and wait briefly for orchestrator data before falling back to JSON file.
    if (IS_LOCAL && IS_LOCAL_SERVER) {
        initGallery('skills', prepareEntries([]));
        initLocalMode(); // Connect WS after gallery exists so full_sync isn't dropped
        // Wait for WS full_sync to arrive with live data
        const gotSync = await new Promise(resolve => {
            const check = setInterval(() => {
                if (galleries.skills && galleries.skills.entries.length > 0) {
                    clearInterval(check);
                    resolve(true);
                }
            }, 100);
            setTimeout(() => { clearInterval(check); resolve(false); }, 2000);
        });
        if (!gotSync) {
            // Fallback to JSON if orchestrator didn't respond
            const skills = await loadRepos(BASE_PATH + 'logs/local_repos.json');
            const preparedSkills = prepareEntries(skills);
            initGallery('skills', preparedSkills);
            renderSkillTree(preparedSkills);
        }
    } else {
        initLocalMode(); // For non-local-server local pages (no-op for main site)
        const skillsFile = IS_LOCAL ? BASE_PATH + 'logs/local_repos.json' : BASE_PATH + 'logs/repos.json';
        const skills = await loadRepos(skillsFile);
        const preparedSkills = prepareEntries(skills);
        initGallery('skills', preparedSkills);
        renderSkillTree(preparedSkills);
    }

    // Toggle between timeline and tree views
    const toggle = document.getElementById('skills-view-toggle');
    if (toggle) {
        const skillsSection = document.querySelector('.gallery-section[data-gallery="skills"]');
        const galleryViewport = skillsSection?.querySelector('.gallery-viewport');
        const galleryNav = skillsSection?.querySelector('.gallery-nav');
        const treeViewport = document.getElementById('skills-tree');

        toggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.view-toggle-btn');
            if (!btn) return;
            const view = btn.dataset.view;

            toggle.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (view === 'tree') {
                if (galleryViewport) galleryViewport.style.display = 'none';
                if (galleryNav) galleryNav.style.display = 'none';
                if (treeViewport) treeViewport.style.display = '';
            } else {
                if (galleryViewport) galleryViewport.style.display = '';
                if (galleryNav) galleryNav.style.display = '';
                if (treeViewport) treeViewport.style.display = 'none';
                // Recalculate scrollMax now that viewport is visible
                const g = galleries.skills;
                if (g) {
                    const trackW = g.track.offsetWidth;
                    g.scrollMax = Math.max(0, trackW - g.viewport.offsetWidth);
                    g.scrollTarget = Math.min(g.scrollTarget, g.scrollMax);
                    g.scrollPos = Math.min(g.scrollPos, g.scrollMax);
                }
            }
        });

        // Drag-to-scroll for tree viewport
        if (treeViewport) {
            let treeDrag = false, treeDragX = 0, treeScrollStart = 0, treeDragMoved = false;

            treeViewport.addEventListener('mousedown', (e) => {
                treeDrag = true;
                treeDragMoved = false;
                treeDragX = e.clientX;
                treeScrollStart = treeViewport.scrollLeft;
            });
            window.addEventListener('mousemove', (e) => {
                if (!treeDrag) return;
                const dx = treeDragX - e.clientX;
                if (Math.abs(dx) > 4) {
                    treeDragMoved = true;
                    treeViewport.style.cursor = 'grabbing';
                }
                treeViewport.scrollLeft = treeScrollStart + dx;
            });
            window.addEventListener('mouseup', () => {
                if (treeDrag) {
                    treeDrag = false;
                    treeViewport.style.cursor = 'grab';
                }
            });

            // Touch drag
            treeViewport.addEventListener('touchstart', (e) => {
                treeDrag = true;
                treeDragMoved = false;
                treeDragX = e.touches[0].clientX;
                treeScrollStart = treeViewport.scrollLeft;
            }, { passive: true });
            treeViewport.addEventListener('touchmove', (e) => {
                if (!treeDrag) return;
                const dx = treeDragX - e.touches[0].clientX;
                if (Math.abs(dx) > 8) treeDragMoved = true;
                treeViewport.scrollLeft = treeScrollStart + dx;
            }, { passive: true });
            treeViewport.addEventListener('touchend', () => { treeDrag = false; });

            // Suppress click after drag on tree cards
            treeViewport.addEventListener('click', (e) => {
                if (treeDragMoved) { e.stopPropagation(); treeDragMoved = false; }
            }, true);
        }
    }

    // Agents: repos with "agent" in the name (the glue between skills and services)
    renderAgents(prepareEntries(agents));

    // Services: remaining repos from TidyBot-Services org
    initGallery('services', prepareEntries(nonAgents));

    setupGlobalEvents();
    tick();
    initTaglineRotator();
    if (typeof initWishlist === 'function') initWishlist();
});

// ============================================
// TAGLINE ROTATOR
// ============================================

const TAGLINES = [
    'Moltbook for Tidybots',
    'Auto Experiment with Just a Wish',
    "It's Christmas for Tidybots Every Day",
    'Wish It. Build It. Share It.',
    'Your Robot Learns While You Sleep',
    'Fail Safe. Rewind. Try Again.',
    'Every Robot Gets Better When One Does',
    'One Skill Away from a Smarter Robot',
    'Slurm Server for your Tidybot',
    'Bring the Lobster into the Physical World',
    'DM Your Robot What You Need',
];

function initTaglineRotator() {
    const el = document.getElementById('tagline-text');
    if (!el) return;

    let currentIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let pauseTimer = null;

    const TYPE_SPEED = 45;
    const DELETE_SPEED = 25;
    const PAUSE_AFTER_TYPE = 3000;
    const PAUSE_AFTER_DELETE = 400;

    function step() {
        const current = TAGLINES[currentIndex];

        if (!isDeleting) {
            // Typing
            charIndex++;
            el.textContent = current.slice(0, charIndex);

            if (charIndex >= current.length) {
                // Done typing, pause then delete
                pauseTimer = setTimeout(() => {
                    isDeleting = true;
                    step();
                }, PAUSE_AFTER_TYPE);
                return;
            }
            setTimeout(step, TYPE_SPEED);
        } else {
            // Deleting
            charIndex--;
            el.textContent = current.slice(0, charIndex);

            if (charIndex <= 0) {
                // Done deleting, move to next
                isDeleting = false;
                currentIndex = (currentIndex + 1) % TAGLINES.length;
                pauseTimer = setTimeout(step, PAUSE_AFTER_DELETE);
                return;
            }
            setTimeout(step, DELETE_SPEED);
        }
    }

    // Start after a short delay
    setTimeout(step, 1200);
}

// Export
window.TidyBotTimeline = {
    openEntry: (gallery, index) => openPopup(gallery, index),
    getGallery: (name) => galleries[name],
    reload: async () => {
        const skillsFile = IS_LOCAL ? BASE_PATH + 'logs/local_repos.json' : BASE_PATH + 'logs/repos.json';
        const [skills, services] = await Promise.all([
            loadRepos(skillsFile),
            loadServices()
        ]);
        const { agents, nonAgents } = splitAgentServices(services);
        galleries.skills && (galleries.skills.entries = prepareEntries(skills));
        renderAgents(prepareEntries(agents));
        galleries.services && (galleries.services.entries = prepareEntries(nonAgents));
        for (const n in galleries) renderGallery(n);
    }
};
