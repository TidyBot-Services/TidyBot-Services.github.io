// Pipeline section — popup content for layers and components.
// Wires clicks on .pipeline-layer-title and .pipeline-comp to the existing
// #popup-overlay infrastructure (same as the gallery hexes use).

const PIPELINE_CONTENT = {
    // ---------- Layer cards ----------
    'intelligence': {
        eyebrow: 'L1 · Authoring',
        title: 'Intelligence',
        tagline: 'orchestrator + AI agents — they write the Python and dispatch the work',
        desc: `The top tier. A standalone <code>agent_orchestrator.py</code> daemon walks the task graph, fans out one Claude Agent SDK client per (skill × sim target) to write Python, and a separate evaluator agent reviews each recording. Everything in this tier is <em>episodic</em> — it spins up when a task arrives and tears down after it ships.`,
        sections: [
            { label: 'Process', items: ['agent_orchestrator.py (separate daemon)', 'Claude Agent SDK clients (in-process)'] },
            { label: 'Talks down to', items: ['L2 Runtime via /code/submit, /docs/guide, /code/sdk'] },
            { label: 'Produces', items: ['Skills artifact (Python files) + verdicts'] },
        ],
    },
    'skills': {
        eyebrow: '⤓ Artifact ⤒',
        title: 'Skills',
        tagline: 'Python files — the artifact written by L1 and consumed by L2',
        desc: `Skills aren't a service, they're a <strong>data channel</strong> sitting between L1 Intelligence and L2 Runtime. L1 writes Python here; L2 picks it up via <code>POST /code/submit</code> and runs it in a sandbox. Telemetry flows back the other way (recordings + logs from L2 are read by the eval agent in L1). That's why this band has a dashed border — nothing's running here, things are just passing through.`,
        sections: [
            { label: 'Files live in', items: ['skills/', 'skill-agent-setup/', 'graphs/<task>/'] },
            { label: 'Written by', items: ['Dev agents (L1)', 'Humans (hand-tuning)'] },
            { label: 'Consumed by', items: ['L2 Runtime via /code/submit'] },
            { label: 'Telemetry flows back', items: ['recordings → eval agent (L1)', 'system_logger → eval agent (L1)'] },
        ],
    },
    'agent-server': {
        eyebrow: 'L2 · Runtime',
        title: 'Agent Server',
        tagline: 'unified API · sandboxed code execution · safety + logging',
        desc: `The runtime that turns "Python script" into "robot moving safely." A FastAPI service that exposes one HTTP/WebSocket API over arm + base + gripper + cameras + mocap. Holds the lease (only one caller commands the robot at a time), enforces a workspace safety envelope, runs skill code in a sandbox via robot_sdk, records every command into a unified trajectory log, and supports rewind for error recovery. Same API on hardware and on every sim.`,
        sections: [
            { label: 'Repo', items: ['agent_server/'] },
            { label: 'Talks up to', items: ['Skills via robot_sdk', 'Dev/Eval agents via HTTP/WS'] },
            { label: 'Talks down to', items: ['Service drivers + sim bridges via ZMQ/RPC/WS'] },
            { label: 'Dashboard', items: ['localhost:8080/services/dashboard'] },
        ],
    },
    'services': {
        eyebrow: 'L3 · Substrate',
        title: 'Services',
        tagline: 'atomic capabilities behind a uniform protocol — HW + sim + ML',
        desc: `Noun-shaped resources: a hardware driver, a vision model, a grasp planner — each behind a stable protocol bridge. Hardware drivers run on-robot; heavier ML services run off-board. Critically, simulator bridges expose the SAME ports and protocols as the real drivers, so the Agent Server can't tell hardware from sim.`,
        sections: [
            { label: 'Hardware drivers', items: ['arm_franka_service', 'base_tidybot_service', 'gripper_robotiq_service', 'camera_realsense_service'] },
            { label: 'Sim bridges (same protocol)', items: ['ManiSkill bridge', 'RoboCasa bridge'] },
            { label: 'ML / GPU services', items: ['YOLO (detection)', 'SAM2 (segmentation)', 'GraspGen (6-DOF grasp)', 'Stereo (depth)'] },
        ],
    },

    // ---------- L1 Intelligence chips ----------
    'ai-orch': {
        eyebrow: 'L1 · Intelligence',
        title: 'orchestrator',
        tagline: 'Standalone daemon — walks the task graph, fans out agents, collects results.',
        desc: `<code>agent_orchestrator.py</code>, a separate asyncio process listening on ports <strong>8765</strong> (WebSocket) and <strong>8766</strong> (HTTP). It loads the hand-curated <code>graph.json</code>, finds skills whose dependencies are <code>done</code>, spawns Claude SDK clients (one per skill × per sim target), monitors them, and triggers the evaluator after each finishes. Calls L2 Agent Server's API to submit code; never lives inside it.`,
        sections: [
            { label: 'Lives in', items: ['skill-agent-setup/claude-code/agent_orchestrator.py'] },
            { label: 'Ports', items: ['8765 · WebSocket', '8766 · HTTP'] },
            { label: 'Key fns', items: ['_auto_spawn_ready_skills()', 'spawn_agent()', 'run_multi_target_test()'] },
        ],
    },
    'ai-dev': {
        eyebrow: 'L1 · Intelligence',
        title: 'dev agents',
        tagline: 'Claude Agent SDK clients — write Python, talk to L2 in a tight loop.',
        desc: `For each ready skill the orchestrator creates an <code>AgentState</code> + <code>ClaudeSDKClient</code> (in-process, not a subprocess). The dev agent reads <code>/docs/guide</code> and <code>/code/sdk</code> from L2, queries state, drafts code, submits it via <code>/code/submit</code>, watches stdout/stderr stream back, fixes bugs, and re-submits — until the skill works or budget runs out.`,
        sections: [
            { label: 'Mechanism', items: ['Claude Agent SDK', 'asyncio Task per agent'] },
            { label: 'Reads from L2', items: ['/docs/guide', '/code/sdk', '/state', '/services'] },
            { label: 'Writes to L2', items: ['/lease/acquire', '/code/submit'] },
        ],
    },
    'ai-eval': {
        eyebrow: 'L1 · Intelligence',
        title: 'eval agents',
        tagline: 'Separate SDK clients — review the recording, vote pass/fail.',
        desc: `After each dev-agent attempt finishes, the orchestrator spins up a fresh evaluator (also a <code>ClaudeSDKClient</code>) that loads camera frames + system_logger trajectory from L2, judges against the task's success criteria, and writes the verdict back into <code>graph.json</code>. On pass the skill is marked <code>done</code>, downstream skills become eligible. On fail the verdict feeds back into the dev agent's next attempt.`,
        sections: [
            { label: 'Run by', items: ['_run_submission_eval() in agent_orchestrator.py'] },
            { label: 'Inputs', items: ['camera frames (L3)', 'system_logger waypoints (L2)', 'agent transcript'] },
            { label: 'Outputs', items: ['pass / fail verdict', 'targeted feedback for the dev agent'] },
        ],
    },
    'ai-graph': {
        eyebrow: 'L1 · Intelligence',
        title: 'task graph',
        tagline: 'Hand-curated graph.json — the input that fires up the whole pipeline.',
        desc: `A <code>graph.json</code> file lists skill nodes with names, descriptions, dependencies, and a <code>task_env</code> for the sim. There's no LLM auto-decomposer — humans write the graph (the only part of L1 humans still touch). The orchestrator loads it, treats each skill as a node, and walks the DAG. Single-stage tasks have one root; multi-stage tasks form a DAG.`,
        sections: [
            { label: 'Lives in', items: ['skill-agent-setup/claude-code/graphs/<task>/graph.json'] },
            { label: 'Schema', items: ['task_env', 'task_source', 'entries[].name', 'entries[].dependencies'] },
            { label: 'Loaded by', items: ['agent_orchestrator.py · _load_entries()'] },
        ],
    },

    // ---------- Agent Server components ----------
    'as-sdk': {
        eyebrow: 'Agent Server',
        title: 'robot_sdk',
        tagline: 'Python SDK that skill code calls — the inside of the sandbox.',
        desc: `What you import inside a skill. Wraps every robot capability (move arm, drive base, open/close gripper, query state, capture image, request grasp, run a planner) behind ergonomic Python. Calls go out over the Code Execution job channel back to the Agent Server.`,
        status: 'shipped',
        flow: {
            upstream: ['Skill code'],
            downstream: ['Agent Server (HTTP)'],
        },
        code: {
            label: 'pick_apple.py',
            text: `from robot_sdk import arm, gripper, find_objects

# Find the apple in the workspace
apple = find_objects("apple")[0]

# Move above, descend, close gripper
arm.move_to(apple.pose, z_offset=0.15)
arm.move_delta(z=-0.15)
gripper.close()`,
        },
        sections: [
            { label: 'Common calls', items: ['robot_sdk.arm', 'robot_sdk.base', 'robot_sdk.gripper', 'robot_sdk.find_objects', 'robot_sdk.rewind', 'robot_sdk.http'] },
        ],
    },
    'as-codeexec': {
        eyebrow: 'Agent Server',
        title: 'Code Execution',
        tagline: 'Sandboxed Python runner — submit code, stream output.',
        desc: `Skills are not run as files — they're submitted as Python over HTTP, executed in a subprocess sandbox with robot_sdk available, and stdout/stderr stream back. Idle timeout, lease enforcement, and resource limits live here.`,
        status: 'shipped',
        flow: {
            upstream: ['Dev/Eval agent', 'CLI / dashboard'],
            downstream: ['Subprocess + robot_sdk'],
        },
        code: {
            label: 'submit_skill.sh',
            text: `# Submit a skill as a one-shot HTTP job
curl -X POST localhost:8080/code/run \\
  -H "X-Lease-Id: $LEASE" \\
  -H "Content-Type: text/x-python" \\
  --data-binary @skill.py

# Stream stdout/stderr back as the job runs
curl -N localhost:8080/code/jobs/$JOB_ID/stream`,
        },
    },
    'as-lease': {
        eyebrow: 'Agent Server',
        title: 'Lease',
        tagline: 'Only one caller commands the robot at a time.',
        desc: `A short-lived token (X-Lease-Id) you must hold to issue commands. Auto-renewed while active, auto-released on disconnect. Releasing the lease triggers go_home + (in sim) /reset — don't add another reset at the end of your script.`,
        status: 'shipped',
        code: {
            label: 'acquire_lease.sh',
            text: `LEASE=$(curl -s -X POST localhost:8080/lease/acquire \\
  -H "Content-Type: application/json" \\
  -d '{"holder": "recovery"}' | jq -r '.lease_id')

# Use $LEASE in subsequent calls
curl -X POST localhost:8080/rewind/percentage \\
  -H "X-Lease-Id: $LEASE" \\
  -d '{"percentage": 10.0}'`,
        },
    },
    'as-safety': {
        eyebrow: 'Agent Server',
        title: 'Safety Envelope',
        tagline: 'Workspace bounds enforced before every motion command.',
        desc: `A configurable bounding box around the robot. Commands that would leave it are rejected before they reach the driver. Tunable per-deployment.`,
        status: 'indev',
    },
    'as-logger': {
        eyebrow: 'Agent Server',
        title: 'System Logger',
        tagline: 'Unified trajectory recording across arm + base + gripper.',
        desc: `Polls all subsystems at 10 Hz, threshold-filters into UnifiedWaypoints, and persists the resulting trajectory. The recording is what powers Rewind and the Sessions Demos viewer.`,
        sections: [
            { label: 'Repo', items: ['system_logger/'] },
        ],
    },
    'as-rewind': {
        eyebrow: 'Agent Server',
        title: 'Rewind',
        tagline: 'Replay the trajectory backwards to escape a bad state.',
        desc: `Group recorded waypoints into chunks, interpolate arm cubically, base linearly with Ruckig, run at 50 Hz. Available as robot_sdk.rewind, REST at /rewind/*, or "rewind 10%" to unwind a recent collision.`,
        status: 'shipped',
        flow: {
            upstream: ['Skill', 'System Logger'],
            downstream: ['Arm + Base drivers'],
        },
        code: {
            label: 'recover.py',
            text: `from robot_sdk import rewind

# Walk the last 10% of recorded trajectory backwards
rewind.percentage(10.0)

# Or rewind to a tagged checkpoint
rewind.to_tag("before_grasp")`,
        },
    },
    'as-dashboard': {
        eyebrow: 'Agent Server',
        title: 'Dashboard',
        tagline: 'Live web UI for state, lease, log, and the robot face.',
        desc: `localhost:8080/services/dashboard. Watch state, see who holds the lease, scrub the trajectory, and start/stop services from the browser. Same component used by the Local Demo page.`,
    },

    // ---------- Services ----------
    'svc-arm': {
        eyebrow: 'Service · hardware',
        title: 'arm_franka_service',
        tagline: '1 kHz Franka Panda controller — ZMQ, ROS-free.',
        desc: `Client-server driver for the Franka Panda arm. ZMQ commands on port 5555, state on 5556, stream on 5557. ROS-free, runs at the FCI 1 kHz rate.`,
    },
    'svc-base': {
        eyebrow: 'Service · hardware',
        title: 'base_tidybot_service',
        tagline: 'Tidybot mobile base — RPC server.',
        desc: `RPC driver for the Tidybot omni-directional base. Port 50000.`,
    },
    'svc-gripper': {
        eyebrow: 'Service · hardware',
        title: 'gripper_robotiq_service',
        tagline: 'Robotiq parallel gripper — ZMQ.',
        desc: `Robotiq gripper driver. Commands on 5570, state on 5571.`,
    },
    'svc-camera': {
        eyebrow: 'Service · hardware',
        title: 'camera_realsense_service',
        tagline: 'Intel RealSense streaming — WebSocket JPEG.',
        desc: `Streams JPEG-encoded RGB-D frames over WebSocket on port 5580. Same protocol used by sim camera bridges.`,
    },
    'svc-maniskill-sim': {
        eyebrow: 'Service · simulator',
        title: 'maniskill_sim',
        tagline: 'ManiSkill3 / SAPIEN-based simulator process.',
        desc: `The actual physics + render server. Hosts the sim viewer, manages scene state, and exposes per-component bridges so the Agent Server's protocol works unchanged. Repo: maniskill_sim.`,
    },
    'svc-robocasa-sim': {
        eyebrow: 'Service · simulator',
        title: 'robocasa_sim',
        tagline: 'RoboCasa / MuJoCo kitchen-task simulator.',
        desc: `MuJoCo-based sim built on RoboCasa, with 115 kitchen tasks across layouts and styles. Provides the per-component bridges that mirror the hardware protocol.`,
    },
    'svc-maniskill-bridge': {
        eyebrow: 'Service · sim bridge group',
        title: 'ManiSkill bridges',
        tagline: 'Per-component protocol bridges — same ports as hardware.',
        desc: `Four bridge services that wrap maniskill_sim so the Agent Server can talk to it through the exact same ZMQ/RPC/WebSocket protocol it uses on hardware. Agent Server can't tell sim from hardware.`,
        sections: [
            { label: 'The 4 bridges', items: ['arm_franka_maniskill_service', 'base_tidybot_maniskill_service', 'gripper_robotiq_maniskill_service', 'camera_realsense_maniskill_service'] },
        ],
    },
    'svc-robocasa-bridge': {
        eyebrow: 'Service · sim bridge group',
        title: 'RoboCasa bridges',
        tagline: 'Per-component protocol bridges into the RoboCasa sim.',
        desc: `Same idea as the ManiSkill bridges — four services exposing the hardware protocol on top of robocasa_sim. The Agent Server stays oblivious to which sim is running.`,
        sections: [
            { label: 'The 4 bridges', items: ['arm_franka_robocasa_service', 'base_tidybot_robocasa_service', 'gripper_robotiq_robocasa_service', 'camera_realsense_robocasa_service'] },
        ],
    },
    'svc-nav': {
        eyebrow: 'Service · navigation',
        title: 'nav-mapping',
        tagline: 'Build and serve a 2D nav map of the environment.',
        desc: `Maps the floor plan and exposes path queries. Used by base motion to plan around fixed obstacles before short-horizon avoidance kicks in.`,
    },
    'svc-obstacle': {
        eyebrow: 'Service · navigation',
        title: 'local-obstacle-avoidance',
        tagline: 'Short-horizon avoidance for the mobile base.',
        desc: `Reactive avoidance layer on top of nav-mapping. Watches the local depth/lidar for things the static map missed and slows or sidesteps before collision.`,
    },
    'svc-yolo': {
        eyebrow: 'Service · ML',
        title: 'YOLO',
        tagline: 'Object detection.',
        desc: `Off-board GPU service. Skills call it through robot_sdk.find_objects().`,
    },
    'svc-sam2': {
        eyebrow: 'Service · ML',
        title: 'SAM2',
        tagline: 'Segmentation — pixel-precise object masks.',
        desc: `Off-board GPU service for segmentation. Used by manipulation skills that need precise object boundaries.`,
    },
    'svc-graspgen': {
        eyebrow: 'Service · ML',
        title: 'GraspGen',
        tagline: '6-DOF grasp generation from RGB-D.',
        desc: `Generates grasp candidates over an object point cloud. Primary grasp source; hand-computed orientations are the fallback.`,
    },

    // ---------- Flow stages — "How a task runs" ----------
    'flow-define': {
        eyebrow: '[01] Author',
        title: 'Define',
        tagline: 'Hand-curated graph.json — no LLM decomposition.',
        desc: `A task is a directory with a <code>graph.json</code> file: a list of skill nodes (<code>name</code>, <code>description</code>, <code>dependencies</code>) plus a <code>task_env</code> string that names the sim env (e.g. <code>RoboCasa-Pn-P-Counter-To-Sink-v0</code>). Single-stage tasks have one root skill with no deps; multi-stage tasks form a DAG. There's no LLM that auto-splits prompts — you write the graph by hand.`,
        sections: [
            { label: 'Lives in', items: ['skill-agent-setup/claude-code/graphs/<task>/graph.json'] },
            { label: 'Schema', items: ['task_env', 'task_source', 'entries[].name', 'entries[].dependencies'] },
            { label: 'Loaded by', items: ['agent_orchestrator.py · _load_entries() · L813'] },
        ],
    },
    'flow-dispatch': {
        eyebrow: '[02] Plan',
        title: 'Dispatch',
        tagline: 'Orchestrator finds the skills whose dependencies just unblocked.',
        desc: `A standalone asyncio daemon (<code>agent_orchestrator.py</code>) running on ports <strong>8765</strong> (WebSocket) and <strong>8766</strong> (HTTP). On every state change it walks the DAG, finds skills whose dependencies are all <code>done</code>, and queues them for spawning. Spawning is gated by <code>dev_mode</code> — flipped on by <code>POST /xbot-start</code>.`,
        sections: [
            { label: 'Process', items: ['agent_orchestrator.py (separate process)'] },
            { label: 'Ports', items: ['8765 · WebSocket', '8766 · HTTP'] },
            { label: 'Key fns', items: ['_auto_spawn_ready_skills() · L2413', '_is_task_root() · L115'] },
        ],
    },
    'flow-spawn': {
        eyebrow: '[03] Fan-out',
        title: 'Spawn agents',
        tagline: 'One Claude SDK client per (skill × sim target), all in parallel.',
        desc: `For each ready skill the orchestrator creates an <code>AgentState</code> and a <code>ClaudeSDKClient</code> — not a subprocess. When multi-target mode is on, it spawns one agent per sim instance (e.g. agent_server :8080/:8180/:8280, sim :5500/:5600/:5700) so the same skill is developed in parallel across kitchen layouts. The eval agent is a <strong>separate</strong> SDK client that runs after.`,
        sections: [
            { label: 'Mechanism', items: ['Claude Agent SDK (in-process)', 'asyncio Task per agent'] },
            { label: 'Parallelism', items: ['per skill', 'per sim target', 'gated by dependency edges'] },
            { label: 'Key fns', items: ['spawn_agent() · L1359', '_run_agent_sdk() · L1869'] },
        ],
    },
    'flow-execute': {
        eyebrow: '[04] Run',
        title: 'Execute',
        tagline: 'Agent → POST /code/submit → sandbox → sim or hardware.',
        desc: `Each dev agent writes Python that imports <code>robot_sdk</code> and posts it to <code>agent_server</code>'s <code>/code/submit</code> endpoint. The server runs the code in a subprocess sandbox holding a lease, with the safety envelope checking every motion command. Stdout / stderr / video frames stream back to the orchestrator over WebSocket.`,
        sections: [
            { label: 'API path', items: ['POST /code/submit', 'GET /code/jobs/<id>/stream'] },
            { label: 'Sandbox', items: ['subprocess', 'robot_sdk', 'lease + safety envelope'] },
            { label: 'Backed by', items: ['agent_server (L2 in Architecture)'] },
        ],
    },
    'flow-eval': {
        eyebrow: '[05] Ship',
        title: 'Eval & ship',
        tagline: 'Eval agent reviews the recording, marks the skill done, unblocks the next.',
        desc: `After execution finishes, the orchestrator spawns a <strong>separate evaluator agent</strong> (also a ClaudeSDKClient) that loads the camera frames + system_logger trajectory, decides pass/fail, and writes the verdict back to <code>graph.json</code>. On <code>done</code>, downstream skills with this one as a dep become eligible — back to [02] Dispatch. Multi-target verdicts are aggregated into a per-target pass-rate matrix.`,
        sections: [
            { label: 'Run by', items: ['_run_submission_eval() · L1002'] },
            { label: 'Inputs', items: ['camera frames', 'system_logger waypoints', 'agent transcript'] },
            { label: 'Effect', items: ['skill status → done', 're-trigger _auto_spawn_ready_skills()'] },
        ],
    },
};

