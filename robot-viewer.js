import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';

/* ============================================
   ROBOT DEFINITIONS
   ============================================ */

const ROBOTS = {
    tidybot: {
        format: 'urdf',
        file: 'assets/robots/tidybot/tidyverse.urdf',
        meshDir: 'assets/robots/tidybot/',
        initAngles: {
            panda_joint1: 0.0,
            panda_joint2: -0.785,
            panda_joint3: 0.0,
            panda_joint4: -2.0,
            panda_joint5: 0.0,
            panda_joint6: 1.571,
            panda_joint7: 0.785,
        },
    },
    xlerobot: {
        format: 'urdf',
        file: 'assets/robots/xlerobot/xlerobot.urdf',
        meshDir: 'assets/robots/xlerobot/',
        initAngles: {},
    },
    gr1: {
        format: 'urdf',
        file: 'assets/robots/gr1/basic_urdf/gr1t2_dummy_hand.urdf',
        meshDir: 'assets/robots/gr1/basic_urdf/',
        initAngles: {},
    },
};

/* ============================================
   SHARED HELPERS
   ============================================ */

const stlLoader = new STLLoader();
const colladaLoader = new ColladaLoader();

function parseRPY(rpy) {
    // URDF rpy = extrinsic XYZ = Three.js intrinsic ZYX
    return new THREE.Quaternion().setFromEuler(
        new THREE.Euler(parseFloat(rpy[0]), parseFloat(rpy[1]), parseFloat(rpy[2]), 'ZYX')
    );
}

function parseMjcfQuat(w, x, y, z) {
    // MuJoCo: (w, x, y, z) → Three.js: (x, y, z, w)
    return new THREE.Quaternion(
        parseFloat(x), parseFloat(y), parseFloat(z), parseFloat(w)
    );
}

function loadSTL(path, color) {
    return new Promise((resolve) => {
        stlLoader.load(path, (geometry) => {
            geometry.computeVertexNormals();
            const material = new THREE.MeshStandardMaterial({
                color, metalness: 0.45, roughness: 0.45,
            });
            resolve(new THREE.Mesh(geometry, material));
        }, undefined, () => resolve(null));
    });
}

function loadDAE(path) {
    return new Promise((resolve) => {
        colladaLoader.load(path, (result) => {
            const daeScene = result.scene;
            // Undo ColladaLoader's Z_UP→Y_UP auto-rotation
            daeScene.rotation.set(0, 0, 0);
            daeScene.updateMatrix();
            resolve(daeScene);
        }, undefined, () => resolve(null));
    });
}

/* ============================================
   URDF PARSER
   ============================================ */

