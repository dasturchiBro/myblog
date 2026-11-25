import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type {
  AnimalRecord,
  ForestTreeItem,
  LanguageCode,
  SeasonMode,
  TimeOfDay,
  VisitorContributionRecord,
} from '../types';
import { buildAnimalInstance, type BuiltAnimalInstance } from './animals';
import { createAtmosphereRig } from './atmosphere';
import {
  buildContributionInstance,
  type BuiltContributionInstance,
} from './contributions';
import { groundHeightAt } from './placement';
import { createTerrainAndEnvironment, WOODEN_HOUSE_POS } from './terrain';
import { createProceduralTextures } from './textures';
import { buildTreeInstance, type BuiltTreeInstance } from './treeBuilder';

export interface ForestControlApi {
  move: (forward: number, strafe: number) => void;
  setHoldMove: (forward: number, strafe: number) => void;
  focusWoodenHouse: () => void;
  resetCamera: () => void;
}

interface ForestCanvasProps {
  trees: ForestTreeItem[];
  animals: AnimalRecord[];
  contributions?: VisitorContributionRecord[];
  lang: LanguageCode;
  selectedPostId: number | null;
  selectedContributionId?: number | null;
  highlightCategorySlug: string | null;
  season: SeasonMode;
  timeOfDay: TimeOfDay;
  reducedEffects: boolean;
  showTreeTitles: boolean;
  grassCount?: number;
  stoneCount?: number;
  introAnimation: boolean;
  resetSignal: number;
  hoverPromptLabel: string;
  houseHoverTitle: string;
  houseHoverPrompt: string;
  statueHoverTitle: string;
  contributionStoneLabel?: string;
  animalLabels?: Record<'rabbit' | 'bird' | 'bear' | 'wolf', string>;
  controlApiRef?: MutableRefObject<ForestControlApi | null>;
  onSelectTree: (postId: number | null) => void;
  onSelectContribution?: (id: number | null) => void;
  onOpenWoodenHouse: () => void;
  onWebGLFailure: () => void;
}

const DEFAULT_CAM_POS = new THREE.Vector3(0, 9.2, 22);
const DEFAULT_CAM_TARGET = new THREE.Vector3(0, 2.2, -1);

// Scratch math objects outside loops (zero GC pressure)
const _projVec = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

type HoverTarget =
  | { kind: 'tree'; postId: number; x: number; y: number }
  | { kind: 'contribution'; contributionId: number; x: number; y: number }
  | { kind: 'house'; x: number; y: number }
  | { kind: 'statue'; x: number; y: number };

