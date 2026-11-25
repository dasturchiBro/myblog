import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { SeasonMode, TimeOfDay } from '../types';

export interface AtmosphereRig {
  skyMesh: THREE.Mesh;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  rimLight: THREE.DirectionalLight;
  particles: THREE.Points;
  particlePositions: Float32Array;
  particleVelocities: Float32Array;
  updateConfig: (time: TimeOfDay, season: SeasonMode) => void;
  updateParticles: (dt: number, elapsed: number, season: SeasonMode, time: TimeOfDay) => void;
  dispose: () => void;
}

interface TimePreset {
  zenith: string;
  horizon: string;
  fog: string;
  fogDensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  rimColor: string;
  rimIntensity: number;
  exposure: number;
}

const TIME_PRESETS: Record<TimeOfDay, TimePreset> = {
  morning: {
    zenith: '#7da8c9',
    horizon: '#f3dfc1',
    fog: '#eadcc7',
    fogDensity: 0.0085,
    sunColor: '#ffe3b3',
    sunIntensity: 2.05,
    sunPos: [48, 32, 34],
    hemiSky: '#c6dff2',
    hemiGround: '#5d6b4e',
    hemiIntensity: 0.85,
    rimColor: '#ffd4a3',
    rimIntensity: 0.45,
    exposure: 1.08,
  },
  afternoon: {
    zenith: '#5b8ec4',
    horizon: '#dce8df',
    fog: '#d7e3d8',
    fogDensity: 0.0072,
    sunColor: '#fff2d6',
    sunIntensity: 2.35,
    sunPos: [44, 58, 28],
    hemiSky: '#b7d6ec',
    hemiGround: '#4a5c3c',
    hemiIntensity: 0.9,
    rimColor: '#dff0ff',
    rimIntensity: 0.4,
    exposure: 1.1,
  },
  sunset: {
    zenith: '#4a5678',
    horizon: '#e8a57a',
    fog: '#d59f82',
    fogDensity: 0.009,
    sunColor: '#ff9e5e',
    sunIntensity: 2.1,
    sunPos: [-58, 18, -28],
    hemiSky: '#b48fa8',
    hemiGround: '#4a3c2f',
    hemiIntensity: 0.72,
    rimColor: '#ffb57a',
    rimIntensity: 0.6,
    exposure: 1.05,
  },
  night: {
    zenith: '#111a2c',
    horizon: '#243547',
    fog: '#1e2c3b',
    fogDensity: 0.011,
    sunColor: '#9fc0e8',
    sunIntensity: 0.95,
    sunPos: [-32, 46, 40],
    hemiSky: '#3b5375',
    hemiGround: '#1a241d',
    hemiIntensity: 0.65,
    rimColor: '#7ba4d9',
    rimIntensity: 0.45,
    exposure: 0.95,
  },
};