async function loadURDF(robotDef) {
    const resp = await fetch(robotDef.file);
    const text = await resp.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');

    // Collect visual meshes (supports multiple <visual> per link)
    const linkMeshes = {}; // name → array of { filename, vPos, vRPY }
    for (const link of xml.querySelectorAll('link')) {
        const name = link.getAttribute('name');
        const visuals = link.querySelectorAll('visual');
        if (!visuals.length) continue;
        const meshList = [];
        for (const visual of visuals) {
            const meshEl = visual.querySelector('geometry mesh');
            if (!meshEl) continue;
            const filename = meshEl.getAttribute('filename');
            if (!filename) continue;
            const scaleStr = meshEl.getAttribute('scale');
            const scale = scaleStr ? scaleStr.split(/\s+/).map(Number) : null;
            const originEl = visual.querySelector('origin');
            let vPos = [0, 0, 0], vRPY = [0, 0, 0];
            if (originEl) {
                const xyz = originEl.getAttribute('xyz');
                const rpy = originEl.getAttribute('rpy');
                if (xyz) vPos = xyz.split(/\s+/).map(Number);
                if (rpy) vRPY = rpy.split(/\s+/).map(Number);
            }
            meshList.push({ filename, vPos, vRPY, scale });
        }
        if (meshList.length) linkMeshes[name] = meshList;
    }

    // Collect joints
    const robotEl = xml.querySelector('robot');
    const joints = [];
    for (const joint of robotEl.querySelectorAll(':scope > joint')) {
        const parentEl = joint.querySelector('parent');
        const childEl = joint.querySelector('child');
        if (!parentEl || !childEl) continue;
        const name = joint.getAttribute('name');
        const type = joint.getAttribute('type');
        const parentName = parentEl.getAttribute('link');
        const childName = childEl.getAttribute('link');
        const originEl = joint.querySelector('origin');
        let pos = [0, 0, 0], rpy = [0, 0, 0];
        if (originEl) {
            const xyz = originEl.getAttribute('xyz');
            const rpyStr = originEl.getAttribute('rpy');
            if (xyz) pos = xyz.split(/\s+/).map(Number);
            if (rpyStr) rpy = rpyStr.split(/\s+/).map(Number);
        }
        const axisEl = joint.querySelector('axis');
        let axis = [0, 0, 1];
        if (axisEl) {
            const axisStr = axisEl.getAttribute('xyz');
            if (axisStr) axis = axisStr.split(/\s+/).map(Number);
        }
        joints.push({ name, type, parentName, childName, pos, rpy, axis });
    }

    // Build scene graph
    const linkNodes = {};
    const allLinkNames = new Set();
    const childLinks = new Set();
    for (const j of joints) {
        allLinkNames.add(j.parentName);
        allLinkNames.add(j.childName);
        childLinks.add(j.childName);
    }
    for (const name of allLinkNames) {
        linkNodes[name] = new THREE.Group();
        linkNodes[name].name = name;
    }

    const initAngles = robotDef.initAngles || {};
    for (const j of joints) {
        const parent = linkNodes[j.parentName];
        const child = linkNodes[j.childName];
        if (!parent || !child) continue;

        const jointGroup = new THREE.Group();
        jointGroup.name = 'joint_' + j.name;
        jointGroup.position.set(j.pos[0], j.pos[1], j.pos[2]);
        jointGroup.quaternion.copy(parseRPY(j.rpy));

        const angle = initAngles[j.name] || 0;
        if (angle !== 0 && (j.type === 'revolute' || j.type === 'continuous')) {
            const axisVec = new THREE.Vector3(j.axis[0], j.axis[1], j.axis[2]).normalize();
            child.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(axisVec, angle));
        }

        jointGroup.add(child);
        parent.add(jointGroup);
    }

    const rootGroup = new THREE.Group();
    for (const name of allLinkNames) {
        if (!childLinks.has(name)) rootGroup.add(linkNodes[name]);
    }

    // Load meshes (each link can have multiple visual meshes)
    const meshPromises = [];
    for (const [linkName, meshList] of Object.entries(linkMeshes)) {
        const node = linkNodes[linkName];
        if (!node) continue;
        for (const info of meshList) {
            const path = robotDef.meshDir + info.filename;
            const ext = info.filename.split('.').pop().toLowerCase();

            const promise = (ext === 'dae' ? loadDAE(path) : loadSTL(path, linkName.includes('robotiq') ? 0x2a2a2a : 0xc0c0c0))
                .then((meshObj) => {
                    if (!meshObj) return;
                    meshObj.position.set(info.vPos[0], info.vPos[1], info.vPos[2]);
                    if (info.vRPY[0] || info.vRPY[1] || info.vRPY[2]) {
                        meshObj.quaternion.copy(parseRPY(info.vRPY));
                    }
                    if (info.scale) {
                        meshObj.scale.set(info.scale[0], info.scale[1], info.scale[2]);
                    }
                    node.add(meshObj);
                });
            meshPromises.push(promise);
        }
    }

    await Promise.all(meshPromises);
    return rootGroup;
}

/* ============================================
   MJCF PARSER
   Parses MuJoCo XML and builds Three.js scene
   graph from nested <body> hierarchy.
   ============================================ */

