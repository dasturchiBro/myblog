import * as THREE from 'three';
import type { SeasonMode, TimeOfDay } from '../types';
import {
  buildStoneBrickPaths,
  clampGrassCount,
  clampStoneCount,
  WOODEN_HOUSE_POS,
} from './pathLayout';
import { groundHeightAt } from './placement';
import type { ProceduralTextureSet } from './textures';

export { WOODEN_HOUSE_POS };

export interface TerrainRig {
  group: THREE.Group;
  houseCollider: THREE.Mesh;
  statueCollider: THREE.Mesh;
  syncTreePaths: (trees: Array<{ post_id: number; position_x: number; position_z: number }>) => void;
  setVegetationCounts: (grassCount: number, stoneCount: number) => void;
  applySeason: (season: SeasonMode) => void;
  applyTimeOfDay: (time: TimeOfDay) => void;
  updateWind: (elapsed: number) => void;
  dispose: () => void;
}

const MAX_GRASS = 2500;
const MAX_STONES = 100;
const MAX_PATH_BRICKS = 2200;

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function createTerrainAndEnvironment(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): TerrainRig {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // 1. Undulating terrain mesh with calm clearing & woodland moss vertex colors
  const size = 220;
  const segs = isSoftwareGl ? 72 : 104;
  const terrainGeo = new THREE.PlaneGeometry(size, size, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const vertexCount = posAttr.count;
  const baseColors = new Float32Array(vertexCount * 3);
  const colorAttr = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);

  for (let i = 0; i < vertexCount; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = groundHeightAt(x, z);
    posAttr.setY(i, y);

    const dist = Math.hypot(x, z);
    if (dist < 3.6) {
      _color.set('#758462');
    } else if (dist < 11) {
      _color.set('#5f8045');
    } else {
      const noise = Math.sin(x * 0.14) * Math.cos(z * 0.14);
      _color.set('#456535').lerp(new THREE.Color('#5d7d45'), (noise + 1) * 0.5);
    }

    baseColors[i * 3] = _color.r;
    baseColors[i * 3 + 1] = _color.g;
    baseColors[i * 3 + 2] = _color.b;
  }

  terrainGeo.setAttribute('color', colorAttr);
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.groundMap,
    bumpMap: textures.groundBump,
    bumpScale: 0.08,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = !isSoftwareGl;
  group.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // Shared materials
  const stoneMat = new THREE.MeshStandardMaterial({
    color: '#9c9b92',
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.05,
    roughness: 0.86,
    metalness: 0.04,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: '#6b6a63',
    map: textures.stoneMap,
    roughness: 0.9,
    metalness: 0.04,
  });
  const bronzePlaqueMat = new THREE.MeshStandardMaterial({
    color: '#9c7c48',
    roughness: 0.35,
    metalness: 0.78,
  });
  const snowAccentMat = new THREE.MeshStandardMaterial({
    color: '#eef4f8',
    roughness: 0.68,
    metalness: 0.02,
  });
  disposables.push(stoneMat, darkStoneMat, bronzePlaqueMat, snowAccentMat);

  // 2. Central Clearing Natural Stone (replaces statue)
  const centerStoneGroup = new THREE.Group();
  const centerY = groundHeightAt(0, 0);
  centerStoneGroup.position.set(0, centerY, 0);

  const displaceRockGeo = (geo: THREE.BufferGeometry, freq = 3.2, amp = 0.16) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const d =
        1 +
        Math.sin(vx * freq + vy * (freq * 0.7)) * amp +
        Math.cos(vz * (freq * 1.15) - vx * (freq * 0.6)) * (amp * 0.72);
      pos.setXYZ(i, vx * d, vy * d, vz * d);
    }
    geo.computeVertexNormals();
  };

  const mainStoneGeo = new THREE.IcosahedronGeometry(1.38, 2);
  displaceRockGeo(mainStoneGeo, 2.4, 0.18);
  const mainStoneMesh = new THREE.Mesh(mainStoneGeo, stoneMat);
  mainStoneMesh.scale.set(1.22, 0.82, 1.04);
  mainStoneMesh.position.set(0, 0.62, 0);
  mainStoneMesh.rotation.set(0.08, 0.45, -0.06);
  mainStoneMesh.castShadow = !isSoftwareGl;
  mainStoneMesh.receiveShadow = !isSoftwareGl;
  centerStoneGroup.add(mainStoneMesh);

  const sideStoneAGeo = new THREE.IcosahedronGeometry(0.66, 2);
  displaceRockGeo(sideStoneAGeo, 3.8, 0.14);
  const sideStoneAMesh = new THREE.Mesh(sideStoneAGeo, darkStoneMat);
  sideStoneAMesh.scale.set(1.18, 0.7, 0.95);
  sideStoneAMesh.position.set(-1.12, 0.28, 0.45);
  sideStoneAMesh.rotation.y = 0.9;
  sideStoneAMesh.castShadow = !isSoftwareGl;
  sideStoneAMesh.receiveShadow = !isSoftwareGl;
  centerStoneGroup.add(sideStoneAMesh);

  const sideStoneBGeo = new THREE.IcosahedronGeometry(0.54, 1);
  displaceRockGeo(sideStoneBGeo, 4.1, 0.15);
  const sideStoneBMesh = new THREE.Mesh(sideStoneBGeo, stoneMat);
  sideStoneBMesh.scale.set(1.15, 0.65, 1.05);
  sideStoneBMesh.position.set(1.02, 0.22, -0.52);
  sideStoneBMesh.rotation.y = 2.1;
  sideStoneBMesh.castShadow = !isSoftwareGl;
  sideStoneBMesh.receiveShadow = !isSoftwareGl;
  centerStoneGroup.add(sideStoneBMesh);

  // Winter snow cap resting naturally on top of the center stone
  const centerStoneSnowGeo = new THREE.SphereGeometry(1.18, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.44);
  const centerStoneSnow = new THREE.Mesh(centerStoneSnowGeo, snowAccentMat);
  centerStoneSnow.scale.set(1.18, 0.52, 1.0);
  centerStoneSnow.position.set(0, 0.92, 0);
  centerStoneSnow.visible = false;
  centerStoneGroup.add(centerStoneSnow);

  // Click/hover collider for center stone (layer 1)
  const stoneColGeo = new THREE.CylinderGeometry(1.5, 1.85, 1.9, 8);
  stoneColGeo.translate(0, 0.9, 0);
  const invisibleColMat = new THREE.MeshBasicMaterial({ visible: false });
  const statueCollider = new THREE.Mesh(stoneColGeo, invisibleColMat);
  statueCollider.layers.set(1);
  statueCollider.userData.kind = 'centerStone';
  centerStoneGroup.add(statueCollider);

  group.add(centerStoneGroup);
  disposables.push(
    mainStoneGeo,
    sideStoneAGeo,
    sideStoneBGeo,
    centerStoneSnowGeo,
    stoneColGeo,
    invisibleColMat,
  );

  // 3. Stone Brick Paths connecting Center Stone -> Wooden House -> All Article Trees
  const brickGeo = new THREE.BoxGeometry(0.54, 0.085, 0.36);
  const brickMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.04,
    roughness: 0.87,
    metalness: 0.03,
  });
  const pathBricks = new THREE.InstancedMesh(brickGeo, brickMat, MAX_PATH_BRICKS);
  pathBricks.receiveShadow = !isSoftwareGl;
  pathBricks.count = 0;
  group.add(pathBricks);
  disposables.push(brickGeo, brickMat);

  let currentSeason: SeasonMode = 'summer';
  let lastSyncedTrees: Array<{ post_id: number; position_x: number; position_z: number }> = [];

  function colorizePathBricks(season: SeasonMode) {
    const count = pathBricks.count;
    for (let i = 0; i < count; i++) {
      const mod = i % 5;
      if (season === 'winter') {
        _color.set(mod === 0 ? '#b8bec2' : mod === 1 ? '#cdd3d8' : '#a3aaaf');
      } else if (season === 'autumn') {
        _color.set(mod === 0 ? '#a9937a' : mod === 1 ? '#96826c' : mod === 2 ? '#b8a288' : '#85735e');
      } else {
        _color.set(mod === 0 ? '#a7a093' : mod === 1 ? '#938e82' : mod === 2 ? '#b5aea0' : '#848076');
      }
      pathBricks.setColorAt(i, _color);
    }
    if (pathBricks.instanceColor) pathBricks.instanceColor.needsUpdate = true;
  }

  function syncTreePaths(
    trees: Array<{ post_id: number; position_x: number; position_z: number }>,
  ) {
    lastSyncedTrees = trees;
    const bricks = buildStoneBrickPaths(trees, MAX_PATH_BRICKS);
    pathBricks.count = bricks.length;

    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      _dummy.position.set(b.x, b.y, b.z);
      _dummy.rotation.set(0, b.rotY, 0);
      _dummy.scale.set(b.scaleX, 1, b.scaleZ);
      _dummy.updateMatrix();
      pathBricks.setMatrixAt(i, _dummy.matrix);
    }
    pathBricks.instanceMatrix.needsUpdate = true;
    colorizePathBricks(currentSeason);
    pathBricks.computeBoundingSphere();
  }

  // 4. Small Wooden House in the Forest (replaces About page)
  const houseGroup = new THREE.Group();
  const houseY = groundHeightAt(WOODEN_HOUSE_POS.x, WOODEN_HOUSE_POS.z);
  houseGroup.position.set(WOODEN_HOUSE_POS.x, houseY, WOODEN_HOUSE_POS.z);
  houseGroup.rotation.y = 0.58;

  const timberWallMat = new THREE.MeshStandardMaterial({
    map: textures.woodPlankMap,
    color: '#c79f78',
    roughness: 0.85,
    metalness: 0.02,
  });
  const darkTimberMat = new THREE.MeshStandardMaterial({
    color: '#4e3726',
    roughness: 0.88,
    metalness: 0.03,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: '#5c3c2a',
    roughness: 0.86,
    metalness: 0.03,
  });
  const windowGlowMat = new THREE.MeshStandardMaterial({
    color: '#ffd996',
    emissive: '#ffaa3b',
    emissiveIntensity: 0.45,
    roughness: 0.3,
  });
  disposables.push(timberWallMat, darkTimberMat, roofMat, windowGlowMat);

  const foundGeo = new THREE.BoxGeometry(3.6, 0.35, 3.2);
  const foundMesh = new THREE.Mesh(foundGeo, darkStoneMat);
  foundMesh.position.y = 0.175;
  foundMesh.receiveShadow = !isSoftwareGl;
  houseGroup.add(foundMesh);

  const porchGeo = new THREE.BoxGeometry(2.4, 0.18, 1.0);
  const porchMesh = new THREE.Mesh(porchGeo, darkTimberMat);
  porchMesh.position.set(0, 0.25, 1.9);
  porchMesh.receiveShadow = !isSoftwareGl;
  houseGroup.add(porchMesh);

  const stepGeo = new THREE.BoxGeometry(1.3, 0.12, 0.42);
  const stepMesh = new THREE.Mesh(stepGeo, darkTimberMat);
  stepMesh.position.set(0, 0.1, 2.52);
  houseGroup.add(stepMesh);

  const wallsGeo = new THREE.BoxGeometry(3.2, 2.0, 2.6);
  const wallsMesh = new THREE.Mesh(wallsGeo, timberWallMat);
  wallsMesh.position.y = 1.35;
  wallsMesh.castShadow = !isSoftwareGl;
  wallsMesh.receiveShadow = !isSoftwareGl;
  houseGroup.add(wallsMesh);

  const roofShape = new THREE.Shape();
  roofShape.moveTo(-1.95, 0);
  roofShape.lineTo(0, 1.35);
  roofShape.lineTo(1.95, 0);
  roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 3.3,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 1,
  });
  roofGeo.translate(0, 0, -1.65);
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.position.set(0, 2.28, 0.15);
  roofMesh.castShadow = !isSoftwareGl;
  roofMesh.receiveShadow = !isSoftwareGl;
  houseGroup.add(roofMesh);

  const snowRoofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 3.32,
    bevelEnabled: false,
  });
  snowRoofGeo.translate(0, 0, -1.66);
  const snowRoofMesh = new THREE.Mesh(snowRoofGeo, snowAccentMat);
  snowRoofMesh.position.set(0, 2.34, 0.15);
  snowRoofMesh.scale.set(1.01, 1.02, 1.0);
  snowRoofMesh.visible = false;
  houseGroup.add(snowRoofMesh);

  const chimneyGeo = new THREE.BoxGeometry(0.45, 1.5, 0.45);
  const chimneyMesh = new THREE.Mesh(chimneyGeo, stoneMat);
  chimneyMesh.position.set(0.95, 3.05, -0.65);
  chimneyMesh.castShadow = !isSoftwareGl;
  houseGroup.add(chimneyMesh);

  const doorGeo = new THREE.BoxGeometry(0.78, 1.42, 0.08);
  const doorMesh = new THREE.Mesh(doorGeo, darkTimberMat);
  doorMesh.position.set(0, 1.06, 1.31);
  houseGroup.add(doorMesh);

  const knobGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const knobMesh = new THREE.Mesh(knobGeo, bronzePlaqueMat);
  knobMesh.position.set(0.26, 1.05, 1.37);
  houseGroup.add(knobMesh);

  const winFrameGeo = new THREE.BoxGeometry(0.64, 0.64, 0.08);
  const winPaneGeo = new THREE.BoxGeometry(0.5, 0.5, 0.1);
  const winPositions: Array<[number, number, number, number]> = [
    [-0.95, 1.42, 1.31, 0],
    [0.95, 1.42, 1.31, 0],
    [-1.61, 1.42, 0, Math.PI / 2],
    [1.61, 1.42, 0, Math.PI / 2],
  ];
  for (const [wx, wy, wz, ry] of winPositions) {
    const wf = new THREE.Mesh(winFrameGeo, darkTimberMat);
    wf.position.set(wx, wy, wz);
    wf.rotation.y = ry;
    houseGroup.add(wf);

    const wp = new THREE.Mesh(winPaneGeo, windowGlowMat);
    wp.position.set(wx, wy, wz);
    wp.rotation.y = ry;
    houseGroup.add(wp);
  }

  const pillarGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.85, 6);
  for (const px of [-1.05, 1.05]) {
    const pillar = new THREE.Mesh(pillarGeo, darkTimberMat);
    pillar.position.set(px, 1.25, 2.25);
    houseGroup.add(pillar);
  }

  const houseColGeo = new THREE.BoxGeometry(4.1, 3.8, 4.0);
  houseColGeo.translate(0, 1.9, 0.3);
  const houseCollider = new THREE.Mesh(houseColGeo, invisibleColMat);
  houseCollider.layers.set(1);
  houseCollider.userData.kind = 'woodenHouse';
  houseGroup.add(houseCollider);

  group.add(houseGroup);
  disposables.push(
    foundGeo,
    porchGeo,
    stepGeo,
    wallsGeo,
    roofGeo,
    snowRoofGeo,
    chimneyGeo,
    doorGeo,
    knobGeo,
    winFrameGeo,
    winPaneGeo,
    pillarGeo,
    houseColGeo,
  );

  // 5. Adjustable Displaced Granite Stones + Winter Snow Caps (0..100 controlled via Admin)
  const rockGeo = new THREE.IcosahedronGeometry(0.72, 2);
  displaceRockGeo(rockGeo, 4.5, 0.14);

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.08,
    roughness: 0.88,
    metalness: 0.04,
  });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, MAX_STONES);
  rocks.castShadow = !isSoftwareGl;
  rocks.receiveShadow = !isSoftwareGl;

  const snowRockGeo = new THREE.SphereGeometry(0.64, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45);
  const snowRocks = new THREE.InstancedMesh(snowRockGeo, snowAccentMat, MAX_STONES);

  for (let i = 0; i < MAX_STONES; i++) {
    const angle = i * 2.39996;
    const radius = 6.2 + ((i * 19) % 41);
    let rx = Math.cos(angle) * radius;
    let rz = Math.sin(angle) * radius;
    if (Math.hypot(rx - WOODEN_HOUSE_POS.x, rz - WOODEN_HOUSE_POS.z) < 4.6) {
      rx += 5.2;
    }
    const ry = groundHeightAt(rx, rz);
    const s = 0.4 + ((i * 7) % 10) * 0.095;
    _dummy.position.set(rx, ry + s * 0.12, rz);
    _dummy.rotation.set((i % 5) * 0.3, angle, (i % 3) * 0.25);
    _dummy.scale.set(s * 1.25, s * 0.7, s);
    _dummy.updateMatrix();
    rocks.setMatrixAt(i, _dummy.matrix);

    _dummy.position.set(rx, ry + s * 0.36, rz);
    _dummy.rotation.set(0, angle, 0);
    _dummy.scale.set(s * 1.12, s * 0.46, s * 0.9);
    _dummy.updateMatrix();
    snowRocks.setMatrixAt(i, _dummy.matrix);

    _color.set('#969890').lerp(new THREE.Color('#758068'), (i % 4) * 0.22);
    rocks.setColorAt(i, _color);
  }
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.count = 18;
  rocks.computeBoundingSphere();

  snowRocks.instanceMatrix.needsUpdate = true;
  snowRocks.count = 18;
  snowRocks.computeBoundingSphere();
  snowRocks.visible = false;
  group.add(rocks);
  group.add(snowRocks);
  disposables.push(rockGeo, rockMat, snowRockGeo);

  // 6. Adjustable 3-Blade Crossed Wild Grass Clumps (0..2500 controlled via Admin)
  const bladeA = new THREE.PlaneGeometry(0.13, 0.52, 1, 3);
  bladeA.translate(0, 0.26, 0);
  const bAttr = bladeA.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bAttr.count; i++) {
    const y = bAttr.getY(i);
    const t = y / 0.52;
    bAttr.setX(i, bAttr.getX(i) * (1 - t * 0.88));
    bAttr.setZ(i, Math.pow(t, 2) * 0.1);
  }
  bladeA.computeVertexNormals();

  const bladeB = bladeA.clone();
  bladeB.rotateY(2.1);
  bladeB.rotateX(0.12);
  const bladeC = bladeA.clone();
  bladeC.rotateY(-2.0);
  bladeC.rotateZ(0.1);

  const posA = bladeA.attributes.position.array as Float32Array;
  const posB = bladeB.attributes.position.array as Float32Array;
  const posC = bladeC.attributes.position.array as Float32Array;
  const normA = bladeA.attributes.normal.array as Float32Array;
  const normB = bladeB.attributes.normal.array as Float32Array;
  const normC = bladeC.attributes.normal.array as Float32Array;
  const idxA = bladeA.index!.array;
  const idxB = bladeB.index!.array;
  const idxC = bladeC.index!.array;
  const vPerBlade = posA.length / 3;

  const tuftPos = new Float32Array(posA.length * 3);
  tuftPos.set(posA, 0);
  tuftPos.set(posB, posA.length);
  tuftPos.set(posC, posA.length * 2);

  const tuftNorm = new Float32Array(normA.length * 3);
  tuftNorm.set(normA, 0);
  tuftNorm.set(normB, normA.length);
  tuftNorm.set(normC, normA.length * 2);

  const tuftIdx = new Uint16Array(idxA.length * 3);
  for (let i = 0; i < idxA.length; i++) tuftIdx[i] = idxA[i];
  for (let i = 0; i < idxB.length; i++) tuftIdx[idxA.length + i] = idxB[i] + vPerBlade;
  for (let i = 0; i < idxC.length; i++) tuftIdx[idxA.length * 2 + i] = idxC[i] + vPerBlade * 2;

  const tuftGeo = new THREE.BufferGeometry();
  tuftGeo.setAttribute('position', new THREE.BufferAttribute(tuftPos, 3));
  tuftGeo.setAttribute('normal', new THREE.BufferAttribute(tuftNorm, 3));
  tuftGeo.setIndex(new THREE.BufferAttribute(tuftIdx, 1));
  bladeA.dispose();
  bladeB.dispose();
  bladeC.dispose();

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const grassMesh = new THREE.InstancedMesh(tuftGeo, grassMat, MAX_GRASS);
  const grassBaseData: Array<{
    x: number;
    y: number;
    z: number;
    rotY: number;
    sx: number;
    sy: number;
    phase: number;
  }> = [];

  for (let i = 0; i < MAX_GRASS; i++) {
    const angle = i * 2.39996 + (i % 7) * 0.11;
    const radius = 3.4 + Math.sqrt(i / MAX_GRASS) * 45;
    let gx = Math.cos(angle) * radius + Math.sin(i) * 0.9;
    let gz = Math.sin(angle) * radius + Math.cos(i) * 0.9;
    if (Math.hypot(gx - WOODEN_HOUSE_POS.x, gz - WOODEN_HOUSE_POS.z) < 3.4) {
      gx += 4.8;
    }
    const item = {
      x: gx,
      y: groundHeightAt(gx, gz),
      z: gz,
      rotY: (i * 1.7) % (Math.PI * 2),
      sx: 0.8 + (i % 5) * 0.18,
      sy: 0.68 + (i % 7) * 0.15,
      phase: i * 0.37,
    };
    grassBaseData.push(item);
    _dummy.position.set(item.x, item.y, item.z);
    _dummy.rotation.set(0.06, item.rotY, 0);
    _dummy.scale.set(item.sx, item.sy, item.sx);
    _dummy.updateMatrix();
    grassMesh.setMatrixAt(i, _dummy.matrix);
  }
  grassMesh.instanceMatrix.needsUpdate = true;
  grassMesh.count = 450;
  grassMesh.computeBoundingSphere();
  group.add(grassMesh);
  disposables.push(tuftGeo, grassMat);

  let activeGrassCount = 450;
  let activeStoneCount = 18;

  function setVegetationCounts(nextGrass: number, nextStone: number) {
    activeGrassCount = isSoftwareGl
      ? Math.min(900, clampGrassCount(nextGrass))
      : clampGrassCount(nextGrass);
    activeStoneCount = clampStoneCount(nextStone);

    grassMesh.count = activeGrassCount;
    rocks.count = activeStoneCount;
    snowRocks.count = activeStoneCount;
    applySeason(currentSeason);
  }

  // 7. Fallen Autumn Leaves on Forest Floor (visible in autumn)
  const fallenCount = isSoftwareGl ? 140 : 280;
  const fallenGeo = new THREE.CircleGeometry(0.16, 5);
  fallenGeo.rotateX(-Math.PI / 2);
  const fallenMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    side: THREE.DoubleSide,
  });
  const fallenLeaves = new THREE.InstancedMesh(fallenGeo, fallenMat, fallenCount);
  for (let i = 0; i < fallenCount; i++) {
    const ang = i * 2.39996;
    const rad = 4.5 + ((i * 13) % 41);
    const lx = Math.cos(ang) * rad;
    const lz = Math.sin(ang) * rad;
    const ly = groundHeightAt(lx, lz);
    _dummy.position.set(lx, ly + 0.03, lz);
    _dummy.rotation.set(0.05, ang, 0);
    _dummy.scale.set(0.75 + (i % 4) * 0.3, 1, 0.68 + (i % 3) * 0.25);
    _dummy.updateMatrix();
    fallenLeaves.setMatrixAt(i, _dummy.matrix);
    _color.set(
      i % 4 === 0
        ? '#c74824'
        : i % 4 === 1
          ? '#df8a2b'
          : i % 4 === 2
            ? '#eab53a'
            : '#8d4323',
    );
    fallenLeaves.setColorAt(i, _color);
  }
  fallenLeaves.instanceMatrix.needsUpdate = true;
  if (fallenLeaves.instanceColor) fallenLeaves.instanceColor.needsUpdate = true;
  fallenLeaves.computeBoundingSphere();
  fallenLeaves.visible = false;
  group.add(fallenLeaves);
  disposables.push(fallenGeo, fallenMat);

  // 8. Sparse Delicate Wildflowers (kept minimal so trees and brick paths stand out cleanly)
  const flowerCount = isSoftwareGl ? 18 : 42;
  const flowerGeo = new THREE.IcosahedronGeometry(0.1, 0);
  const flowerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.0,
  });
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);
  for (let i = 0; i < flowerCount; i++) {
    const angle = i * 2.39996 + 0.5;
    const radius = 5.5 + ((i * 23) % 38);
    const fx = Math.cos(angle) * radius;
    const fz = Math.sin(angle) * radius;
    const fy = groundHeightAt(fx, fz);
    _dummy.position.set(fx, fy + 0.16, fz);
    _dummy.rotation.set(0, angle, 0);
    _dummy.scale.set(1, 0.72, 1);
    _dummy.updateMatrix();
    flowers.setMatrixAt(i, _dummy.matrix);
    _color.set(i % 3 === 0 ? '#f3e7b3' : i % 3 === 1 ? '#e8c4d1' : '#d5dff2');
    flowers.setColorAt(i, _color);
  }
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  flowers.computeBoundingSphere();
  group.add(flowers);
  disposables.push(flowerGeo, flowerMat);

  // 9. Distant Perimeter Broadleaf Woodland (NO fir trees, NO distracting low shrubs!)
  const bgTreeCount = 54;
  const bgTrunkGeo = new THREE.CylinderGeometry(0.24, 0.48, 4.6, 7);
  bgTrunkGeo.translate(0, 2.3, 0);
  const bgTrunkMat = new THREE.MeshStandardMaterial({
    color: '#4e3b2d',
    map: textures.oakBark,
    roughness: 0.92,
  });
  const bgTrunks = new THREE.InstancedMesh(bgTrunkGeo, bgTrunkMat, bgTreeCount);

  const displaceFoliageGeo = (geo: THREE.BufferGeometry, amp = 0.16) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n = 1 + Math.sin(x * 2.1 + y * 1.9) * amp + Math.cos(z * 2.3 - x * 1.7) * amp * 0.7;
      pos.setXYZ(i, x * n, y * n, z * n);
    }
    geo.computeVertexNormals();
  };

  const bgCrownGeo1 = new THREE.IcosahedronGeometry(2.8, 2);
  displaceFoliageGeo(bgCrownGeo1, 0.14);
  bgCrownGeo1.scale(1.18, 0.86, 1.15);
  bgCrownGeo1.translate(0, 5.4, 0);
  const bgCrownGeo2 = new THREE.IcosahedronGeometry(2.2, 2);
  displaceFoliageGeo(bgCrownGeo2, 0.15);
  bgCrownGeo2.scale(1.1, 0.84, 1.1);
  bgCrownGeo2.translate(0.95, 6.4, 0.6);
  const bgCrownGeo3 = new THREE.IcosahedronGeometry(2.05, 2);
  displaceFoliageGeo(bgCrownGeo3, 0.15);
  bgCrownGeo3.scale(1.1, 0.85, 1.1);
  bgCrownGeo3.translate(-0.9, 6.2, -0.5);

  const bgCrownMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.leafMap,
    roughness: 0.86,
  });
  const bgCrowns1 = new THREE.InstancedMesh(bgCrownGeo1, bgCrownMat, bgTreeCount);
  const bgCrowns2 = new THREE.InstancedMesh(bgCrownGeo2, bgCrownMat, bgTreeCount);
  const bgCrowns3 = new THREE.InstancedMesh(bgCrownGeo3, bgCrownMat, bgTreeCount);

  for (let i = 0; i < bgTreeCount; i++) {
    const angle = (i / bgTreeCount) * Math.PI * 2 + Math.sin(i * 3.1) * 0.08;
    const radius = 56 + (i % 5) * 6.5;
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    const ty = groundHeightAt(tx, tz);
    const scale = 0.9 + (i % 4) * 0.22;

    _dummy.position.set(tx, ty - 0.1, tz);
    _dummy.rotation.set(0, angle, 0);
    _dummy.scale.set(scale, scale, scale);
    _dummy.updateMatrix();
    bgTrunks.setMatrixAt(i, _dummy.matrix);
    bgCrowns1.setMatrixAt(i, _dummy.matrix);
    bgCrowns2.setMatrixAt(i, _dummy.matrix);
    bgCrowns3.setMatrixAt(i, _dummy.matrix);
  }
  bgTrunks.instanceMatrix.needsUpdate = true;
  bgCrowns1.instanceMatrix.needsUpdate = true;
  bgCrowns2.instanceMatrix.needsUpdate = true;
  bgCrowns3.instanceMatrix.needsUpdate = true;
  bgTrunks.computeBoundingSphere();
  bgCrowns1.computeBoundingSphere();
  bgCrowns2.computeBoundingSphere();
  bgCrowns3.computeBoundingSphere();
  group.add(bgTrunks);
  group.add(bgCrowns1);
  group.add(bgCrowns2);
  group.add(bgCrowns3);
  disposables.push(bgTrunkGeo, bgTrunkMat, bgCrownGeo1, bgCrownGeo2, bgCrownGeo3, bgCrownMat);

  function applySeason(season: SeasonMode) {
    currentSeason = season;
    const cArr = colorAttr.array as Float32Array;
    const winterTint = new THREE.Color('#ebf2f7');
    const autumnTint = new THREE.Color('#967642');
    const springTint = new THREE.Color('#6f9a52');

    for (let i = 0; i < vertexCount; i++) {
      _color.setRGB(baseColors[i * 3], baseColors[i * 3 + 1], baseColors[i * 3 + 2]);
      if (season === 'winter') _color.lerp(winterTint, 0.84);
      else if (season === 'autumn') _color.lerp(autumnTint, 0.42);
      else if (season === 'spring') _color.lerp(springTint, 0.24);
      cArr[i * 3] = _color.r;
      cArr[i * 3 + 1] = _color.g;
      cArr[i * 3 + 2] = _color.b;
    }
    colorAttr.needsUpdate = true;

    for (let i = 0; i < activeGrassCount; i++) {
      if (season === 'winter') _color.set(i % 2 === 0 ? '#cddadd' : '#aebfc4');
      else if (season === 'autumn') _color.set(i % 2 === 0 ? '#b69044' : '#8d733b');
      else if (season === 'spring') _color.set(i % 2 === 0 ? '#6aa049' : '#85b85d');
      else _color.set(i % 2 === 0 ? '#4d7a3d' : '#62904a');
      grassMesh.setColorAt(i, _color);
    }
    if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;

    const isWinter = season === 'winter';
    snowRocks.visible = isWinter;
    snowRoofMesh.visible = isWinter;
    centerStoneSnow.visible = isWinter;
    fallenLeaves.visible = season === 'autumn';
    flowers.visible = season === 'spring' || season === 'summer';
    colorizePathBricks(season);

    for (let i = 0; i < bgTreeCount; i++) {
      if (season === 'winter') _color.set(i % 2 === 0 ? '#788488' : '#8e9ba0');
      else if (season === 'autumn') {
        _color.set(i % 3 === 0 ? '#b55628' : i % 3 === 1 ? '#ce8831' : '#7b532c');
      } else if (season === 'spring') {
        _color.set(i % 2 === 0 ? '#507d42' : '#659452');
      } else {
        _color.set(i % 2 === 0 ? '#325232' : '#3f623d');
      }
      bgCrowns1.setColorAt(i, _color);
      _color.offsetHSL(0, 0, 0.04);
      bgCrowns2.setColorAt(i, _color);
      _color.offsetHSL(0, 0, -0.02);
      bgCrowns3.setColorAt(i, _color);
    }
    if (bgCrowns1.instanceColor) bgCrowns1.instanceColor.needsUpdate = true;
    if (bgCrowns2.instanceColor) bgCrowns2.instanceColor.needsUpdate = true;
    if (bgCrowns3.instanceColor) bgCrowns3.instanceColor.needsUpdate = true;
  }

  function applyTimeOfDay(time: TimeOfDay) {
    if (time === 'night') {
      windowGlowMat.emissiveIntensity = 1.65;
    } else if (time === 'sunset') {
      windowGlowMat.emissiveIntensity = 1.15;
    } else if (time === 'morning') {
      windowGlowMat.emissiveIntensity = 0.55;
    } else {
      windowGlowMat.emissiveIntensity = 0.2;
    }
  }

  function updateWind(elapsed: number) {
    if (isSoftwareGl || activeGrassCount === 0) return;
    for (let i = 0; i < activeGrassCount; i++) {
      const g = grassBaseData[i];
      const sway = Math.sin(elapsed * 2.0 + g.phase) * 0.16;
      _dummy.position.set(g.x, g.y, g.z);
      _dummy.rotation.set(sway, g.rotY, sway * 0.65);
      _dummy.scale.set(g.sx, g.sy, g.sx);
      _dummy.updateMatrix();
      grassMesh.setMatrixAt(i, _dummy.matrix);
    }
    grassMesh.instanceMatrix.needsUpdate = true;
  }

  // Seed initial paths & vegetation
  syncTreePaths(lastSyncedTrees);
  applySeason('summer');
  applyTimeOfDay('afternoon');

  return {
    group,
    houseCollider,
    statueCollider,
    syncTreePaths,
    setVegetationCounts,
    applySeason,
    applyTimeOfDay,
    updateWind,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
