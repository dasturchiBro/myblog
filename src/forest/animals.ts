import * as THREE from 'three';
import type { AnimalRecord } from '../types';
import { groundHeightAt } from './placement';

export interface BuiltAnimalInstance {
  id: number;
  species: AnimalRecord['species'];
  rootGroup: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
}

export function buildAnimalInstance(
  animal: AnimalRecord,
  isSoftwareGl: boolean,
): BuiltAnimalInstance {
  const rootGroup = new THREE.Group();
  const pivot = new THREE.Group();
  const baseScale = animal.scale || 1;
  pivot.scale.setScalar(baseScale);
  rootGroup.add(pivot);

  const disposables: Array<{ dispose: () => void }> = [];
  const baseX = animal.position_x;
  const baseZ = animal.position_z;
  const baseRot = animal.rotation || 0;
  const phase = animal.id * 1.73;

  // Helpers
  const mkMat = (color: string, roughness = 0.85) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
    disposables.push(m);
    return m;
  };

  let leftWing: THREE.Mesh | null = null;
  let rightWing: THREE.Mesh | null = null;
  const legs: THREE.Mesh[] = [];
  let headGroup: THREE.Group | null = null;

  if (animal.species === 'rabbit') {
    const furMat = mkMat('#d6cbb8', 0.9);
    const innerEarMat = mkMat('#dfb2b0', 0.85);
    const darkEyeMat = mkMat('#1f1d1a', 0.3);
    const tailMat = mkMat('#f7f4ee', 0.95);

    // Body
    const bodyGeo = new THREE.SphereGeometry(0.24, 12, 10);
    bodyGeo.scale(0.95, 0.85, 1.35);
    const body = new THREE.Mesh(bodyGeo, furMat);
    body.position.set(0, 0.22, 0);
    body.castShadow = !isSoftwareGl;
    pivot.add(body);
    disposables.push(bodyGeo);

    // Haunches
    const haunchGeo = new THREE.SphereGeometry(0.16, 10, 8);
    haunchGeo.scale(1.15, 0.95, 1.1);
    const haunch = new THREE.Mesh(haunchGeo, furMat);
    haunch.position.set(0, 0.16, -0.18);
    pivot.add(haunch);
    disposables.push(haunchGeo);

    // Fluffy tail
    const tailGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.position.set(0, 0.19, -0.34);
    pivot.add(tail);
    disposables.push(tailGeo);

    // Head + Ears
    headGroup = new THREE.Group();
    headGroup.position.set(0, 0.36, 0.24);
    pivot.add(headGroup);

    const headGeo = new THREE.SphereGeometry(0.14, 10, 10);
    headGeo.scale(0.95, 0.95, 1.15);
    const head = new THREE.Mesh(headGeo, furMat);
    headGroup.add(head);
    disposables.push(headGeo);

    const earGeo = new THREE.CapsuleGeometry(0.032, 0.18, 4, 8);
    const innerGeo = new THREE.CapsuleGeometry(0.018, 0.13, 4, 6);
    const eyeGeo = new THREE.SphereGeometry(0.02, 6, 6);
    disposables.push(earGeo, innerGeo, eyeGeo);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, furMat);
      ear.position.set(side * 0.06, 0.2, -0.02);
      ear.rotation.z = -side * 0.18;
      ear.rotation.x = -0.18;
      headGroup.add(ear);

      const inner = new THREE.Mesh(innerGeo, innerEarMat);
      inner.position.set(side * 0.06, 0.19, 0.005);
      inner.rotation.z = -side * 0.18;
      inner.rotation.x = -0.18;
      headGroup.add(inner);

      const eye = new THREE.Mesh(eyeGeo, darkEyeMat);
      eye.position.set(side * 0.085, 0.03, 0.1);
      headGroup.add(eye);
    }

    // Front paws
    const pawGeo = new THREE.CapsuleGeometry(0.04, 0.12, 4, 6);
    disposables.push(pawGeo);
    for (const side of [-1, 1]) {
      const paw = new THREE.Mesh(pawGeo, furMat);
      paw.position.set(side * 0.09, 0.09, 0.2);
      pivot.add(paw);
    }
  } else if (animal.species === 'bird') {
    const featherMat = mkMat('#5b6f86', 0.72);
    const breastMat = mkMat('#d98f57', 0.78);
    const wingMat = mkMat('#425366', 0.72);
    const beakMat = mkMat('#d6a847', 0.5);

    const bodyGeo = new THREE.SphereGeometry(0.14, 10, 8);
    bodyGeo.scale(0.85, 0.85, 1.45);
    const body = new THREE.Mesh(bodyGeo, featherMat);
    pivot.add(body);
    disposables.push(bodyGeo);

    const breastGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const breast = new THREE.Mesh(breastGeo, breastMat);
    breast.position.set(0, -0.03, 0.07);
    pivot.add(breast);
    disposables.push(breastGeo);

    const headGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const head = new THREE.Mesh(headGeo, featherMat);
    head.position.set(0, 0.08, 0.17);
    pivot.add(head);
    disposables.push(headGeo);

    const beakGeo = new THREE.ConeGeometry(0.025, 0.09, 5);
    beakGeo.rotateX(Math.PI / 2);
    const beak = new THREE.Mesh(beakGeo, beakMat);
    beak.position.set(0, 0.07, 0.27);
    pivot.add(beak);
    disposables.push(beakGeo);

    const tailGeo = new THREE.BoxGeometry(0.1, 0.02, 0.18);
    const tail = new THREE.Mesh(tailGeo, wingMat);
    tail.position.set(0, 0.02, -0.22);
    tail.rotation.x = 0.2;
    pivot.add(tail);
    disposables.push(tailGeo);

    const wingGeo = new THREE.BoxGeometry(0.32, 0.018, 0.14);
    disposables.push(wingGeo);

    const lwGeo = wingGeo.clone();
    lwGeo.translate(-0.16, 0, 0);
    leftWing = new THREE.Mesh(lwGeo, wingMat);
    leftWing.position.set(-0.08, 0.04, 0.02);
    pivot.add(leftWing);
    disposables.push(lwGeo);

    const rwGeo = wingGeo.clone();
    rwGeo.translate(0.16, 0, 0);
    rightWing = new THREE.Mesh(rwGeo, wingMat);
    rightWing.position.set(0.08, 0.04, 0.02);
    pivot.add(rightWing);
    disposables.push(rwGeo);
  } else if (animal.species === 'bear') {
    const coatMat = mkMat('#5b402d', 0.92);
    const muzzleMat = mkMat('#8a684c', 0.88);
    const noseMat = mkMat('#1c1714', 0.4);

    // Broad bear torso + shoulder hump
    const torsoGeo = new THREE.CapsuleGeometry(0.46, 0.72, 6, 12);
    torsoGeo.rotateX(Math.PI / 2);
    torsoGeo.scale(1.05, 0.98, 1.0);
    const torso = new THREE.Mesh(torsoGeo, coatMat);
    torso.position.set(0, 0.68, 0);
    torso.castShadow = !isSoftwareGl;
    pivot.add(torso);
    disposables.push(torsoGeo);

    const humpGeo = new THREE.SphereGeometry(0.34, 10, 8);
    const hump = new THREE.Mesh(humpGeo, coatMat);
    hump.position.set(0, 0.92, 0.25);
    pivot.add(hump);
    disposables.push(humpGeo);

    // Stubby tail
    const tailGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const tail = new THREE.Mesh(tailGeo, coatMat);
    tail.position.set(0, 0.72, -0.68);
    pivot.add(tail);
    disposables.push(tailGeo);

    // Bear head
    headGroup = new THREE.Group();
    headGroup.position.set(0, 0.86, 0.66);
    pivot.add(headGroup);

    const headGeo = new THREE.SphereGeometry(0.3, 12, 10);
    const head = new THREE.Mesh(headGeo, coatMat);
    head.castShadow = !isSoftwareGl;
    headGroup.add(head);
    disposables.push(headGeo);

    const snoutGeo = new THREE.CapsuleGeometry(0.13, 0.14, 4, 8);
    snoutGeo.rotateX(Math.PI / 2);
    const snout = new THREE.Mesh(snoutGeo, muzzleMat);
    snout.position.set(0, -0.05, 0.26);
    headGroup.add(snout);
    disposables.push(snoutGeo);

    const noseGeo = new THREE.SphereGeometry(0.055, 8, 8);
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, -0.01, 0.39);
    headGroup.add(nose);
    disposables.push(noseGeo);

    const earGeo = new THREE.SphereGeometry(0.09, 8, 8);
    disposables.push(earGeo);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, coatMat);
      ear.position.set(side * 0.21, 0.22, -0.02);
      headGroup.add(ear);
    }

    // 4 stout legs
    const legGeo = new THREE.CapsuleGeometry(0.14, 0.36, 4, 8);
    legGeo.translate(0, -0.22, 0);
    disposables.push(legGeo);
    const legOffsets: Array<[number, number]> = [
      [-0.26, 0.36],
      [0.26, 0.36],
      [-0.26, -0.38],
      [0.26, -0.38],
    ];
    for (const [lx, lz] of legOffsets) {
      const leg = new THREE.Mesh(legGeo, coatMat);
      leg.position.set(lx, 0.48, lz);
      leg.castShadow = !isSoftwareGl;
      pivot.add(leg);
      legs.push(leg);
    }
  } else {
    // Wolf: sleek silver-grey timber wolf
    const furMat = mkMat('#767b80', 0.86);
    const bellyMat = mkMat('#c5c6c0', 0.88);
    const darkMat = mkMat('#383b40', 0.82);

    const torsoGeo = new THREE.CapsuleGeometry(0.24, 0.62, 6, 10);
    torsoGeo.rotateX(Math.PI / 2);
    const torso = new THREE.Mesh(torsoGeo, furMat);
    torso.position.set(0, 0.56, 0);
    torso.castShadow = !isSoftwareGl;
    pivot.add(torso);
    disposables.push(torsoGeo);

    const ruffGeo = new THREE.SphereGeometry(0.26, 10, 8);
    const ruff = new THREE.Mesh(ruffGeo, bellyMat);
    ruff.position.set(0, 0.58, 0.28);
    pivot.add(ruff);
    disposables.push(ruffGeo);

    const tailGeo = new THREE.ConeGeometry(0.085, 0.46, 7);
    tailGeo.rotateX(-2.15);
    const tail = new THREE.Mesh(tailGeo, darkMat);
    tail.position.set(0, 0.5, -0.56);
    pivot.add(tail);
    disposables.push(tailGeo);

    headGroup = new THREE.Group();
    headGroup.position.set(0, 0.72, 0.48);
    pivot.add(headGroup);

    const headGeo = new THREE.SphereGeometry(0.18, 10, 10);
    const head = new THREE.Mesh(headGeo, furMat);
    headGroup.add(head);
    disposables.push(headGeo);

    const muzzleGeo = new THREE.ConeGeometry(0.095, 0.26, 7);
    muzzleGeo.rotateX(Math.PI / 2);
    const muzzle = new THREE.Mesh(muzzleGeo, bellyMat);
    muzzle.position.set(0, -0.03, 0.2);
    headGroup.add(muzzle);
    disposables.push(muzzleGeo);

    const earGeo = new THREE.ConeGeometry(0.055, 0.14, 5);
    disposables.push(earGeo);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, darkMat);
      ear.position.set(side * 0.1, 0.17, -0.02);
      headGroup.add(ear);
    }

    const legGeo = new THREE.CapsuleGeometry(0.065, 0.38, 4, 8);
    legGeo.translate(0, -0.22, 0);
    disposables.push(legGeo);
    const legOffsets: Array<[number, number]> = [
      [-0.14, 0.28],
      [0.14, 0.28],
      [-0.14, -0.3],
      [0.14, -0.3],
    ];
    for (const [lx, lz] of legOffsets) {
      const leg = new THREE.Mesh(legGeo, furMat);
      leg.position.set(lx, 0.46, lz);
      leg.castShadow = !isSoftwareGl;
      pivot.add(leg);
      legs.push(leg);
    }
  }

  function update(elapsed: number) {
    if (animal.species === 'bird') {
      const orbitR = 2.8 + (animal.id % 3) * 1.1;
      const speed = 0.45 + (animal.id % 4) * 0.08;
      const a = elapsed * speed + phase;
      const nx = baseX + Math.cos(a) * orbitR;
      const nz = baseZ + Math.sin(a) * orbitR;
      const ny =
        Math.max(groundHeightAt(nx, nz) + 4.5, animal.position_y) +
        Math.sin(elapsed * 1.4 + phase) * 0.45;
      rootGroup.position.set(nx, ny, nz);
      rootGroup.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
      if (leftWing && rightWing) {
        const flap = Math.sin(elapsed * 7.5 + phase) * 0.55;
        leftWing.rotation.z = flap;
        rightWing.rotation.z = -flap;
      }
      return;
    }

    if (animal.species === 'rabbit') {
      const roamR = 1.4;
      const t = elapsed * 0.55 + phase;
      const nx = baseX + Math.cos(t) * roamR;
      const nz = baseZ + Math.sin(t) * roamR;
      const hopPhase = Math.max(0, Math.sin(elapsed * 3.8 + phase));
      const hopY = Math.pow(hopPhase, 1.4) * 0.22;
      rootGroup.position.set(nx, groundHeightAt(nx, nz) + hopY, nz);
      rootGroup.rotation.y = Math.atan2(-Math.sin(t), Math.cos(t));
      if (headGroup) {
        headGroup.rotation.x = Math.sin(elapsed * 2.2 + phase) * 0.08;
      }
      return;
    }

    // Bear & Wolf slow patrol arc
    const roamR = animal.species === 'bear' ? 2.6 : 3.4;
    const speed = animal.species === 'bear' ? 0.16 : 0.28;
    const t = elapsed * speed + phase;
    const nx = baseX + Math.cos(t) * roamR;
    const nz = baseZ + Math.sin(t * 0.85) * roamR;
    const dx = -Math.sin(t) * speed * roamR;
    const dz = Math.cos(t * 0.85) * 0.85 * speed * roamR;
    rootGroup.position.set(nx, groundHeightAt(nx, nz), nz);
    rootGroup.rotation.y = elapsed === 0 ? baseRot : Math.atan2(dx, dz);

    const gait = Math.sin(elapsed * (animal.species === 'bear' ? 2.6 : 4.2) + phase) * 0.32;
    if (legs.length === 4) {
      legs[0].rotation.x = gait;
      legs[3].rotation.x = gait;
      legs[1].rotation.x = -gait;
      legs[2].rotation.x = -gait;
    }
    if (headGroup) {
      headGroup.rotation.y = Math.sin(elapsed * 0.8 + phase) * 0.18;
    }
  }

  update(0);

  return {
    id: animal.id,
    species: animal.species,
    rootGroup,
    update,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