async function loadMJCF(robotDef) {
    const resp = await fetch(robotDef.file);
    const text = await resp.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');

    // 1. Build mesh asset map: name → { file, scale }
    const meshAssets = {};
    for (const meshEl of xml.querySelectorAll('asset > mesh')) {
        const name = meshEl.getAttribute('name');
        const file = meshEl.getAttribute('file');
        const scaleStr = meshEl.getAttribute('scale');
        const scale = scaleStr ? scaleStr.split(/\s+/).map(Number) : [1, 1, 1];
        meshAssets[name] = { file, scale };
    }

    // 2. Recursively build scene graph from <body> elements
    const meshPromises = [];

    function parseBody(bodyEl) {
        const group = new THREE.Group();
        group.name = bodyEl.getAttribute('name') || '';

        // Position
        const posStr = bodyEl.getAttribute('pos');
        if (posStr) {
            const p = posStr.split(/\s+/).map(Number);
            group.position.set(p[0], p[1], p[2]);
        }

        // Orientation: quat takes priority, then euler
        const quatStr = bodyEl.getAttribute('quat');
        const eulerStr = bodyEl.getAttribute('euler');
        if (quatStr) {
            const q = quatStr.split(/\s+/).map(Number);
            group.quaternion.copy(parseMjcfQuat(q[0], q[1], q[2], q[3]));
        } else if (eulerStr) {
            const e = eulerStr.split(/\s+/).map(Number);
            // MuJoCo default: euler = extrinsic XYZ (same as URDF RPY)
            group.quaternion.copy(parseRPY(e));
        }

        // Load mesh geoms (skip collision-only geoms)
        for (const geomEl of bodyEl.querySelectorAll(':scope > geom')) {
            const geomType = geomEl.getAttribute('type');
            const meshName = geomEl.getAttribute('mesh');
            if (geomType !== 'mesh' || !meshName) continue;

            const asset = meshAssets[meshName];
            if (!asset) {
                console.warn('[MJCF] No asset for mesh:', meshName);
                continue;
            }

            // Skip collision group geoms (group="3")
            const geomGroup = geomEl.getAttribute('group');
            if (geomGroup === '3') continue;

            console.log('[MJCF] Loading geom:', meshName, 'file:', asset.file, 'scale:', asset.scale, 'in body:', group.name);

            // Parse color — boost very dark parts so they're visible against dark bg
            const rgbaStr = geomEl.getAttribute('rgba');
            let color = 0x808080;
            if (rgbaStr) {
                const rgba = rgbaStr.split(/\s+/).map(Number);
                const c = new THREE.Color(rgba[0], rgba[1], rgba[2]);
                // Brighten near-black parts for visibility
                if (c.r < 0.15 && c.g < 0.15 && c.b < 0.15) {
                    c.setRGB(0.35, 0.35, 0.38);
                }
                color = c.getHex();
            }

            // Geom pos/quat offset
            const geomPos = geomEl.getAttribute('pos');
            const geomQuat = geomEl.getAttribute('quat');

            const promise = loadSTL(robotDef.meshDir + asset.file, color).then((mesh) => {
                if (!mesh) return;
                // Apply mesh asset scale
                mesh.scale.set(asset.scale[0], asset.scale[1], asset.scale[2]);
                // Apply geom-level offset
                if (geomPos) {
                    const p = geomPos.split(/\s+/).map(Number);
                    mesh.position.set(p[0], p[1], p[2]);
                }
                if (geomQuat) {
                    const q = geomQuat.split(/\s+/).map(Number);
                    mesh.quaternion.copy(parseMjcfQuat(q[0], q[1], q[2], q[3]));
                }
                group.add(mesh);
            });
            meshPromises.push(promise);
        }

        // Recurse into child bodies
        for (const childBody of bodyEl.querySelectorAll(':scope > body')) {
            group.add(parseBody(childBody));
        }

        return group;
    }

    // Start from worldbody's direct child bodies
    const worldbody = xml.querySelector('worldbody');
    const rootGroup = new THREE.Group();
    for (const bodyEl of worldbody.querySelectorAll(':scope > body')) {
        rootGroup.add(parseBody(bodyEl));
    }

    console.log('[MJCF] Loading', meshPromises.length, 'mesh geoms');
    await Promise.all(meshPromises);
    let meshCount = 0;
    rootGroup.traverse((c) => { if (c.isMesh) meshCount++; });
    console.log('[MJCF] Loaded', meshCount, 'meshes');
    return rootGroup;
}