export function createAtmosphereRig(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  particleTex: THREE.Texture,
  isSoftwareGl: boolean,
): AtmosphereRig {
  // Mandatory studio PMREM environment for balanced PBR reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.35;
  pmremGenerator.dispose();

  // Gradient sky dome shader
  const skyUniforms = {
    topColor: { value: new THREE.Color('#5b8ec4') },
    bottomColor: { value: new THREE.Color('#dce8df') },
    offset: { value: 12 },
    exponent: { value: 0.65 },
  };
  const skyGeo = new THREE.SphereGeometry(180, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);

  // Warm key directional light + tight shadow frustum
  const sunLight = new THREE.DirectionalLight(0xfff2d6, 2.35);
  sunLight.position.set(44, 58, 28);
  sunLight.castShadow = !isSoftwareGl;
  if (!isSoftwareGl) {
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 160;
    const d = 52;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.025;
  }
  scene.add(sunLight);

  // Cool/natural sky-ground fill light
  const hemiLight = new THREE.HemisphereLight(0xb7d6ec, 0x4a5c3c, 0.9);
  hemiLight.position.set(0, 60, 0);
  scene.add(hemiLight);

  // Subtle rim light for canopy depth
  const rimLight = new THREE.DirectionalLight(0xdff0ff, 0.4);
  rimLight.position.set(-40, 24, -40);
  scene.add(rimLight);

  // Horizon-matched exponential fog
  const fog = new THREE.FogExp2('#d7e3d8', 0.0072);
  scene.fog = fog;
  scene.background = new THREE.Color('#d7e3d8');

  // Atmospheric floating particles (pollen, blossoms, autumn leaves, snow, or night fireflies)
  const particleCount = isSoftwareGl ? 90 : 220;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleVelocities = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 90;
    particlePositions[i * 3 + 1] = 0.8 + Math.random() * 14;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 90;
    particleVelocities[i * 3] = (Math.random() - 0.5) * 0.45;
    particleVelocities[i * 3 + 1] = -0.15 - Math.random() * 0.35;
    particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.45;
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particleMat = new THREE.PointsMaterial({
    map: particleTex,
    color: 0xfff8dc,
    size: 0.38,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  function updateConfig(time: TimeOfDay, season: SeasonMode) {
    const preset = TIME_PRESETS[time];
    const zenithColor = new THREE.Color(preset.zenith);
    const horizonColor = new THREE.Color(preset.horizon);
    const fogColor = new THREE.Color(preset.fog);

    if (season === 'winter') {
      horizonColor.lerp(new THREE.Color('#e8eff5'), 0.38);
      fogColor.lerp(new THREE.Color('#dfe8f0'), 0.4);
    } else if (season === 'autumn' && time !== 'night') {
      horizonColor.lerp(new THREE.Color('#ecd2b2'), 0.28);
      fogColor.lerp(new THREE.Color('#e2cbb0'), 0.25);
    }

    skyUniforms.topColor.value.copy(zenithColor);
    skyUniforms.bottomColor.value.copy(horizonColor);
    fog.color.copy(fogColor);
    fog.density = season === 'winter' ? preset.fogDensity * 1.15 : preset.fogDensity;
    (scene.background as THREE.Color).copy(fogColor);

    sunLight.color.set(preset.sunColor);
    sunLight.intensity = preset.sunIntensity;
    sunLight.position.set(...preset.sunPos);

    hemiLight.color.set(preset.hemiSky);
    hemiLight.groundColor.set(preset.hemiGround);
    hemiLight.intensity = preset.hemiIntensity;

    rimLight.color.set(preset.rimColor);
    rimLight.intensity = preset.rimIntensity;
    renderer.toneMappingExposure = preset.exposure;

    if (time === 'night') {
      particleMat.color.set('#d8f59a');
      particleMat.size = 0.42;
      particleMat.opacity = 0.8;
    } else if (season === 'winter') {
      particleMat.color.set('#ffffff');
      particleMat.size = 0.46;
      particleMat.opacity = 0.82;
    } else if (season === 'autumn') {
      particleMat.color.set('#d9843b');
      particleMat.size = 0.44;
      particleMat.opacity = 0.72;
    } else if (season === 'spring') {
      particleMat.color.set('#f8d7df');
      particleMat.size = 0.38;
      particleMat.opacity = 0.7;
    } else {
      particleMat.color.set('#f7f1d0');
      particleMat.size = 0.3;
      particleMat.opacity = 0.52;
    }
  }

  function updateParticles(dt: number, elapsed: number, season: SeasonMode, time: TimeOfDay) {
    const pos = particleGeo.attributes.position as THREE.BufferAttribute;
    const isSnowOrAutumn = season === 'winter' || season === 'autumn';
    const verticalMul = time === 'night' ? -0.15 : isSnowOrAutumn ? 1.7 : 0.45;

    for (let i = 0; i < particleCount; i++) {
      const ix = i * 3;
      let x = particlePositions[ix] + (particleVelocities[ix] + Math.sin(elapsed * 0.7 + i) * 0.2) * dt;
      let y = particlePositions[ix + 1] + particleVelocities[ix + 1] * verticalMul * dt;
      let z = particlePositions[ix + 2] + (particleVelocities[ix + 2] + Math.cos(elapsed * 0.6 + i) * 0.2) * dt;

      if (y < 0.4) y = 14 + Math.random() * 2;
      if (y > 16) y = 0.6;
      if (x > 46) x = -46;
      if (x < -46) x = 46;
      if (z > 46) z = -46;
      if (z < -46) z = 46;

      particlePositions[ix] = x;
      particlePositions[ix + 1] = y;
      particlePositions[ix + 2] = z;
    }
    pos.needsUpdate = true;
  }

  updateConfig('afternoon', 'summer');

  return {
    skyMesh,
    sunLight,
    hemiLight,
    rimLight,
    particles,
    particlePositions,
    particleVelocities,
    updateConfig,
    updateParticles,
    dispose: () => {
      skyGeo.dispose();
      skyMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      envRT.dispose();
    },
  };
}