export function ForestCanvas({
  trees,
  animals,
  contributions = [],
  lang,
  selectedPostId,
  selectedContributionId = null,
  highlightCategorySlug,
  season,
  timeOfDay,
  reducedEffects,
  showTreeTitles,
  grassCount = 450,
  stoneCount = 18,
  introAnimation,
  resetSignal,
  hoverPromptLabel,
  houseHoverTitle,
  houseHoverPrompt,
  statueHoverTitle,
  contributionStoneLabel = 'Visitor Stone',
  animalLabels,
  controlApiRef,
  onSelectTree,
  onSelectContribution,
  onOpenWoodenHouse,
  onWebGLFailure,
}: ForestCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const titleElMapRef = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [hoverInfo, setHoverInfo] = useState<HoverTarget | null>(null);

  // Refs so React prop updates never re-create the WebGLRenderer
  const callbacksRef = useRef({
    onSelectTree,
    onSelectContribution,
    onOpenWoodenHouse,
    onWebGLFailure,
  });
  callbacksRef.current = {
    onSelectTree,
    onSelectContribution,
    onOpenWoodenHouse,
    onWebGLFailure,
  };

  const stateRef = useRef({
    trees,
    animals,
    contributions,
    lang,
    selectedPostId,
    selectedContributionId,
    highlightCategorySlug,
    season,
    timeOfDay,
    reducedEffects,
    showTreeTitles,
    grassCount,
    stoneCount,
    introAnimation,
  });
  stateRef.current = {
    trees,
    animals,
    contributions,
    lang,
    selectedPostId,
    selectedContributionId,
    highlightCategorySlug,
    season,
    timeOfDay,
    reducedEffects,
    showTreeTitles,
    grassCount,
    stoneCount,
    introAnimation,
  };

  const sceneApiRef = useRef<{
    syncTrees: (nextTrees: ForestTreeItem[]) => void;
    syncAnimals: (nextAnimals: AnimalRecord[]) => void;
    syncContributions: (nextContributions: VisitorContributionRecord[]) => void;
    syncVisualState: () => void;
    flyToTree: (postId: number) => void;
    flyToContribution: (contributionId: number) => void;
    focusWoodenHouse: () => void;
    moveCamera: (forward: number, strafe: number) => void;
    setHoldMove: (forward: number, strafe: number) => void;
    resetCamera: () => void;
    requestRender: () => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: isSoftwareGl,
      });
    } catch {
      callbacksRef.current.onWebGLFailure();
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('data-testid', 'forest-webgl-canvas');
    container.appendChild(canvas);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      callbacksRef.current.onWebGLFailure();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      48,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.3,
      280,
    );
    camera.position.copy(DEFAULT_CAM_POS);

    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(DEFAULT_CAM_TARGET);
    controls.enableDamping = !isSoftwareGl && !stateRef.current.reducedEffects;
    controls.dampingFactor = 0.06;
    controls.minPolarAngle = 0.16;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minDistance = 4.5;
    controls.maxDistance = 66;
    controls.enablePan = true;
    controls.panSpeed = 0.75;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.9;
    controls.update();

    const maxAniso = isSoftwareGl ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const textures = createProceduralTextures(maxAniso);
    const atmosphere = createAtmosphereRig(scene, renderer, textures.particleDot, isSoftwareGl);
    const terrain = createTerrainAndEnvironment(textures, isSoftwareGl);
    scene.add(terrain.group);

    const treesGroup = new THREE.Group();
    scene.add(treesGroup);

    const animalsGroup = new THREE.Group();
    scene.add(animalsGroup);

    const contributionsGroup = new THREE.Group();
    scene.add(contributionsGroup);

    const treeMap = new Map<number, BuiltTreeInstance>();
    const animalMap = new Map<number, BuiltAnimalInstance>();
    const contributionMap = new Map<number, BuiltContributionInstance>();
    let colliderList: THREE.Object3D[] = [terrain.houseCollider, terrain.statueCollider];

    function rebuildColliderList() {
      colliderList = [
        ...Array.from(treeMap.values()).map((b) => b.colliderMesh),
        ...Array.from(contributionMap.values()).map((c) => c.colliderMesh),
        terrain.houseCollider,
        terrain.statueCollider,
      ];
    }

    // Camera fly-to + smooth movement state
    let flyActive = false;
    const flyGoalPos = new THREE.Vector3();
    const flyGoalTarget = new THREE.Vector3();
    let holdBtnFwd = 0;
    let holdBtnStrafe = 0;
    let glideFwd = 0;
    let glideStrafe = 0;
    let velFwd = 0;
    let velStrafe = 0;
    const heldKeys = new Set<string>();

    // Intro animation state (plays once on first load if enabled & GPU)
    let introDone = isSoftwareGl || !stateRef.current.introAnimation;
    let introElapsed = 0;
    const INTRO_DURATION = 1.4;

    controls.addEventListener('start', () => {
      flyActive = false;
    });

    // Software-WebGL safe scheduling & render-on-demand
    let frameId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function updateFloatingTitles() {
      if (!stateRef.current.showTreeTitles) {
        titleElMapRef.current.forEach((el) => {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        });
        return;
      }

      const w = container?.clientWidth || window.innerWidth;
      const h = container?.clientHeight || window.innerHeight;

      treeMap.forEach((built, postId) => {
        const el = titleElMapRef.current.get(postId);
        if (!el) return;

        const dist = camera.position.distanceTo(built.baseWorldPos);
        if (dist > 58) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          return;
        }

        _projVec.set(
          built.baseWorldPos.x,
          built.baseWorldPos.y + built.canopyTopY + 0.75,
          built.baseWorldPos.z,
        );
        _projVec.project(camera);

        if (_projVec.z >= 1 || _projVec.z < -1) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          return;
        }

        const sx = ((_projVec.x + 1) / 2) * w;
        const sy = ((-_projVec.y + 1) / 2) * h;

        if (sx < 40 || sx > w - 40 || sy < 68 || sy > h - 90) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          return;
        }

        el.style.transform = `translate3d(${Math.round(sx)}px, ${Math.round(sy)}px, 0) translate(-50%, -100%)`;
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
      });
    }

    function applyCameraDisplacement(forwardAmount: number, strafeAmount: number) {
      if (Math.abs(forwardAmount) < 1e-5 && Math.abs(strafeAmount) < 1e-5) return;
      _fwd.subVectors(controls.target, camera.position);
      _fwd.y = 0;
      if (_fwd.lengthSq() < 0.001) _fwd.set(0, 0, -1);
      _fwd.normalize();
      _right.set(-_fwd.z, 0, _fwd.x);

      const dx = _fwd.x * forwardAmount + _right.x * strafeAmount;
      const dz = _fwd.z * forwardAmount + _right.z * strafeAmount;

      const nextTargetX = controls.target.x + dx;
      const nextTargetZ = controls.target.z + dz;
      const distFromOrigin = Math.hypot(nextTargetX, nextTargetZ);
      if (distFromOrigin > 46) {
        const scale = 46 / distFromOrigin;
        const clampedDx = nextTargetX * scale - controls.target.x;
        const clampedDz = nextTargetZ * scale - controls.target.z;
        camera.position.x += clampedDx;
        camera.position.z += clampedDz;
        controls.target.x += clampedDx;
        controls.target.z += clampedDz;
      } else {
        const oldGround = groundHeightAt(controls.target.x, controls.target.z);
        const newGround = groundHeightAt(nextTargetX, nextTargetZ);
        const dy = newGround - oldGround;
        camera.position.x += dx;
        camera.position.z += dz;
        camera.position.y += dy;
        controls.target.x = nextTargetX;
        controls.target.z = nextTargetZ;
        controls.target.y += dy;
      }
    }

    function isMoveActive(): boolean {
      return (
        holdBtnFwd !== 0 ||
        holdBtnStrafe !== 0 ||
        Math.abs(glideFwd) > 0.015 ||
        Math.abs(glideStrafe) > 0.015 ||
        Math.abs(velFwd) > 0.02 ||
        Math.abs(velStrafe) > 0.02 ||
        heldKeys.size > 0
      );
    }

    function stepScene(dt: number, elapsed: number) {
      if (!introDone) {
        introElapsed += dt;
        const p = Math.min(1, introElapsed / INTRO_DURATION);
        treeMap.forEach((inst) => inst.setIntroProgress(p));
        if (p >= 1) introDone = true;
      }

      // Continuous smooth hold velocity + exponential tap glide
      let inputFwd = holdBtnFwd;
      let inputStrafe = holdBtnStrafe;
      if (heldKeys.has('KeyW') || heldKeys.has('ArrowUp')) inputFwd += 1;
      if (heldKeys.has('KeyS') || heldKeys.has('ArrowDown')) inputFwd -= 1;
      if (heldKeys.has('KeyD') || heldKeys.has('ArrowRight')) inputStrafe += 1;
      if (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft')) inputStrafe -= 1;

      const inputLen = Math.hypot(inputFwd, inputStrafe);
      if (inputLen > 1) {
        inputFwd /= inputLen;
        inputStrafe /= inputLen;
      }

      const walkSpeed = 12.5;
      const safeDt = Math.min(0.05, Math.max(0.001, dt));
      const accelBlend = 1 - Math.exp(-10 * safeDt);
      velFwd += (inputFwd * walkSpeed - velFwd) * accelBlend;
      velStrafe += (inputStrafe * walkSpeed - velStrafe) * accelBlend;

      const glideBlend = 1 - Math.exp(-9.5 * safeDt);
      const stepGlideFwd = glideFwd * glideBlend;
      const stepGlideStrafe = glideStrafe * glideBlend;
      glideFwd -= stepGlideFwd;
      glideStrafe -= stepGlideStrafe;

      if (Math.abs(glideFwd) < 0.008) glideFwd = 0;
      if (Math.abs(glideStrafe) < 0.008) glideStrafe = 0;
      if (Math.abs(velFwd) < 0.01) velFwd = 0;
      if (Math.abs(velStrafe) < 0.01) velStrafe = 0;

      const totalFwd = velFwd * safeDt + stepGlideFwd;
      const totalStrafe = velStrafe * safeDt + stepGlideStrafe;
      if (Math.abs(totalFwd) > 1e-4 || Math.abs(totalStrafe) > 1e-4) {
        applyCameraDisplacement(totalFwd, totalStrafe);
      }

      if (flyActive) {
        if (isSoftwareGl || stateRef.current.reducedEffects) {
          camera.position.copy(flyGoalPos);
          controls.target.copy(flyGoalTarget);
          flyActive = false;
        } else {
          const factor = 1 - Math.exp(-5.2 * dt);
          camera.position.lerp(flyGoalPos, factor);
          controls.target.lerp(flyGoalTarget, factor);
          if (
            camera.position.distanceTo(flyGoalPos) < 0.08 &&
            controls.target.distanceTo(flyGoalTarget) < 0.05
          ) {
            flyActive = false;
          }
        }
      }

      // Keep camera safely above undulating terrain
      const camGround = groundHeightAt(camera.position.x, camera.position.z);
      if (camera.position.y < camGround + 1.8) {
        camera.position.y = camGround + 1.8;
      }

      controls.update();

      if (!isSoftwareGl && !stateRef.current.reducedEffects) {
        terrain.updateWind(elapsed);
        atmosphere.updateParticles(
          dt,
          elapsed,
          stateRef.current.season,
          stateRef.current.timeOfDay,
        );
        treeMap.forEach((inst) => inst.applyWind(elapsed));
        animalMap.forEach((inst) => inst.update(elapsed));
        contributionMap.forEach((inst) => inst.update(elapsed));
      }
    }

    function renderFrame(dt: number, elapsed: number) {
      stepScene(dt, elapsed);
      renderer.render(scene, camera);
      updateFloatingTitles();
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min(0.05, clock.getDelta() || 0.016);
        const elapsed = clock.elapsedTime;
        renderFrame(dt, elapsed);

        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || flyActive || isMoveActive())) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    function syncTrees(nextTrees: ForestTreeItem[]) {
      const nextIds = new Set(nextTrees.map((t) => t.post_id));

      for (const [id, built] of treeMap.entries()) {
        if (!nextIds.has(id)) {
          treesGroup.remove(built.rootGroup);
          built.dispose();
          treeMap.delete(id);
        }
      }

      for (const item of nextTrees) {
        const existing = treeMap.get(item.post_id);
        const needsBuild =
          !existing ||
          existing.species !== item.tree.species ||
          Math.abs(existing.baseWorldPos.x - item.tree.position_x) > 0.01 ||
          Math.abs(existing.baseWorldPos.z - item.tree.position_z) > 0.01;

        if (needsBuild) {
          if (existing) {
            treesGroup.remove(existing.rootGroup);
            existing.dispose();
          }
          const built = buildTreeInstance(item, textures, isSoftwareGl);
          built.setSeason(stateRef.current.season);
          if (!introDone) built.setIntroProgress(0.04);
          treesGroup.add(built.rootGroup);
          treeMap.set(item.post_id, built);
        }
      }

      terrain.syncTreePaths(
        nextTrees.map((tr) => ({
          post_id: tr.post_id,
          position_x: tr.tree.position_x,
          position_z: tr.tree.position_z,
        })),
      );

      rebuildColliderList();
      syncVisualState();
      if (nextTrees.length > 0 && !renderBusy) {
        renderFrame(0, clock.elapsedTime);
      } else {
        requestRender();
      }
    }

    function syncAnimals(nextAnimals: AnimalRecord[]) {
      const nextIds = new Set(nextAnimals.map((a) => a.id));

      for (const [id, built] of animalMap.entries()) {
        if (!nextIds.has(id)) {
          animalsGroup.remove(built.rootGroup);
          built.dispose();
          animalMap.delete(id);
        }
      }

      for (const animal of nextAnimals) {
        const existing = animalMap.get(animal.id);
        if (!existing || existing.species !== animal.species) {
          if (existing) {
            animalsGroup.remove(existing.rootGroup);
            existing.dispose();
          }
          const built = buildAnimalInstance(animal, isSoftwareGl);
          built.update(0);
          animalsGroup.add(built.rootGroup);
          animalMap.set(animal.id, built);
        }
      }

      requestRender();
    }

    function syncContributions(nextContributions: VisitorContributionRecord[]) {
      const nextIds = new Set(nextContributions.map((c) => c.id));

      for (const [id, built] of contributionMap.entries()) {
        if (!nextIds.has(id)) {
          contributionsGroup.remove(built.rootGroup);
          built.dispose();
          contributionMap.delete(id);
        }
      }

      for (const contrib of nextContributions) {
        const existing = contributionMap.get(contrib.id);
        if (
          !existing ||
          existing.kind !== contrib.kind ||
          existing.animalSpecies !== contrib.animal_species
        ) {
          if (existing) {
            contributionsGroup.remove(existing.rootGroup);
            existing.dispose();
          }
          const built = buildContributionInstance(contrib, textures, isSoftwareGl);
          built.update(0);
          contributionsGroup.add(built.rootGroup);
          contributionMap.set(contrib.id, built);
        }
      }

      rebuildColliderList();
      if (!renderBusy) {
        renderFrame(0, clock.elapsedTime);
      } else {
        requestRender();
      }
    }

    function syncVisualState() {
      const {
        season: s,
        timeOfDay: t,
        selectedPostId: selId,
        highlightCategorySlug: catSlug,
        trees: curTrees,
        reducedEffects: red,
        grassCount: gc,
        stoneCount: sc,
      } = stateRef.current;

      controls.enableDamping = !isSoftwareGl && !red;
      atmosphere.updateConfig(t, s);
      terrain.setVegetationCounts(gc, sc);
      terrain.applySeason(s);
      terrain.applyTimeOfDay(t);

      const postCatMap = new Map<number, string[]>();
      for (const item of curTrees) {
        postCatMap.set(
          item.post_id,
          item.categories.map((c) => c.slug),
        );
      }

      treeMap.forEach((built, postId) => {
        built.setSeason(s);
        const isSelected = selId === postId;
        const dimmed =
          Boolean(catSlug) && !(postCatMap.get(postId) ?? []).includes(catSlug!);
        built.setHighlighted(isSelected, dimmed);
      });

      if (!renderBusy) {
        renderFrame(0, clock.elapsedTime);
      } else {
        requestRender();
      }
    }

    function flyToTree(postId: number) {
      const built = treeMap.get(postId);
      if (!built) return;

      const treePos = built.baseWorldPos;
      const focusY = treePos.y + Math.max(1.2, built.canopyTopY * 0.42);
      flyGoalTarget.set(treePos.x, focusY, treePos.z);

      const dir = new THREE.Vector3().subVectors(camera.position, treePos);
      dir.y = 0;
      if (dir.lengthSq() < 0.1) dir.set(0.4, 0, 1);
      dir.normalize();

      const dist = Math.max(8.5, built.canopyTopY * 1.9 + 4.5);
      flyGoalPos.set(
        treePos.x + dir.x * dist,
        treePos.y + Math.max(3.6, built.canopyTopY * 0.72),
        treePos.z + dir.z * dist,
      );

      flyActive = true;
      requestRender();
    }

    function flyToContribution(contributionId: number) {
      const built = contributionMap.get(contributionId);
      if (!built) return;

      const pos = built.rootGroup.position;
      flyGoalTarget.set(pos.x, pos.y + built.focusYOffset, pos.z);

      const dir = new THREE.Vector3().subVectors(camera.position, pos);
      dir.y = 0;
      if (dir.lengthSq() < 0.1) dir.set(0.5, 0, 1);
      dir.normalize();

      const dist = built.kind === 'stone' ? 5.8 : 6.8;
      flyGoalPos.set(pos.x + dir.x * dist, pos.y + 3.0, pos.z + dir.z * dist);
      flyActive = true;
      requestRender();
    }

    function focusWoodenHouse() {
      const hy = groundHeightAt(WOODEN_HOUSE_POS.x, WOODEN_HOUSE_POS.z);
      flyGoalTarget.set(WOODEN_HOUSE_POS.x, hy + 1.8, WOODEN_HOUSE_POS.z);
      flyGoalPos.set(WOODEN_HOUSE_POS.x + 6.4, hy + 4.2, WOODEN_HOUSE_POS.z + 7.2);
      flyActive = true;
      requestRender();
    }

    function moveCamera(forwardAmount: number, strafeAmount: number) {
      flyActive = false;
      if (isSoftwareGl) {
        // Take gentle visible glide steps on software GL
        glideFwd += forwardAmount;
        glideStrafe += strafeAmount;
      } else {
        glideFwd += forwardAmount;
        glideStrafe += strafeAmount;
      }
      requestRender();
    }

    function setHoldMove(forwardDir: number, strafeDir: number) {
      flyActive = false;
      holdBtnFwd = forwardDir;
      holdBtnStrafe = strafeDir;
      requestRender();
    }

    function resetCamera() {
      flyGoalPos.copy(DEFAULT_CAM_POS);
      flyGoalTarget.copy(DEFAULT_CAM_TARGET);
      flyActive = true;
      requestRender();
    }

    const api = {
      syncTrees,
      syncAnimals,
      syncContributions,
      syncVisualState,
      flyToTree,
      flyToContribution,
      focusWoodenHouse,
      moveCamera,
      setHoldMove,
      resetCamera,
      requestRender,
    };
    sceneApiRef.current = api;
    if (controlApiRef) {
      controlApiRef.current = {
        move: moveCamera,
        setHoldMove,
        focusWoodenHouse,
        resetCamera,
      };
    }

    // Initial sync and immediate synchronous first-frame draw
    syncTrees(stateRef.current.trees);
    syncAnimals(stateRef.current.animals);
    syncContributions(stateRef.current.contributions);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    renderFrame(0, 0);

    controls.addEventListener('change', () => {
      updateFloatingTitles();
      if (isSoftwareGl || stateRef.current.reducedEffects) {
        requestRender();
      }
    });

    // Smooth Keyboard WASD / Arrow movement
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (
        e.code === 'KeyW' ||
        e.code === 'KeyS' ||
        e.code === 'KeyA' ||
        e.code === 'KeyD' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight'
      ) {
        flyActive = false;
        heldKeys.add(e.code);
        requestRender();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.code);
    };
    const onWindowBlur = () => {
      heldKeys.clear();
      holdBtnFwd = 0;
      holdBtnStrafe = 0;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    // Pointer interaction (distinguish click/tap from orbit drag)
    let downX = 0;
    let downY = 0;
    let lastHoverTime = 0;

    function updatePointerNDC(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    function onPointerDown(e: PointerEvent) {
      downX = e.clientX;
      downY = e.clientY;
    }

    function onPointerUp(e: PointerEvent) {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      updatePointerNDC(e.clientX, e.clientY);
      _raycaster.layers.set(1);
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObjects(colliderList, false);
      if (hits.length > 0) {
        const hitData = hits[0].object.userData;
        if (hitData.kind === 'woodenHouse') {
          focusWoodenHouse();
          callbacksRef.current.onOpenWoodenHouse();
          return;
        }
        if (hitData.kind === 'centerStone' || hitData.kind === 'manStatue') {
          flyGoalTarget.set(0, groundHeightAt(0, 0) + 1.0, 0);
          flyGoalPos.set(0, groundHeightAt(0, 0) + 3.4, 6.8);
          flyActive = true;
          requestRender();
          return;
        }
        if (hitData.kind === 'contribution' && typeof hitData.contributionId === 'number') {
          callbacksRef.current.onSelectTree(null);
          callbacksRef.current.onSelectContribution?.(hitData.contributionId);
          return;
        }
        const hitPostId = hitData.postId as number | undefined;
        if (typeof hitPostId === 'number') {
          callbacksRef.current.onSelectContribution?.(null);
          callbacksRef.current.onSelectTree(hitPostId);
          return;
        }
      }
      if (stateRef.current.selectedPostId !== null) {
        callbacksRef.current.onSelectTree(null);
      }
      if (stateRef.current.selectedContributionId !== null) {
        callbacksRef.current.onSelectContribution?.(null);
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerType === 'touch') return;
      const now = performance.now();
      if (now - lastHoverTime < 65) return;
      lastHoverTime = now;

      updatePointerNDC(e.clientX, e.clientY);
      _raycaster.layers.set(1);
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObjects(colliderList, false);
      if (hits.length > 0) {
        const hitData = hits[0].object.userData;
        const rect = canvas.getBoundingClientRect();

        if (hitData.kind === 'woodenHouse') {
          canvas.style.cursor = 'pointer';
          const hy = groundHeightAt(WOODEN_HOUSE_POS.x, WOODEN_HOUSE_POS.z);
          _projVec.set(WOODEN_HOUSE_POS.x, hy + 4.0, WOODEN_HOUSE_POS.z).project(camera);
          const sx = ((_projVec.x + 1) / 2) * rect.width;
          const sy = ((-_projVec.y + 1) / 2) * rect.height;
          if (_projVec.z < 1) {
            setHoverInfo({ kind: 'house', x: sx, y: sy });
          }
          return;
        }

        if (hitData.kind === 'centerStone' || hitData.kind === 'manStatue') {
          canvas.style.cursor = 'pointer';
          _projVec.set(0, groundHeightAt(0, 0) + 2.2, 0).project(camera);
          const sx = ((_projVec.x + 1) / 2) * rect.width;
          const sy = ((-_projVec.y + 1) / 2) * rect.height;
          if (_projVec.z < 1) {
            setHoverInfo({ kind: 'statue', x: sx, y: sy });
          }
          return;
        }

        if (hitData.kind === 'contribution' && typeof hitData.contributionId === 'number') {
          const built = contributionMap.get(hitData.contributionId);
          if (built) {
            canvas.style.cursor = 'pointer';
            _projVec
              .set(
                built.rootGroup.position.x,
                built.rootGroup.position.y + built.hoverHeight,
                built.rootGroup.position.z,
              )
              .project(camera);
            const sx = ((_projVec.x + 1) / 2) * rect.width;
            const sy = ((-_projVec.y + 1) / 2) * rect.height;
            if (_projVec.z < 1) {
              setHoverInfo({
                kind: 'contribution',
                contributionId: hitData.contributionId,
                x: sx,
                y: sy,
              });
            }
            return;
          }
        }

        const hitPostId = hitData.postId as number | undefined;
        const built = typeof hitPostId === 'number' ? treeMap.get(hitPostId) : undefined;
        if (built && hitPostId) {
          canvas.style.cursor = 'pointer';
          _projVec
            .set(
              built.baseWorldPos.x,
              built.baseWorldPos.y + built.canopyTopY + 0.65,
              built.baseWorldPos.z,
            )
            .project(camera);
          const sx = ((_projVec.x + 1) / 2) * rect.width;
          const sy = ((-_projVec.y + 1) / 2) * rect.height;
          if (
            _projVec.z < 1 &&
            sx > 60 &&
            sx < rect.width - 60 &&
            sy > 50 &&
            sy < rect.height - 60
          ) {
            setHoverInfo({ kind: 'tree', postId: hitPostId, x: sx, y: sy });
          } else {
            setHoverInfo(null);
          }
          return;
        }
      }
      canvas.style.cursor = 'grab';
      setHoverInfo((prev) => (prev ? null : prev));
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (!renderBusy) {
        renderFrame(0, clock.elapsedTime);
      } else {
        requestRender();
      }
    };
    window.addEventListener('resize', onResize);

    // Continuous GPU loop when animated, otherwise on-demand
    let continuousId = 0;
    function gpuLoop() {
      if (disposed) return;
      if (
        !document.hidden &&
        (!stateRef.current.reducedEffects || flyActive || isMoveActive() || !introDone)
      ) {
        const dt = Math.min(0.05, clock.getDelta());
        renderFrame(dt, clock.elapsedTime);
      } else {
        clock.getDelta();
      }
      continuousId = requestAnimationFrame(gpuLoop);
    }

    if (isSoftwareGl) {
      requestRender();
    } else {
      continuousId = requestAnimationFrame(gpuLoop);
    }

    const onVisibilityChange = () => {
      if (!document.hidden) {
        clock.getDelta();
        requestRender();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(continuousId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      controls.dispose();
      treeMap.forEach((b) => b.dispose());
      animalMap.forEach((a) => a.dispose());
      contributionMap.forEach((c) => c.dispose());
      terrain.dispose();
      atmosphere.dispose();
      textures.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
      sceneApiRef.current = null;
      if (controlApiRef) controlApiRef.current = null;
    };
  }, []);

  // Sync tree list changes without tearing down WebGL
  useEffect(() => {
    sceneApiRef.current?.syncTrees(trees);
  }, [trees]);

  // Sync animals list without tearing down WebGL
  useEffect(() => {
    sceneApiRef.current?.syncAnimals(animals);
  }, [animals]);

  // Sync approved visitor stones & animals without tearing down WebGL
  useEffect(() => {
    sceneApiRef.current?.syncContributions(contributions);
  }, [contributions]);

  // Sync visual atmosphere/selection/filter/titles/density state
  useEffect(() => {
    sceneApiRef.current?.syncVisualState();
  }, [
    season,
    timeOfDay,
    selectedPostId,
    highlightCategorySlug,
    reducedEffects,
    showTreeTitles,
    grassCount,
    stoneCount,
    lang,
  ]);

  // Fly camera only when selectedPostId genuinely changes
  const prevSelectedRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedPostId !== null && selectedPostId !== prevSelectedRef.current) {
      sceneApiRef.current?.flyToTree(selectedPostId);
    }
    prevSelectedRef.current = selectedPostId;
  }, [selectedPostId]);

  // Fly camera when selectedContributionId changes
  const prevSelectedContribRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      selectedContributionId !== null &&
      selectedContributionId !== prevSelectedContribRef.current
    ) {
      sceneApiRef.current?.flyToContribution(selectedContributionId);
    }
    prevSelectedContribRef.current = selectedContributionId;
  }, [selectedContributionId]);

  const prevResetRef = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal !== prevResetRef.current) {
      prevResetRef.current = resetSignal;
      sceneApiRef.current?.resetCamera();
    }
  }, [resetSignal]);

  const hoveredItem =
    hoverInfo?.kind === 'tree'
      ? trees.find((t) => t.post_id === hoverInfo.postId)
      : undefined;
  const hoveredTitle =
    hoveredItem?.translations[lang]?.title ||
    hoveredItem?.translations.uz?.title ||
    hoveredItem?.translations.en?.title;
  const hoveredContribution =
    hoverInfo?.kind === 'contribution'
      ? contributions.find((c) => c.id === hoverInfo.contributionId)
      : undefined;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#d7e3d8]">
      <div ref={mountRef} className="w-full h-full" />

      {/* Projected Floating Post Titles Above Trees (toggled in Admin) */}
      {showTreeTitles && (
        <div
          aria-hidden={!showTreeTitles}
          data-testid="floating-tree-titles"
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        >
          {trees.map((item) => {
            const title =
              item.translations[lang]?.title ||
              item.translations.uz?.title ||
              item.translations.en?.title;
            if (!title) return null;
            const isSelected = selectedPostId === item.post_id;
            const dimmed =
              Boolean(highlightCategorySlug) &&
              !item.categories.some((c) => c.slug === highlightCategorySlug);

            return (
              <button
                key={item.post_id}
                ref={(el) => {
                  if (el) titleElMapRef.current.set(item.post_id, el);
                  else titleElMapRef.current.delete(item.post_id);
                }}
                type="button"
                onClick={() => onSelectTree(item.post_id)}
                style={{ opacity: 0, left: 0, top: 0 }}
                className={`absolute max-w-[180px] truncate px-2.5 py-1 rounded-md text-[11px] font-medium shadow-sm transition-colors cursor-pointer border ${
                  isSelected
                    ? 'bg-[#214029] text-[#F7F4EE] border-[#F7F4EE]/40'
                    : dimmed
                      ? 'bg-[#F7F4EE]/60 text-[#546357] border-[#1C241E]/10'
                      : 'bg-[#FBF9F5]/92 text-[#1C241E] border-[#1C241E]/15 hover:bg-[#214029] hover:text-[#F7F4EE]'
                }`}
              >
                {title}
              </button>
            );
          })}
        </div>
      )}

      {/* Pointer Hover Tooltip */}
      {hoverInfo?.kind === 'tree' && hoveredTitle && selectedPostId !== hoverInfo.postId && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full px-3 py-1.5 rounded-lg bg-[#1A241C]/92 text-[#F7F4EE] text-xs font-medium shadow-md max-w-[230px] text-center border border-white/10"
          style={{ left: hoverInfo.x, top: hoverInfo.y }}
        >
          <div className="truncate">{hoveredTitle}</div>
          <div className="text-[10px] text-[#BBD0BC] mt-0.5">{hoverPromptLabel}</div>
        </div>
      )}

      {hoverInfo?.kind === 'house' && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full px-3 py-1.5 rounded-lg bg-[#3A2918]/92 text-[#FBF7F0] text-xs font-medium shadow-md max-w-[230px] text-center border border-white/15"
          style={{ left: hoverInfo.x, top: hoverInfo.y }}
        >
          <div>{houseHoverTitle}</div>
          <div className="text-[10px] text-[#E6D5B8] mt-0.5">{houseHoverPrompt}</div>
        </div>
      )}

      {hoverInfo?.kind === 'statue' && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full px-3 py-1.5 rounded-lg bg-[#1A241C]/90 text-[#F7F4EE] text-xs font-medium shadow-md text-center border border-white/10"
          style={{ left: hoverInfo.x, top: hoverInfo.y }}
        >
          <div>{statueHoverTitle}</div>
        </div>
      )}

      {hoverInfo?.kind === 'contribution' &&
        hoveredContribution &&
        selectedContributionId !== hoveredContribution.id && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full px-3 py-1.5 rounded-lg bg-[#1A241C]/92 text-[#F7F4EE] text-xs font-medium shadow-md max-w-[230px] text-center border border-white/10"
            style={{ left: hoverInfo.x, top: hoverInfo.y }}
          >
            <div className="truncate">
              {hoveredContribution.kind === 'stone'
                ? contributionStoneLabel
                : animalLabels?.[hoveredContribution.animal_species ?? 'rabbit'] ??
                  hoveredContribution.animal_species}
              {' · '}
              {hoveredContribution.visitor_name}
            </div>
            {hoveredContribution.comment ? (
              <div className="text-[10px] text-[#BBD0BC] truncate mt-0.5">
                “{hoveredContribution.comment}”
              </div>
            ) : (
              <div className="text-[10px] text-[#BBD0BC] mt-0.5">{hoverPromptLabel}</div>
            )}
          </div>
        )}
    </div>
  );
}
