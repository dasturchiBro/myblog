import * as THREE from 'three';

export interface ProceduralTextureSet {
  oakBark: THREE.CanvasTexture;
  birchBark: THREE.CanvasTexture;
  walnutBark: THREE.CanvasTexture;
  groundMap: THREE.CanvasTexture;
  groundBump: THREE.CanvasTexture;
  leafMap: THREE.CanvasTexture;
  leafBump: THREE.CanvasTexture;
  stoneMap: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  woodPlankMap: THREE.CanvasTexture;
  particleDot: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function wrapDrawCircle(
  ctx: CanvasRenderingContext2D,
  size: number,
  x: number,
  y: number,
  r: number,
  fillStyle: string,
) {
  ctx.fillStyle = fillStyle;
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Oak furrowed bark with subtle lichen flecks
  const [oakCanvas, oakCtx] = makeCanvas(256, 256);
  oakCtx.fillStyle = '#56412f';
  oakCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 320; i++) {
    const x = (i * 37) % 256;
    const y = (i * 73) % 256;
    const w = 2 + (i % 5);
    const h = 16 + (i % 44);
    oakCtx.fillStyle =
      i % 5 === 0
        ? 'rgba(104,118,86,0.22)'
        : i % 2 === 0
          ? 'rgba(34,23,15,0.48)'
          : 'rgba(128,100,76,0.28)';
    oakCtx.fillRect(x, y, w, h);
  }
  const oakBark = new THREE.CanvasTexture(oakCanvas);
  oakBark.colorSpace = THREE.SRGBColorSpace;
  oakBark.wrapS = THREE.RepeatWrapping;
  oakBark.wrapT = THREE.RepeatWrapping;
  oakBark.repeat.set(2, 3);
  oakBark.anisotropy = maxAnisotropy;

