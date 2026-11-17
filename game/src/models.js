// Halcyon Bay — low-poly vehicle and person models built from boxes and
// cylinders, with headlights, taillights and a police light bar.
// Written from scratch for this entry.
import * as THREE from '../vendor/three.module.min.js';

const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);

export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181d });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x1c2836, shininess: 90, specular: 0x88aacc });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(1.9, 0.62, 4.3);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(bodyGeo, opts.police ? new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }) : glassMat);
  cabin.scale.set(1.7, 0.55, 2.1);
  cabin.position.set(0, 1.1, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  // Wheels.
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  // Headlights (front = -z in our car space... we drive along -z? No: forward is +z
  // after we rotate the group; keep lights at both ends and mark the front).
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.25 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0xcc2222, emissiveIntensity: 0.35 });
  for (const s of [-0.62, 0.62]) {
    const h = new THREE.Mesh(bodyGeo, headMat);
    h.scale.set(0.42, 0.18, 0.08);
    h.position.set(s, 0.62, -2.16);
    g.add(h);
    const t = new THREE.Mesh(bodyGeo, tailMat);
    t.scale.set(0.42, 0.18, 0.08);
    t.position.set(s, 0.62, 2.16);
    g.add(t);
  }
  // Bumpers.
  const bump = new THREE.Mesh(bodyGeo, darkMat);
  bump.scale.set(1.92, 0.2, 0.18);
  bump.position.set(0, 0.32, -2.18);
  g.add(bump);
  const bump2 = bump.clone();
  bump2.position.z = 2.18;
  g.add(bump2);
  let lightBar = null;
  if (opts.police) {
    const bar = new THREE.Group();
    const redMat = new THREE.MeshLambertMaterial({ color: 0xcc1111, emissive: 0xff2222, emissiveIntensity: 1 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2222cc, emissive: 0x3333ff, emissiveIntensity: 1 });
    const r = new THREE.Mesh(bodyGeo, redMat);
    r.scale.set(0.55, 0.22, 0.5); r.position.x = -0.35;
    const b = new THREE.Mesh(bodyGeo, blueMat);
    b.scale.set(0.55, 0.22, 0.5); b.position.x = 0.35;
    bar.add(r, b);
    bar.position.set(0, 1.5, -0.25);
    g.add(bar);
    lightBar = { red: redMat, blue: blueMat, phase: Math.random() * 2 };
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffd21f, emissive: 0xffc21f, emissiveIntensity: 0.4 }));
    sign.scale.set(0.7, 0.22, 0.4);
    sign.position.set(0, 1.5, -0.25);
    g.add(sign);
  }
  g.userData = { wheels, headMat, tailMat, lightBar, color, isCar: true };
  return g;
}

export function makePersonMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(bodyGeo, shirtMat);
  torso.scale.set(0.62, 0.72, 0.34);
  torso.position.y = 1.12;
  torso.castShadow = true;
  const head = new THREE.Mesh(bodyGeo, skinMat);
  head.scale.set(0.34, 0.36, 0.34);
  head.position.y = 1.68;
  head.castShadow = true;
  const hair = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0x241a12 }));
  hair.scale.set(0.36, 0.12, 0.36);
  hair.position.y = 1.88;
  const legL = new THREE.Mesh(bodyGeo, pantsMat);
  legL.scale.set(0.24, 0.72, 0.26);
  legL.position.set(-0.17, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.17;
  const armL = new THREE.Mesh(bodyGeo, shirtMat);
  armL.scale.set(0.18, 0.62, 0.2);
  armL.position.set(-0.42, 1.12, 0);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(torso, head, hair, legL, legR, armL, armR);
  g.userData = { legL, legR, armL, armR, torso, head, isPed: true };
  return g;
}

// Simple pistol mesh held in the right hand.
export function makePistolMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x1a1d22 });
  const barrel = new THREE.Mesh(bodyGeo, mat);
  barrel.scale.set(0.07, 0.09, 0.34);
  barrel.position.set(0, 0.02, -0.14);
  const grip = new THREE.Mesh(bodyGeo, mat);
  grip.scale.set(0.07, 0.2, 0.09);
  grip.position.set(0, -0.1, 0.02);
  g.add(barrel, grip);
  return g;
}

export function makeHelicopterMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1d2733 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(2.2, 1.4, 4.6);
  body.position.y = 0;
  body.castShadow = true;
  const tail = new THREE.Mesh(bodyGeo, bodyMat);
  tail.scale.set(0.7, 0.7, 4.4);
  tail.position.set(0, 0.3, 4.2);
  const fin = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xb03a2e }));
  fin.scale.set(0.2, 1.6, 1.2);
  fin.position.set(0, 0.9, 6.2);
  const rotor = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0x222222 }));
  rotor.scale.set(11, 0.08, 0.5);
  rotor.position.y = 1.0;
  const rotor2 = rotor.clone();
  rotor2.rotation.y = Math.PI / 2;
  const skidL = new THREE.Mesh(bodyGeo, bodyMat);
  skidL.scale.set(0.18, 0.18, 3.4);
  skidL.position.set(-0.9, -1.0, 0);
  const skidR = skidL.clone();
  skidR.position.x = 0.9;
  const spotMat = new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: 0xffe9a0, emissiveIntensity: 0.8 });
  const spot = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), spotMat);
  spot.position.set(0, -0.8, -1.8);
  g.add(body, tail, fin, rotor, rotor2, skidL, skidR, spot);
  g.userData = { rotor, rotor2 };
  return g;
}
