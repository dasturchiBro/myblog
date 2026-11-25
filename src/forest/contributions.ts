import * as THREE from 'three';
import type { VisitorContributionRecord } from '../types';
import { buildAnimalInstance } from './animals';
import { groundHeightAt } from './placement';
import type { ProceduralTextureSet } from './textures';

export interface BuiltContributionInstance {
  id: number;
  kind: VisitorContributionRecord['kind'];
  animalSpecies: VisitorContributionRecord['animal_species'];
  rootGroup: THREE.Group;
  colliderMesh: THREE.Mesh;
  hoverHeight: number;
  focusYOffset: number;
  update: (elapsed: number) => void;
  dispose: () => void;
}

function displaceStoneGeometry(geo: THREE.BufferGeometry, seed: number, amp = 0.14): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const d =
      1 +
      Math.sin(vx * 3.4 + seed + vy * 2.1) * amp +
      Math.cos(vz * 3.8 - vx * 2.3 + seed * 0.7) * (amp * 0.75);
    pos.setXYZ(i, vx * d, vy * d, vz * d);
  }
  geo.computeVertexNormals();
}

export function buildContributionInstance(
  contribution: VisitorContributionRecord,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): BuiltContributionInstance {
  if (contribution.kind === 'animal') {
    const species = contribution.animal_species ?? 'rabbit';
    const builtAnimal = buildAnimalInstance(
      {
        id: contribution.id + 20000,
        species,
        name: contribution.visitor_name,
        position_x: contribution.position_x,
        position_y: contribution.position_y,
        position_z: contribution.position_z,
        rotation: contribution.rotation,
        scale: contribution.scale,
        created_at: contribution.created_at,
      },
      isSoftwareGl,
    );

    const colRadius =
      species === 'bear' ? 0.95 : species === 'wolf' ? 0.72 : species === 'bird' ? 0.52 : 0.48;
    const colHeight =
      species === 'bear' ? 1.45 : species === 'wolf' ? 1.1 : species === 'bird' ? 0.65 : 0.7;

    const colGeo = new THREE.CylinderGeometry(colRadius, colRadius, colHeight, 8);
    colGeo.translate(0, colHeight * 0.5, 0);
    const colMat = new THREE.MeshBasicMaterial({ visible: false });
    const colliderMesh = new THREE.Mesh(colGeo, colMat);
    colliderMesh.layers.set(1);
    colliderMesh.userData = {
      kind: 'contribution',
      contributionId: contribution.id,
    };
    builtAnimal.rootGroup.add(colliderMesh);

    return {
      id: contribution.id,
      kind: 'animal',
      animalSpecies: species,
      rootGroup: builtAnimal.rootGroup,
      colliderMesh,
      hoverHeight: species === 'bear' ? 1.65 : species === 'wolf' ? 1.25 : 0.85,
      focusYOffset: species === 'bear' ? 0.75 : species === 'wolf' ? 0.55 : 0.35,
      update: builtAnimal.update,
      dispose: () => {
        builtAnimal.dispose();
        colGeo.dispose();
        colMat.dispose();
      },
    };
  }

  // Sculpted natural visitor stone with subtle bronze keepsake plaque
  const rootGroup = new THREE.Group();
  const baseY = groundHeightAt(contribution.position_x, contribution.position_z);
  rootGroup.position.set(contribution.position_x, baseY, contribution.position_z);
  rootGroup.rotation.y = contribution.rotation || 0;
  const s = contribution.scale || 1;
  rootGroup.scale.setScalar(s);

  const disposables: Array<{ dispose: () => void }> = [];

  const stoneMat = new THREE.MeshStandardMaterial({
    color: '#8f9288',
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.06,
    roughness: 0.86,
    metalness: 0.04,
  });
  const mossPebbleMat = new THREE.MeshStandardMaterial({
    color: '#637158',
    map: textures.stoneMap,
    roughness: 0.9,
    metalness: 0.02,
  });
  const plaqueMat = new THREE.MeshStandardMaterial({
    color: '#b89452',
    roughness: 0.36,
    metalness: 0.72,
  });
  disposables.push(stoneMat, mossPebbleMat, plaqueMat);

  const mainGeo = new THREE.IcosahedronGeometry(0.62, isSoftwareGl ? 1 : 2);
  displaceStoneGeometry(mainGeo, contribution.id * 1.37, 0.16);
  const mainMesh = new THREE.Mesh(mainGeo, stoneMat);
  mainMesh.scale.set(1.22, 0.84, 1.02);
  mainMesh.position.set(0, 0.34, 0);
  mainMesh.castShadow = !isSoftwareGl;
  mainMesh.receiveShadow = !isSoftwareGl;
  rootGroup.add(mainMesh);
  disposables.push(mainGeo);

  const pebbleAGeo = new THREE.IcosahedronGeometry(0.28, 1);
  displaceStoneGeometry(pebbleAGeo, contribution.id * 2.1, 0.14);
  const pebbleA = new THREE.Mesh(pebbleAGeo, mossPebbleMat);
  pebbleA.scale.set(1.15, 0.72, 0.95);
  pebbleA.position.set(-0.56, 0.14, 0.28);
  pebbleA.castShadow = !isSoftwareGl;
  pebbleA.receiveShadow = !isSoftwareGl;
  rootGroup.add(pebbleA);
  disposables.push(pebbleAGeo);

  const pebbleBGeo = new THREE.IcosahedronGeometry(0.22, 1);
  displaceStoneGeometry(pebbleBGeo, contribution.id * 3.1, 0.14);
  const pebbleB = new THREE.Mesh(pebbleBGeo, stoneMat);
  pebbleB.scale.set(1.1, 0.68, 1.0);
  pebbleB.position.set(0.5, 0.11, -0.24);
  pebbleB.receiveShadow = !isSoftwareGl;
  rootGroup.add(pebbleB);
  disposables.push(pebbleBGeo);

  // Subtle golden/bronze plaque embedded on top front face to signify a visitor keepsake
  const plaqueGeo = new THREE.BoxGeometry(0.42, 0.04, 0.24);
  const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat);
  plaqueMesh.position.set(0, 0.72, 0.18);
  plaqueMesh.rotation.x = 0.28;
  rootGroup.add(plaqueMesh);
  disposables.push(plaqueGeo);

  const colGeo = new THREE.CylinderGeometry(0.85, 0.95, 1.15, 8);
  colGeo.translate(0, 0.55, 0);
  const colMat = new THREE.MeshBasicMaterial({ visible: false });
  const colliderMesh = new THREE.Mesh(colGeo, colMat);
  colliderMesh.layers.set(1);
  colliderMesh.userData = {
    kind: 'contribution',
    contributionId: contribution.id,
  };
  rootGroup.add(colliderMesh);
  disposables.push(colGeo, colMat);

  return {
    id: contribution.id,
    kind: 'stone',
    animalSpecies: null,
    rootGroup,
    colliderMesh,
    hoverHeight: 1.15,
    focusYOffset: 0.4,
    update: () => {
      // Stones rest grounded without motion
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