  // 2. Birch pale bark with horizontal dark lenticels
  const [birchCanvas, birchCtx] = makeCanvas(256, 256);
  birchCtx.fillStyle = '#ece7dc';
  birchCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 120; i++) {
    const x = (i * 53) % 256;
    const y = (i * 29) % 256;
    const len = 10 + (i % 28);
    birchCtx.fillStyle = i % 3 === 0 ? 'rgba(46,42,38,0.75)' : 'rgba(98,90,82,0.38)';
    birchCtx.fillRect(x, y, len, 1 + (i % 3));
  }
  const birchBark = new THREE.CanvasTexture(birchCanvas);
  birchBark.colorSpace = THREE.SRGBColorSpace;
  birchBark.wrapS = THREE.RepeatWrapping;
  birchBark.wrapT = THREE.RepeatWrapping;
  birchBark.repeat.set(1, 3);
  birchBark.anisotropy = maxAnisotropy;

  // 3. Walnut / Maple richly grooved warm dark bark
  const [walnutCanvas, walnutCtx] = makeCanvas(256, 256);
  walnutCtx.fillStyle = '#4e3b2e';
  walnutCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 240; i++) {
    const x = (i * 41) % 256;
    const y = (i * 61) % 256;
    walnutCtx.fillStyle = i % 2 === 0 ? 'rgba(30,20,14,0.45)' : 'rgba(118,92,70,0.3)';
    walnutCtx.fillRect(x, y, 4 + (i % 6), 14 + (i % 26));
  }
  const walnutBark = new THREE.CanvasTexture(walnutCanvas);
  walnutBark.colorSpace = THREE.SRGBColorSpace;
  walnutBark.wrapS = THREE.RepeatWrapping;
  walnutBark.wrapT = THREE.RepeatWrapping;
  walnutBark.repeat.set(2, 4);
  walnutBark.anisotropy = maxAnisotropy;

  // 4. Organic woodland ground albedo detail (soil, moss, clover variation)
  const [groundCanvas, groundCtx] = makeCanvas(512, 512);
  groundCtx.fillStyle = '#e7ebe1';
  groundCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 110; i++) {
    const x = (i * 173 + 29) % 512;
    const y = (i * 251 + 61) % 512;
    const r = 16 + (i % 32);
    const col =
      i % 3 === 0
        ? 'rgba(202,216,188,0.16)'
        : i % 3 === 1
          ? 'rgba(156,176,140,0.14)'
          : 'rgba(146,136,112,0.10)';
    wrapDrawCircle(groundCtx, 512, x, y, r, col);
  }
  for (let i = 0; i < 2200; i++) {
    const x = (i * 197 + 13) % 512;
    const y = (i * 313 + 47) % 512;
    const len = 3 + (i % 6);
    const ang = ((i * 37) % 100) * 0.0628;
    groundCtx.strokeStyle =
      i % 3 === 0
        ? 'rgba(126,150,108,0.22)'
        : i % 3 === 1
          ? 'rgba(238,243,228,0.18)'
          : 'rgba(142,126,96,0.15)';
    groundCtx.lineWidth = 1;
    groundCtx.beginPath();
    groundCtx.moveTo(x, y);
    groundCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    groundCtx.stroke();
  }
  const groundMap = new THREE.CanvasTexture(groundCanvas);
  groundMap.colorSpace = THREE.SRGBColorSpace;
  groundMap.wrapS = THREE.RepeatWrapping;
  groundMap.wrapT = THREE.RepeatWrapping;
  groundMap.repeat.set(16, 16);
  groundMap.anisotropy = maxAnisotropy;

  // 5. Ground grayscale bump map
  const [bumpCanvas, bumpCtx] = makeCanvas(256, 256);
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const x = (i * 89) % 256;
    const y = (i * 149) % 256;
    const shade = 90 + (i % 80);
    bumpCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    bumpCtx.fillRect(x, y, 2 + (i % 4), 2 + (i % 3));
  }
  const groundBump = new THREE.CanvasTexture(bumpCanvas);
  groundBump.colorSpace = THREE.NoColorSpace;
  groundBump.wrapS = THREE.RepeatWrapping;
  groundBump.wrapT = THREE.RepeatWrapping;
  groundBump.repeat.set(28, 28);

  // 6. Botanical Leaf Cluster Albedo & Relief Bump (fine organic foliage mottling without UV striping)
  const [leafCanvas, leafCtx] = makeCanvas(256, 256);
  leafCtx.fillStyle = '#ebebeb';
  leafCtx.fillRect(0, 0, 256, 256);
  const [leafBumpCanvas, leafBumpCtx] = makeCanvas(256, 256);
  leafBumpCtx.fillStyle = '#808080';
  leafBumpCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1400; i++) {
    const x = (i * 97 + 19) % 256;
    const y = (i * 151 + 43) % 256;
    const r = 1.5 + (i % 3);
    const bright = 216 + (i % 34);
    const mid = 186 + (i % 24);
    wrapDrawCircle(
      leafCtx,
      256,
      x,
      y,
      r,
      i % 2 === 0 ? `rgba(${bright},${bright},${bright},0.45)` : `rgba(${mid},${mid},${mid},0.42)`,
    );

    const bumpVal = i % 2 === 0 ? 175 : 105;
    wrapDrawCircle(leafBumpCtx, 256, x, y, r, `rgba(${bumpVal},${bumpVal},${bumpVal},0.55)`);
  }
  const leafMap = new THREE.CanvasTexture(leafCanvas);
  leafMap.colorSpace = THREE.SRGBColorSpace;
  leafMap.wrapS = THREE.RepeatWrapping;
  leafMap.wrapT = THREE.RepeatWrapping;
  leafMap.repeat.set(1, 1);
  leafMap.anisotropy = maxAnisotropy;

  const leafBump = new THREE.CanvasTexture(leafBumpCanvas);
  leafBump.colorSpace = THREE.NoColorSpace;
  leafBump.wrapS = THREE.RepeatWrapping;
  leafBump.wrapT = THREE.RepeatWrapping;
  leafBump.repeat.set(1, 1);

  // 7. Granite / Mossy Stone Texture & Relief Bump (fine natural mineral grain)
  const [stoneCanvas, stoneCtx] = makeCanvas(256, 256);
  stoneCtx.fillStyle = '#9fa199';
  stoneCtx.fillRect(0, 0, 256, 256);
  const [stoneBumpCanvas, stoneBumpCtx] = makeCanvas(256, 256);
  stoneBumpCtx.fillStyle = '#808080';
  stoneBumpCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1800; i++) {
    const x = (i * 83 + 11) % 256;
    const y = (i * 139 + 23) % 256;
    const r = 0.9 + (i % 3) * 0.6;
    const isMoss = i % 15 === 0;
    const col = isMoss
      ? 'rgba(92,118,74,0.22)'
      : i % 3 === 0
        ? 'rgba(220,222,216,0.26)'
        : i % 3 === 1
          ? 'rgba(72,74,70,0.24)'
          : 'rgba(130,132,126,0.22)';
    wrapDrawCircle(stoneCtx, 256, x, y, r, col);

    const bv = 85 + (i % 95);
    wrapDrawCircle(stoneBumpCtx, 256, x, y, r, `rgba(${bv},${bv},${bv},0.6)`);
  }
  const stoneMap = new THREE.CanvasTexture(stoneCanvas);
  stoneMap.colorSpace = THREE.SRGBColorSpace;
  stoneMap.wrapS = THREE.RepeatWrapping;
  stoneMap.wrapT = THREE.RepeatWrapping;
  stoneMap.anisotropy = maxAnisotropy;

  const stoneBump = new THREE.CanvasTexture(stoneBumpCanvas);
  stoneBump.colorSpace = THREE.NoColorSpace;
  stoneBump.wrapS = THREE.RepeatWrapping;
  stoneBump.wrapT = THREE.RepeatWrapping;

  // 8. Warm Timber Log / Plank Texture for Wooden House
  const [woodCanvas, woodCtx] = makeCanvas(256, 256);
  woodCtx.fillStyle = '#8d6442';
  woodCtx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    woodCtx.fillStyle = row % 2 === 0 ? '#966c48' : '#855d3c';
    woodCtx.fillRect(0, y, 256, 30);
    woodCtx.fillStyle = 'rgba(42,26,14,0.55)';
    woodCtx.fillRect(0, y + 30, 256, 2);
    for (let g = 0; g < 18; g++) {
      woodCtx.fillStyle = 'rgba(58,36,20,0.18)';
      woodCtx.fillRect((g * 37 + row * 19) % 256, y + 4 + (g % 20), 22 + (g % 30), 2);
    }
  }
  const woodPlankMap = new THREE.CanvasTexture(woodCanvas);
  woodPlankMap.colorSpace = THREE.SRGBColorSpace;
  woodPlankMap.wrapS = THREE.RepeatWrapping;
  woodPlankMap.wrapT = THREE.RepeatWrapping;
  woodPlankMap.repeat.set(2, 1);
  woodPlankMap.anisotropy = maxAnisotropy;

  // 9. Soft glowing particle dot
  const [partCanvas, partCtx] = makeCanvas(64, 64);
  const grad = partCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.68)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  partCtx.fillStyle = grad;
  partCtx.fillRect(0, 0, 64, 64);
  const particleDot = new THREE.CanvasTexture(partCanvas);
  particleDot.colorSpace = THREE.SRGBColorSpace;

  // 10. Contact shadow radial gradient
  const [shCanvas, shCtx] = makeCanvas(128, 128);
  const shGrad = shCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
  shGrad.addColorStop(0, 'rgba(18,24,18,0.55)');
  shGrad.addColorStop(0.55, 'rgba(18,24,18,0.24)');
  shGrad.addColorStop(1, 'rgba(18,24,18,0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(shCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;

  return {
    oakBark,
    birchBark,
    walnutBark,
    groundMap,
    groundBump,
    leafMap,
    leafBump,
    stoneMap,
    stoneBump,
    woodPlankMap,
    particleDot,
    contactShadow,
    dispose: () => {
      oakBark.dispose();
      birchBark.dispose();
      walnutBark.dispose();
      groundMap.dispose();
      groundBump.dispose();
      leafMap.dispose();
      leafBump.dispose();
      stoneMap.dispose();
      stoneBump.dispose();
      woodPlankMap.dispose();
      particleDot.dispose();
      contactShadow.dispose();
    },
  };
}