/* ============================================
   VIEWER CLASS
   ============================================ */

class RobotViewer {
    constructor(canvas, robotKey) {
        this.canvas = canvas;
        this.robotKey = robotKey;
        this.wireframe = false;
        this.disposed = false;
        this.robot = null;

        this._initScene();
        this._initLights();
        this._initControls();

        const robotDef = ROBOTS[robotKey];
        if (robotDef) {
            this._loadRobot(robotDef);
        }

        this._onResize = this._handleResize.bind(this);
        window.addEventListener('resize', this._onResize);
        this._handleResize();
        this._animate();
    }

    _initScene() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas, antialias: true, alpha: true,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(rect.width, rect.height);
        this.renderer.setClearColor(0x161620, 1);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(40, rect.width / rect.height, 0.01, 100);
        this.camera.position.set(1.2, 0.8, 1.2);
        this.camera.lookAt(0, 0.25, 0);
    }

    _initLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
        dir1.position.set(3, 5, 4);
        this.scene.add(dir1);
        const dir2 = new THREE.DirectionalLight(0x8888ff, 0.3);
        dir2.position.set(-3, 2, -2);
        this.scene.add(dir2);
        const rim = new THREE.PointLight(0x39ff14, 0.15, 8);
        rim.position.set(-2, 1, 0);
        this.scene.add(rim);
    }

    _initControls() {
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableZoom = false;
        this.controls.enablePan = false;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.rotateSpeed = 0.8;
        this.controls.target.set(0, 0.25, 0);
        this.controls.update();
    }

    async _loadRobot(robotDef) {
        try {
            const robot = robotDef.format === 'mjcf'
                ? await loadMJCF(robotDef)
                : await loadURDF(robotDef);

            this.robot = robot;

            // Both URDF and MJCF are Z-up → rotate to Three.js Y-up
            robot.rotation.set(-Math.PI / 2, 0, 0);

            this.scene.add(robot);

            const grid = new THREE.GridHelper(2, 20, 0x2a2a3a, 0x1e1e2e);
            grid.position.y = -0.01;
            this.scene.add(grid);
            this.grid = grid;

            this._centerModel();
        } catch (err) {
            console.error('Failed to load robot:', err);
        }
    }

    _centerModel() {
        if (!this.robot) return;
        const box = new THREE.Box3().setFromObject(this.robot);
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        this.robot.position.x -= center.x;
        this.robot.position.z -= center.z;
        this.robot.position.y -= box.min.y;

        const targetY = size.y / 2;
        this.controls.target.set(0, targetY, 0);
        this.controls.update();

        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = maxDim * 1.8;
        this.camera.position.set(dist * 0.8, dist * 0.5, dist * 0.8);
        this.camera.lookAt(0, targetY, 0);
    }

    toggleWireframe() {
        this.wireframe = !this.wireframe;
        if (this.robot) {
            this.robot.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach((m) => { m.wireframe = this.wireframe; });
                }
            });
        }
        if (this.grid) this.grid.visible = !this.wireframe;
        return this.wireframe;
    }

    _handleResize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        this.renderer.setSize(rect.width, rect.height);
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
    }

    _animate() {
        if (this.disposed) return;
        requestAnimationFrame(() => this._animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        this.disposed = true;
        window.removeEventListener('resize', this._onResize);
        this.controls.dispose();
        if (this.robot) {
            this.robot.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach((m) => m.dispose());
                }
            });
        }
        this.renderer.dispose();
    }
}

/* ============================================
   INIT
   ============================================ */

function init() {
    document.querySelectorAll('.robot-card').forEach((card) => {
        const robotKey = card.dataset.robot;
        const canvas = card.querySelector('.robot-canvas');
        if (!canvas || card.classList.contains('coming-soon')) return;

        new RobotViewer(canvas, robotKey);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