// Decide which layer color/data-layer applies to a given popup id, so the
// popup picks up the right accent (amber/green/purple/red).
function popupLayerOf(id) {
    if (id === 'intelligence' || id.startsWith('ai-')) return 'intelligence';
    if (id === 'skills' || id.startsWith('skill-')) return 'skills';
    if (id === 'agent-server' || id.startsWith('as-')) return 'agent-server';
    if (id === 'services' || id.startsWith('svc-')) return 'services';
    if (id.startsWith('flow-')) {
        // Match flow stages to the architecture tier they touch:
        // define / dispatch / spawn / eval all live in L1 Intelligence;
        // execute hits L2 Runtime → L3 Substrate.
        if (id === 'flow-define' || id === 'flow-dispatch' ||
            id === 'flow-spawn'  || id === 'flow-eval')      return 'intelligence';
        if (id === 'flow-execute') return 'services';
        return 'default';
    }
    return 'default';
}

// Build a breadcrumb-style route from the eyebrow + title.
// e.g. "Agent Server" + "Code Execution" → "agent_server / code_execution"
function popupRoute(d, layer) {
    const root = {
        'intelligence': 'intelligence',
        'skills': 'skills',
        'agent-server': 'agent_server',
        'services': 'services',
        'default': 'tidybot',
    }[layer] || 'tidybot';
    const slug = (d.title || '').toLowerCase().replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
    return `${root} / ${slug}`;
}

