import * as THREE from 'three';
import type { ForestTreeItem, SeasonMode, TreeSpecies } from '../types';
import { computeGrowthMetrics, type GrowthMetrics } from './growth';
import { groundHeightAt } from './placement';
import type { ProceduralTextureSet } from './textures';

export interface BuiltTreeInstance {
  postId: number;
  species: TreeSpecies;
  rootGroup: THREE.Group;
  treePivot: THREE.Group;
  colliderMesh: THREE.Mesh;
  selectionRing: THREE.Mesh;
  foliageMeshes: THREE.Mesh[];
  snowCaps: THREE.Mesh[];
  growth: GrowthMetrics;
  baseWorldPos: THREE.Vector3;
  canopyTopY: number;
  setSeason: (season: SeasonMode) => void;
  setHighlighted: (selected: boolean, dimmed: boolean) => void;
  setIntroProgress: (t: number) => void;
  applyWind: (elapsed: number) => void;
  dispose: () => void;
}

const SPECIES_COLORS: Record<
  TreeSpecies,
  Record<SeasonMode, [string, string, string]>
> = {
  oak: {
    spring: ['#558d46', '#6fa453', '#84b862'],
    summer: ['#366832', '#497d3f', '#5a8f4c'],
    autumn: ['#b55b24', '#d4822a', '#963b1e'],
    winter: ['#736c60', '#8f8779', '#a9b5b8'],
  },
  birch: {
    spring: ['#7bb356', '#94c46c', '#a9d47c'],
    summer: ['#5b9541', '#75ab53', '#87bc64'],
    autumn: ['#e0ae2f', '#ebb942', '#cc8f24'],
    winter: ['#8b8579', '#9f998c', '#c2ccd1'],
  },
  maple: {
    spring: ['#619949', '#7eaf5c', '#92bf6f'],
    summer: ['#447937', '#5a9045', '#6ea356'],
    autumn: ['#c43b24', '#e06326', '#df9328'],
    winter: ['#786b61', '#8d8075', '#b0bbc2'],
  },
  willow: {
    spring: ['#71a756', '#8ac06a', '#9fd17d'],
    summer: ['#4f8540', '#679c53', '#7cae66'],
    autumn: ['#ada13c', '#c7b84e', '#8e8433'],
    winter: ['#7a7c6b', '#8f917f', '#aab8ba'],
  },
  cherry: {
    spring: ['#eb9bb4', '#f7c1d1', '#f2acc2'],
    summer: ['#4a7d46', '#639457', '#78a86a'],
    autumn: ['#b85834', '#d47c42', '#993d28'],
    winter: ['#75686b', '#8b7e81', '#b5bfc6'],
  },
  walnut: {
    spring: ['#5c9248', '#75aa59', '#8cbe6d'],
    summer: ['#386634', '#4a7a42', '#5d8d52'],
    autumn: ['#a97831', '#c7953c', '#855a27'],
    winter: ['#6e675c', '#847d72', '#a6b1b5'],
  },
};

