import * as THREE from "three";

// Head is 0.7 wide (x), 0.7 tall (y), 0.6 deep (z). Forward face is +Z.
// Adds simple toon eyes + pupils + smile to a head mesh.
export function addFace(head, opts = {}) {
  const skin = opts.skin ?? 0xFFCBA4;
  const eyeWhite = 0xffffff;
  const pupil = 0x1a1a2e;
  const mouth = 0x6B2D2D;
  const blush = 0xff9aa2;

  const front = -0.301; // forward is local -Z (player walks toward -Z on W)
  const eyeY = 0.05;
  const eyeX = 0.16;

  // Eye whites
  const eyeGeo = new THREE.BoxGeometry(0.18, 0.14, 0.02);
  const eyeMat = new THREE.MeshBasicMaterial({ color: eyeWhite });
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-eyeX, eyeY, front);
  eyeR.position.set( eyeX, eyeY, front);
  head.add(eyeL); head.add(eyeR);

  // Pupils
  const pGeo = new THREE.BoxGeometry(0.07, 0.09, 0.02);
  const pMat = new THREE.MeshBasicMaterial({ color: pupil });
  const pupL = new THREE.Mesh(pGeo, pMat);
  const pupR = new THREE.Mesh(pGeo, pMat);
  pupL.position.set(-eyeX + 0.015, eyeY, front - 0.011);
  pupR.position.set( eyeX + 0.015, eyeY, front - 0.011);
  head.add(pupL); head.add(pupR);

  // Eyebrows
  const browGeo = new THREE.BoxGeometry(0.2, 0.04, 0.02);
  const browMat = new THREE.MeshBasicMaterial({ color: 0x2b1d12 });
  const browL = new THREE.Mesh(browGeo, browMat);
  const browR = new THREE.Mesh(browGeo, browMat);
  browL.position.set(-eyeX, eyeY + 0.13, front);
  browR.position.set( eyeX, eyeY + 0.13, front);
  head.add(browL); head.add(browR);

  // Smile — three little segments shaped into a curve
  const smileMat = new THREE.MeshBasicMaterial({ color: mouth });
  const segGeo = new THREE.BoxGeometry(0.09, 0.04, 0.02);
  const mid = new THREE.Mesh(segGeo, smileMat);
  mid.position.set(0, -0.18, front);
  const left = new THREE.Mesh(segGeo, smileMat);
  left.position.set(-0.08, -0.16, front);
  left.rotation.z =  0.5;
  const right = new THREE.Mesh(segGeo, smileMat);
  right.position.set(0.08, -0.16, front);
  right.rotation.z = -0.5;
  head.add(mid); head.add(left); head.add(right);

  // Cheeks (subtle)
  const cheekGeo = new THREE.BoxGeometry(0.09, 0.05, 0.02);
  const cheekMat = new THREE.MeshBasicMaterial({ color: blush, transparent: true, opacity: 0.55 });
  const cheekL = new THREE.Mesh(cheekGeo, cheekMat);
  const cheekR = new THREE.Mesh(cheekGeo, cheekMat);
  cheekL.position.set(-0.22, -0.05, front);
  cheekR.position.set( 0.22, -0.05, front);
  head.add(cheekL); head.add(cheekR);

  return { eyeL, eyeR, pupL, pupR };
}