// Cheap Python-ish syntax tinting for code blocks. Just a few patterns —
// not real lexing; keeps styles.css's tk-* spans coloured.
function tintPython(code) {
    const esc = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    let out = esc(code);
    out = out.replace(/(#[^\n]*)/g, '<span class="tk-cmt">$1</span>');
    out = out.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, '<span class="tk-str">$1</span>');
    out = out.replace(/\b(import|from|as|def|return|if|else|for|in|with|try|except|None|True|False|await|async)\b/g,
        '<span class="tk-kw">$1</span>');
    out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tk-num">$1</span>');
    out = out.replace(/\b([a-zA-Z_][a-zA-Z_0-9]*)(?=\()/g, '<span class="tk-fn">$1</span>');
    return out;
}

function renderPipelinePopup(id) {
    const d = PIPELINE_CONTENT[id];
    if (!d) return '';
    const layer = popupLayerOf(id);
    const route = popupRoute(d, layer);

    // Status badge (shipped / indev / planned)
    const statusBadge = d.status ? (() => {
        const label = { shipped: 'Shipped', indev: 'In Dev', planned: 'Planned' }[d.status] || d.status;
        return `<span class="ppl-popup-status ${d.status}">${label}</span>`;
    })() : '';

    // Flow diagram: upstream → THIS → downstream
    const flow = d.flow ? `
        <div class="ppl-popup-flow">
            <div class="ppl-popup-flow-side" data-side="up">
                <span class="ppl-popup-flow-label">Called by</span>
                ${(d.flow.upstream || []).map(i => `<span>${i}</span>`).join('')}
            </div>
            <div class="ppl-popup-flow-center">${d.title}</div>
            <div class="ppl-popup-flow-side" data-side="down">
                <span class="ppl-popup-flow-label">Calls / drives</span>
                ${(d.flow.downstream || []).map(i => `<span>${i}</span>`).join('')}
            </div>
            <span class="ppl-popup-flow-arrow left"></span>
            <span class="ppl-popup-flow-arrow right"></span>
        </div>
    ` : '';

    // Code block (assume Python for now)
    const code = d.code ? `
        <div class="ppl-popup-code">
            <div class="ppl-popup-code-header">${d.code.label || 'example.py'}</div>
            <pre>${tintPython(d.code.text)}</pre>
        </div>
    ` : '';

    const sections = (d.sections || []).map((s, i) => {
        const num = String(i + 1).padStart(2, '0');
        return `
            <div class="ppl-popup-section">
                <div class="ppl-popup-section-label">
                    <span class="num">[${num}]</span>${s.label}
                </div>
                <div class="ppl-popup-list">${s.items.map(it => `<span>${it}</span>`).join('')}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="pipeline-popup-body" data-layer="${layer}">
            <div class="ppl-popup-meta">
                <span class="ppl-popup-eyebrow">${d.eyebrow || ''}</span>
                <span class="ppl-popup-route">${route}</span>
                ${statusBadge}
            </div>
            <h2 class="ppl-popup-title">${d.title}</h2>
            <p class="ppl-popup-tagline">${d.tagline || ''}</p>
            <div class="ppl-popup-desc">${d.desc || ''}</div>
            ${flow}
            ${code}
            ${sections ? `<div class="ppl-popup-sections">${sections}</div>` : ''}
        </div>
    `;
}

function openPipelinePopup(id) {
    const inner = document.getElementById('popup-inner');
    const overlay = document.getElementById('popup-overlay');
    if (!inner || !overlay) return;
    inner.innerHTML = renderPipelinePopup(id);
    overlay.classList.add('open');
}

// Chip → (gallery name, repo title in JSON) for chips that should jump to a
// hex below instead of opening a popup. Chips without an entry here fall
// through to popup (e.g. meta chips like the sim "bridges" groups).
const CHIP_TO_GALLERY_REPO = {
    // L3 services
    'svc-arm':           ['services', 'arm_franka_service'],
    'svc-base':          ['services', 'base_tidybot_service'],
    'svc-gripper':       ['services', 'gripper_robotiq_service'],
    'svc-camera':        ['services', 'camera_realsense_service'],
    'svc-maniskill-sim': ['services', 'maniskill_sim'],
    'svc-robocasa-sim':  ['services', 'robocasa_sim'],
    'svc-yolo':          ['services', 'yolo-service'],
    'svc-sam2':          ['services', 'grounded-sam2-service'],
    'svc-graspgen':      ['services', 'graspgen-service'],
    'svc-nav':           ['services', 'nav-mapping-service'],
    'svc-obstacle':      ['services', 'local-obstacle-avoidance-service'],
    // L1 skills (live in logs/repos.json → 'skills' gallery)
    'skill-look-forward':       ['skills', 'look-forward'],
    'skill-count-people':       ['skills', 'count-people-in-room'],
    'skill-pick-up':            ['skills', 'pick-up-object'],
    'skill-center-object':      ['skills', 'center-object'],
    'skill-place-object':       ['skills', 'place-object'],
    'skill-find-and-pick-up':   ['skills', 'find-and-pick-up'],
    'skill-pick-and-place':     ['skills', 'pick-and-place'],
    'skill-visuomotor':         ['skills', 'visuomotor-keypoint-joint-policy'],
};

function flashHighlight(card) {
    if (!card) return;
    setTimeout(() => {
        card.classList.add('pipeline-highlight');
        setTimeout(() => card.classList.remove('pipeline-highlight'), 2400);
    }, 600);
}

function scrollToGalleryHex(galleryName, repoName) {
    // 1) Prefer the currently-visible tree-hex-card (Skills gallery uses this
    //    by default; the timeline .hex-cards are display:none / 0x0).
    const treeCard = document.querySelector(
        `.tree-hex-card[data-title="${CSS.escape(repoName)}"]`
    );
    if (treeCard && treeCard.offsetWidth > 0) {
        treeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flashHighlight(treeCard);
        return true;
    }

    // 2) Fall back to the timeline gallery (Services uses this).
    const tb = window.TidyBotTimeline;
    const g = tb && typeof tb.getGallery === 'function' ? tb.getGallery(galleryName) : null;
    if (!g || !g.entries || !g.hexLayout) return false;

    const idx = g.entries.findIndex(e => (e.title || '').toLowerCase() === repoName.toLowerCase());
    if (idx < 0) return false;

    const section = document.querySelector(`[data-gallery="${galleryName}"]`);
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const hex = g.hexLayout[idx];
    if (hex && g.viewport) {
        const max = g.scrollMax || 0;
        const target = Math.min(Math.max(0, hex.x - g.viewport.offsetWidth / 2), max);
        g.scrollTarget = target;
    }

    const card = g.track && g.track.querySelector(`.hex-card[data-index="${idx}"]`);
    flashHighlight(card);
    return true;
}

document.addEventListener('DOMContentLoaded', () => {
    const stack = document.getElementById('pipeline-stack');
    if (stack) {
        stack.addEventListener('click', (e) => {
            const layer = e.target.closest('.pipeline-layer-title');
            if (layer) {
                openPipelinePopup(layer.dataset.layerId);
                return;
            }
            const comp = e.target.closest('.pipeline-comp');
            if (!comp || comp.classList.contains('more')) return;

            const id = comp.dataset.compId;
            const target = CHIP_TO_GALLERY_REPO[id];
            if (target) {
                const ok = scrollToGalleryHex(target[0], target[1]);
                if (ok) return;
            }
            openPipelinePopup(id);
        });
    }

    // Flow stages — click any stage to open its popup
    const flow = document.getElementById('flow-stages');
    if (flow) {
        flow.addEventListener('click', (e) => {
            const stage = e.target.closest('.flow-stage');
            if (!stage) return;
            openPipelinePopup('flow-' + stage.dataset.flowId);
        });
    }
});