export function buildTreeInstance(
  item: ForestTreeItem,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): BuiltTreeInstance {
  const { tree, post_id, published_at } = item;
  const rawSpecies = tree.species as string;
  const species: TreeSpecies =
    rawSpecies === 'pine' || rawSpecies === 'cedar'
      ? 'walnut'
      : (rawSpecies as TreeSpecies);
  const growth = computeGrowthMetrics(published_at);

  const rootGroup = new THREE.Group();
  const groundY = groundHeightAt(tree.position_x, tree.position_z);
  rootGroup.position.set(tree.position_x, groundY, tree.position_z);

  // Subtle contact shadow disc sitting flush just above terrain
  const shadowGeo = new THREE.CircleGeometry(1.75 * growth.canopyScale + 0.55, 22);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadow,
    transparent: true,
    depthWrite: false,
    opacity: 0.48,
  });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.position.y = 0.03;
  rootGroup.add(shadowDisc);

  // Selection ring on ground (hidden until selected)
  const ringGeo = new THREE.RingGeometry(
    1.5 * growth.canopyScale + 0.38,
    1.72 * growth.canopyScale + 0.48,
    36,
  );
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#d9a441',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const selectionRing = new THREE.Mesh(ringGeo, ringMat);
  selectionRing.position.y = 0.05;
  rootGroup.add(selectionRing);

  const treePivot = new THREE.Group();
  treePivot.rotation.y = tree.rotation;
  const seedScale = tree.scale_seed || 1;
  rootGroup.add(treePivot);

  const disposables: Array<{ dispose: () => void }> = [shadowGeo, shadowMat, ringGeo, ringMat];
  const foliageMeshes: THREE.Mesh[] = [];
  const snowCaps: THREE.Mesh[] = [];

  const barkMap =
    species === 'birch'
      ? textures.birchBark
      : species === 'walnut' || species === 'maple'
        ? textures.walnutBark
        : textures.oakBark;

  const barkMat = new THREE.MeshStandardMaterial({
    map: barkMap,
    color:
      species === 'birch'
        ? '#f2efe7'
        : species === 'cherry'
          ? '#6e524b'
          : species === 'willow'
            ? '#70604c'
            : '#8c725c',
    roughness: 0.9,
    metalness: 0.02,
  });
  disposables.push(barkMat);

  const leafMatA = new THREE.MeshStandardMaterial({
    color: SPECIES_COLORS[species].summer[0],
    map: textures.leafMap,
    bumpMap: textures.leafBump,
    bumpScale: 0.08,
    roughness: 0.78,
    metalness: 0.02,
  });
  const leafMatB = new THREE.MeshStandardMaterial({
    color: SPECIES_COLORS[species].summer[1],
    map: textures.leafMap,
    bumpMap: textures.leafBump,
    bumpScale: 0.08,
    roughness: 0.74,
    metalness: 0.02,
  });
  const leafMatC = new THREE.MeshStandardMaterial({
    color: SPECIES_COLORS[species].summer[2],
    map: textures.leafMap,
    bumpMap: textures.leafBump,
    bumpScale: 0.07,
    roughness: 0.72,
    metalness: 0.02,
  });
  const snowCapMat = new THREE.MeshStandardMaterial({
    color: '#eef4f8',
    roughness: 0.65,
    metalness: 0.02,
  });
  disposables.push(leafMatA, leafMatB, leafMatC, snowCapMat);

  const leafMats = [leafMatA, leafMatB, leafMatC];

  const baseHeight =
    (species === 'birch' ? 6.8 : species === 'walnut' ? 6.6 : 6.2) *
    growth.heightScale *
    seedScale;
  const baseRadius =
    (species === 'oak' || species === 'walnut' ? 0.34 : species === 'birch' ? 0.18 : 0.26) *
    growth.trunkRadiusScale *
    seedScale;

  // 1. Primary Trunk + Root Flare
  const trunkH = baseHeight * 0.54;
  const trunkGeo = new THREE.CylinderGeometry(baseRadius * 0.5, baseRadius * 1.28, trunkH, 10);
  trunkGeo.translate(0, trunkH / 2, 0);
  const trunkMesh = new THREE.Mesh(trunkGeo, barkMat);
  trunkMesh.castShadow = !isSoftwareGl;
  trunkMesh.receiveShadow = !isSoftwareGl;
  treePivot.add(trunkMesh);
  disposables.push(trunkGeo);

  if (growth.progress > 0.32) {
    for (let r = 0; r < 4; r++) {
      const rAngle = (r / 4) * Math.PI * 2 + 0.35;
      const rootGeo = new THREE.CylinderGeometry(
        baseRadius * 0.24,
        baseRadius * 0.56,
        baseHeight * 0.15,
        6,
      );
      const rootMesh = new THREE.Mesh(rootGeo, barkMat);
      rootMesh.position.set(
        Math.cos(rAngle) * baseRadius * 0.68,
        baseHeight * 0.05,
        Math.sin(rAngle) * baseRadius * 0.68,
      );
      rootMesh.rotation.z = -Math.cos(rAngle) * 0.48;
      rootMesh.rotation.x = Math.sin(rAngle) * 0.48;
      treePivot.add(rootMesh);
      disposables.push(rootGeo);
    }
  }

  // 2. Sculptural broadleaf canopies (no fir cones!)
  let canopyTopY = baseHeight;

  const addLeafCluster = (
    x: number,
    y: number,
    z: number,
    r: number,
    sy: number,
    matIdx: number,
    addSnow: boolean,
  ) => {
    const geo = new THREE.IcosahedronGeometry(r, isSoftwareGl ? 1 : 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const n =
        1 +
        Math.sin(vx * 3.1 + vy * 2.4 + post_id) * 0.12 +
        Math.cos(vz * 2.9 - vx * 2.1) * 0.09;
      pos.setXYZ(i, vx * n, vy * n, vz * n);
    }
    geo.computeVertexNormals();
    geo.scale(1.12, sy, 1.08);
    const mesh = new THREE.Mesh(geo, leafMats[matIdx % 3]);
    mesh.position.set(x, y, z);
    mesh.castShadow = !isSoftwareGl;
    mesh.receiveShadow = !isSoftwareGl;
    treePivot.add(mesh);
    foliageMeshes.push(mesh);
    disposables.push(geo);

    if (addSnow) {
      const sGeo = new THREE.SphereGeometry(r * 0.88, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
      sGeo.scale(1.06, sy * 0.72, 1.04);
      const sMesh = new THREE.Mesh(sGeo, snowCapMat);
      sMesh.position.set(x, y + r * sy * 0.26, z);
      sMesh.visible = false;
      treePivot.add(sMesh);
      snowCaps.push(sMesh);
      disposables.push(sGeo);
    }
    canopyTopY = Math.max(canopyTopY, y + r * sy);
  };

  if (species === 'willow') {
    const limbCount = growth.progress < 0.22 ? 2 : 4;
    for (let i = 0; i < limbCount; i++) {
      const ang = (i / limbCount) * Math.PI * 2;
      const limbLen = 1.6 * growth.branchSpread * seedScale;
      const limbGeo = new THREE.CylinderGeometry(baseRadius * 0.2, baseRadius * 0.42, limbLen, 6);
      limbGeo.translate(0, limbLen * 0.5, 0);
      const limb = new THREE.Mesh(limbGeo, barkMat);
      limb.position.y = trunkH * 0.85;
      limb.rotation.z = -Math.cos(ang) * 0.55;
      limb.rotation.x = Math.sin(ang) * 0.55;
      treePivot.add(limb);
      disposables.push(limbGeo);

      const tipX = Math.cos(ang) * limbLen * 0.65;
      const tipZ = Math.sin(ang) * limbLen * 0.65;
      const crownY = trunkH * 0.9 + limbLen * 0.45;
      addLeafCluster(tipX, crownY, tipZ, 1.15 * growth.canopyScale * seedScale, 0.78, i, true);

      const curtainGeo = new THREE.CylinderGeometry(
        0.55 * growth.canopyScale,
        0.22 * growth.canopyScale,
        2.1 * growth.heightScale,
        7,
        1,
        true,
      );
      const curtain = new THREE.Mesh(curtainGeo, leafMatB);
      curtain.position.set(tipX * 1.15, crownY - 1.05 * growth.heightScale, tipZ * 1.15);
      treePivot.add(curtain);
      foliageMeshes.push(curtain);
      disposables.push(curtainGeo);
    }
    addLeafCluster(0, trunkH + 1.0 * growth.canopyScale, 0, 1.2 * growth.canopyScale * seedScale, 0.85, 2, true);
  } else {
    const branchCount = growth.progress < 0.18 ? 3 : growth.progress < 0.45 ? 4 : 6;
    for (let i = 0; i < branchCount; i++) {
      const ang = (i / branchCount) * Math.PI * 2 + 0.3;
      const limbLen =
        (species === 'oak' || species === 'walnut' ? 1.85 : species === 'birch' ? 1.35 : 1.65) *
        growth.branchSpread *
        seedScale;
      const limbGeo = new THREE.CylinderGeometry(baseRadius * 0.2, baseRadius * 0.45, limbLen, 6);
      limbGeo.translate(0, limbLen * 0.5, 0);
      const limb = new THREE.Mesh(limbGeo, barkMat);
      limb.position.y = trunkH * (0.74 + (i % 2) * 0.12);
      const tilt = species === 'birch' ? 0.36 : 0.62;
      limb.rotation.z = -Math.cos(ang) * tilt;
      limb.rotation.x = Math.sin(ang) * tilt;
      limb.castShadow = !isSoftwareGl;
      treePivot.add(limb);
      disposables.push(limbGeo);

      const clusterX = Math.cos(ang) * limbLen * 0.68;
      const clusterZ = Math.sin(ang) * limbLen * 0.68;
      const clusterY = limb.position.y + limbLen * Math.cos(tilt) * 0.92;
      const clusterR =
        (species === 'oak' || species === 'walnut'
          ? 1.32
          : species === 'maple'
            ? 1.22
            : species === 'birch'
              ? 0.92
              : 1.15) *
        growth.canopyScale *
        seedScale;

      const sy = species === 'birch' ? 1.15 : species === 'cherry' ? 0.72 : 0.82;
      addLeafCluster(clusterX, clusterY, clusterZ, clusterR, sy, i, true);

      // Secondary outer sub-puff for lush natural silhouette
      if (growth.progress > 0.38) {
        addLeafCluster(
          clusterX * 1.22,
          clusterY + clusterR * 0.35,
          clusterZ * 1.22,
          clusterR * 0.68,
          0.85,
          i + 1,
          false,
        );
      }
    }

    const apexR =
      (species === 'oak' || species === 'walnut' ? 1.45 : species === 'birch' ? 1.08 : 1.25) *
      growth.canopyScale *
      seedScale;
    const apexSy = species === 'birch' ? 1.12 : 0.82;
    addLeafCluster(0, trunkH + apexR * 0.78, 0, apexR, apexSy, 0, true);
  }

  // 3. Raycast collider cylinder on layer 1
  const hitR = Math.max(1.3, 1.9 * growth.canopyScale);
  const hitH = Math.max(2.6, canopyTopY + 0.5);
  const colliderGeo = new THREE.CylinderGeometry(hitR, hitR * 0.8, hitH, 8);
  colliderGeo.translate(0, hitH / 2, 0);
  const colliderMat = new THREE.MeshBasicMaterial({ visible: false });
  const colliderMesh = new THREE.Mesh(colliderGeo, colliderMat);
  colliderMesh.layers.set(1);
  colliderMesh.userData.postId = post_id;
  rootGroup.add(colliderMesh);
  disposables.push(colliderGeo, colliderMat);

  function setSeason(season: SeasonMode) {
    const [cA, cB, cC] = SPECIES_COLORS[species][season];
    leafMatA.color.set(cA);
    leafMatB.color.set(cB);
    leafMatC.color.set(cC);
    const isWinter = season === 'winter';
    snowCaps.forEach((s) => {
      s.visible = isWinter;
    });
  }

  function setHighlighted(selected: boolean, dimmed: boolean) {
    ringMat.opacity = selected ? 0.88 : 0;
    const em = selected ? 0x223318 : 0x000000;
    leafMatA.emissive.setHex(em);
    leafMatB.emissive.setHex(em);
    leafMatC.emissive.setHex(em);

    const targetOpacity = dimmed ? 0.34 : 1.0;
    const isTransparent = dimmed;
    [leafMatA, leafMatB, leafMatC].forEach((m) => {
      m.transparent = isTransparent;
      m.opacity = targetOpacity;
    });
    barkMat.transparent = isTransparent;
    barkMat.opacity = dimmed ? 0.45 : 1.0;
  }

  function setIntroProgress(t: number) {
    const clamped = Math.min(1, Math.max(0.02, t));
    const ease = 1 - Math.pow(1 - clamped, 3);
    treePivot.scale.set(0.35 + ease * 0.65, ease, 0.35 + ease * 0.65);
  }

  function applyWind(elapsed: number) {
    if (isSoftwareGl) return;
    const swayAmt = 0.018 * (0.5 + growth.heightScale * 0.5);
    const phase = tree.position_x * 0.3 + tree.position_z * 0.25;
    treePivot.rotation.z = Math.sin(elapsed * 1.15 + phase) * swayAmt;
    treePivot.rotation.x = Math.cos(elapsed * 0.9 + phase) * swayAmt * 0.7;
  }

  return {
    postId: post_id,
    species,
    rootGroup,
    treePivot,
    colliderMesh,
    selectionRing,
    foliageMeshes,
    snowCaps,
    growth,
    baseWorldPos: new THREE.Vector3(tree.position_x, groundY, tree.position_z),
    canopyTopY,
    setSeason,
    setHighlighted,
    setIntroProgress,
    applyWind,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
