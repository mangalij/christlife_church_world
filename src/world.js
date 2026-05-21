import * as THREE from "three";

function makeBox(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshToonMaterial({ color })
  );
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeFloor(w, d, color, x, z, y = 0.02) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

function makeGlass(w, h, color, x, y, z, rotY = 0) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  return mesh;
}

export function makePew(x, z) {
  const group = new THREE.Group();
  const seat = makeBox(3, 0.2, 0.8, 0x8B4513, 0, 0.6, 0);
  // back faces +z (toward the exit) so people sitting on the seat face -z (toward the pulpit)
  const back = makeBox(3, 0.8, 0.15, 0x8B4513, 0, 0.85, 0.35);
  const legL = makeBox(0.15, 0.6, 0.7, 0x6B3410, -1.35, 0, 0);
  const legR = makeBox(0.15, 0.6, 0.7, 0x6B3410,  1.35, 0, 0);
  group.add(seat, back, legL, legR);
  group.position.set(x, 0, z);
  return group;
}

function makeTree(x, z) {
  const trunk = makeBox(0.4, 2, 0.4, 0x8B6914, x, 0, z);
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 8, 6),
    new THREE.MeshToonMaterial({ color: 0x228B22 })
  );
  top.position.set(x, 2.8, z);
  top.castShadow = true;
  return { trunk, top };
}

// Builds a small indoor baptismal pool — tiled basin with shimmering water,
// stone steps, flanking candles, and a cross banner. Sits behind the
// sanctuary between the Prayer Room and Pastor's Office. Purely decorative
// (no colliders) — interaction is handled by src/baptism.js.
function buildBaptismPool(scene, add, zones) {
  const CX = 0, CZ = -55;
  const W = 4, D = 5;          // pool footprint
  const RIM_H = 0.5;           // pool wall height above the surrounding floor
  const m = c => new THREE.MeshToonMaterial({ color: c });

  // Tile floor surrounding the pool
  add(makeFloor(W + 4, D + 3, 0xE8DCC0, CX, CZ, 0.02));
  // Recessed basin (a darker tile floor at slight depth)
  add(makeFloor(W,     D,     0x2E6FAE, CX, CZ, 0.04));
  // Pool walls (low coping around the basin)
  add(makeBox(W + 0.4, RIM_H, 0.3, 0xDED2A8, CX, 0, CZ - D / 2));      // north
  // South wall split with a step gap (entry from the south)
  add(makeBox(1.2, RIM_H, 0.3, 0xDED2A8, CX - 1.4, 0, CZ + D / 2));
  add(makeBox(1.2, RIM_H, 0.3, 0xDED2A8, CX + 1.4, 0, CZ + D / 2));
  add(makeBox(0.3, RIM_H, D,   0xDED2A8, CX - W / 2, 0, CZ));          // west
  add(makeBox(0.3, RIM_H, D,   0xDED2A8, CX + W / 2, 0, CZ));          // east
  // Two tile steps leading in from the south
  add(makeBox(1.8, 0.15, 0.6, 0xC9BC92, CX, 0, CZ + D / 2 + 0.4));
  add(makeBox(2.4, 0.08, 0.8, 0xB9AC82, CX, 0, CZ + D / 2 + 1.1));

  // Shimmering water surface — translucent layered planes
  const waterGeom = new THREE.PlaneGeometry(W - 0.4, D - 0.4);
  const water = new THREE.Mesh(
    waterGeom,
    new THREE.MeshBasicMaterial({
      color: 0x6FB8E8, transparent: true, opacity: 0.55, side: THREE.DoubleSide
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(CX, 0.18, CZ);
  scene.add(water);
  // Subtle highlight ripple layer
  const shimmer = new THREE.Mesh(
    waterGeom,
    new THREE.MeshBasicMaterial({
      color: 0xCFE9FB, transparent: true, opacity: 0.18, side: THREE.DoubleSide
    })
  );
  shimmer.rotation.x = -Math.PI / 2;
  shimmer.position.set(CX, 0.22, CZ);
  scene.add(shimmer);

  // Tall candle stands on either side of the pool
  for (const sx of [-1, 1]) {
    const stand = makeBox(0.18, 1.4, 0.18, 0x6B3410, CX + sx * (W / 2 + 0.8), 0, CZ);
    scene.add(stand);
    const candle = makeBox(0.22, 0.3, 0.22, 0xFFFACD,
      CX + sx * (W / 2 + 0.8), 1.4, CZ);
    scene.add(candle);
    // Flickering flame
    const flame = new THREE.PointLight(0xFFB060, 1.2, 4);
    flame.position.set(CX + sx * (W / 2 + 0.8), 1.95, CZ);
    scene.add(flame);
    const flameMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xFFD050 })
    );
    flameMesh.position.copy(flame.position);
    scene.add(flameMesh);
  }

  // Cross banner mounted on the north wall
  const banner = makeBox(2.4, 2.8, 0.08, 0x3D1054, CX, 0, CZ - D / 2 - 0.16);
  scene.add(banner);
  const crossV = makeBox(0.25, 1.8, 0.05, 0xE6C16E, CX, 0.6, CZ - D / 2 - 0.22);
  const crossH = makeBox(1.1, 0.25, 0.05, 0xE6C16E, CX, 1.65, CZ - D / 2 - 0.22);
  scene.add(crossV); scene.add(crossH);

  // Floating label sign so the player can spot it
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 256; signCanvas.height = 64;
  const sctx = signCanvas.getContext("2d");
  sctx.fillStyle = "rgba(26,10,46,0.85)"; sctx.fillRect(0, 0, 256, 64);
  sctx.fillStyle = "#FFD700"; sctx.font = "bold 26px Arial";
  sctx.fillText("💧 Baptismal Pool", 18, 42);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(signCanvas), transparent: true
  }));
  sign.position.set(CX, 3.4, CZ);
  sign.scale.set(4.2, 1.05, 1);
  scene.add(sign);

  zones.baptismPool = {
    center: new THREE.Vector3(CX, 0, CZ),
    entry:  new THREE.Vector3(CX, 0, CZ + D / 2 + 1.5),
    water,
    shimmer,
  };
}

// Builds an outdoor basketball half-court (well, with two hoops) east of the
// parking lot. Decorative — no colliders so the player can run around freely.
function buildBasketballCourt(scene, add, colliders, zones) {
  const CX = 55, CZ = 20;      // court center
  const W = 14, D = 22;        // court footprint
  const m = c => new THREE.MeshToonMaterial({ color: c });

  // Asphalt slab (slight terracotta — classic outdoor court look)
  add(makeFloor(W, D, 0xB85C3A, CX, CZ, 0.02));
  // Sideline & baseline stripes (white)
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  function stripe(w, d, x, z) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), stripeMat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, 0.04, z);
    scene.add(s);
  }
  stripe(W,    0.2, CX, CZ - D / 2 + 0.1);       // baseline north
  stripe(W,    0.2, CX, CZ + D / 2 - 0.1);       // baseline south
  stripe(0.2,  D,   CX - W / 2 + 0.1, CZ);       // sideline west
  stripe(0.2,  D,   CX + W / 2 - 0.1, CZ);       // sideline east
  stripe(W,    0.2, CX, CZ);                     // half-court line
  // Center circle (just a thin ring approximated by 24 segments)
  const ringGeo = new THREE.RingGeometry(1.7, 1.85, 32);
  const ring = new THREE.Mesh(ringGeo, stripeMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(CX, 0.045, CZ);
  scene.add(ring);
  // Keys / free-throw lanes (painted blue) at each end
  [-1, 1].forEach(side => {
    const key = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), m(0x2B5FA8));
    key.rotation.x = -Math.PI / 2;
    key.position.set(CX, 0.035, CZ + side * (D / 2 - 2.5));
    scene.add(key);
    // Free-throw arc
    const arc = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.75, 24, 1, 0, Math.PI), stripeMat);
    arc.rotation.x = -Math.PI / 2;
    arc.rotation.z = side > 0 ? 0 : Math.PI;
    arc.position.set(CX, 0.05, CZ + side * (D / 2 - 5));
    scene.add(arc);
  });

  // Hoop builder: backboard + rim + net + pole.
  // `inward` is the +/- Z direction pointing from the baseline toward center court.
  // Pole sits OUTSIDE the baseline; backboard hugs the baseline facing inward;
  // the rim extends INTO the court from the front of the board.
  const hoops = [];
  function buildHoop(baselineZ, inward) {
    const poleZ  = baselineZ - inward * 0.6;        // behind the baseline
    const boardZ = baselineZ;                       // on the baseline
    const rimZ   = baselineZ + inward * 0.55;       // inside the court
    // Pole
    const pole = makeBox(0.3, 4.2, 0.3, 0x222222, CX, 0, poleZ);
    scene.add(pole);
    // Support arm from pole forward to the backboard
    add(makeBox(0.2, 0.2, 0.7, 0x222222, CX, 3.5, baselineZ - inward * 0.25));
    // Backboard (a thin slab)
    const board = makeBox(2.4, 1.5, 0.1, 0xffffff, CX, 3.2, boardZ);
    scene.add(board);
    // Red square painted on the court-facing side of the backboard
    const sq = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xCC2A2A, side: THREE.DoubleSide })
    );
    sq.position.set(CX, 3.05, boardZ + inward * 0.06);
    sq.rotation.y = inward > 0 ? 0 : Math.PI;
    scene.add(sq);
    // Rim — a horizontal torus (lies flat in the XZ plane)
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.045, 8, 24),
      new THREE.MeshToonMaterial({ color: 0xE65A2A })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(CX, 2.8, rimZ);
    scene.add(rim);
    // Net: cone with wide end at the rim and apex hanging below
    const net = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.55, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55,
        side: THREE.DoubleSide, wireframe: true })
    );
    net.rotation.x = Math.PI;                       // flip so the wide end is on top
    net.position.set(CX, 2.5, rimZ);
    scene.add(net);
    hoops.push({ position: new THREE.Vector3(CX, 2.8, rimZ), radius: 0.45, inward });
  }
  // North baseline (smaller z) — court interior is to the +Z side
  buildHoop(CZ - D / 2,  1);
  // South baseline (larger z) — court interior is to the -Z side
  buildHoop(CZ + D / 2, -1);

  // A loose basketball sitting on the court
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 12, 10),
    new THREE.MeshToonMaterial({ color: 0xE65A2A })
  );
  ball.position.set(CX - 2, 0.25, CZ + 4);
  ball.castShadow = true;
  scene.add(ball);

  // Bench on the sideline for spectators
  add(makeBox(3, 0.2, 0.7, 0x8B4513, CX - W / 2 - 1.2, 0.5, CZ));
  add(makeBox(3, 0.7, 0.15, 0x8B4513, CX - W / 2 - 1.2, 0.85, CZ + 0.3));
  add(makeBox(0.15, 0.5, 0.7, 0x6B3410, CX - W / 2 - 2.5, 0, CZ));
  add(makeBox(0.15, 0.5, 0.7, 0x6B3410, CX - W / 2 + 0.1, 0, CZ));

  // Welcome arch sign
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 256; signCanvas.height = 64;
  const sctx = signCanvas.getContext("2d");
  sctx.fillStyle = "#1a0a2e"; sctx.fillRect(0, 0, 256, 64);
  sctx.fillStyle = "#FFD700"; sctx.font = "bold 26px Arial";
  sctx.fillText("🏀 Church Hoops", 12, 42);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(signCanvas), transparent: true
  }));
  sign.position.set(CX, 5.5, CZ - D / 2);
  sign.scale.set(5, 1.25, 1);
  scene.add(sign);

  zones.basketballCourt = { center: new THREE.Vector3(CX, 0, CZ) };
  zones.basketball = {
    mesh: ball,
    radius: 0.25,
    restPos: ball.position.clone(),
    hoops,
  };
}

// Builds a small kids' playground just east of the courtyard "park":
// a wood-chip pad with a slide (the centrepiece), a two-seat swing set,
// a sandbox, a seesaw, a couple of trees, and a sign. Mostly decorative,
// but the slide tower's posts and the swing posts get colliders so the
// player can't walk through them.
function buildPlayground(scene, add, colliders, zones) {
  const CX = 62, CZ = -4;       // playground centre (east of courtyard at 32,-5)
  const W = 16, D = 14;         // footprint
  const m = c => new THREE.MeshToonMaterial({ color: c });

  // Wood-chip / mulch ground pad
  add(makeFloor(W, D, 0xC8A875, CX, CZ, 0.018));
  // Soft grass border outside the chips so it blends with the courtyard
  add(makeFloor(W + 4, D + 4, 0x8FC162, CX, CZ, 0.016));

  // ---- SLIDE ----
  // Stair tower on the +x side, platform on top, slanted chute on the -x side.
  const SLIDE_CX = CX + 1.0;     // tower centre
  const SLIDE_CZ = CZ - 4.5;
  const PLAT_Y   = 2.0;          // platform height

  // Four red support posts under the platform
  [[-0.9, -0.7], [0.9, -0.7], [-0.9, 0.7], [0.9, 0.7]].forEach(([ox, oz]) => {
    const post = makeBox(0.2, PLAT_Y, 0.2, 0xCC3333,
      SLIDE_CX + ox, 0, SLIDE_CZ + oz);
    add(post, true);
  });
  // Platform deck
  add(makeBox(2.2, 0.15, 1.8, 0xE8C896, SLIDE_CX, PLAT_Y, SLIDE_CZ));
  // Side guard rails on the platform (so it reads as a tower top)
  add(makeBox(0.1, 0.6, 1.8, 0xCC3333, SLIDE_CX + 1.05, PLAT_Y + 0.15, SLIDE_CZ));
  add(makeBox(2.2, 0.6, 0.1, 0xCC3333, SLIDE_CX, PLAT_Y + 0.15, SLIDE_CZ - 0.85));
  add(makeBox(2.2, 0.6, 0.1, 0xCC3333, SLIDE_CX, PLAT_Y + 0.15, SLIDE_CZ + 0.85));

  // Stairs on the +x side of the tower (4 steps leading up to PLAT_Y)
  for (let i = 0; i < 4; i++) {
    const sy = (i + 1) * (PLAT_Y / 4) - 0.08;
    add(makeBox(1.2, 0.16, 0.5,
      0xB8862E,
      SLIDE_CX + 1.6 + i * 0.55, sy - 0.08, SLIDE_CZ));
  }
  // Stair handrails (thin gold bars)
  add(makeBox(2.6, 0.08, 0.06, 0xFFD700,
    SLIDE_CX + 2.4, 1.3, SLIDE_CZ - 0.3));
  add(makeBox(2.6, 0.08, 0.06, 0xFFD700,
    SLIDE_CX + 2.4, 1.3, SLIDE_CZ + 0.3));

  // Slide chute — a blue slanted slab sloping from the platform down to the ground
  // Tilted around Z so the top end is at the platform's -x edge and the bottom
  // touches the ground ~3m further -x. Length = sqrt(3^2 + 2^2) ≈ 3.6
  const slideLen = Math.sqrt(3 * 3 + PLAT_Y * PLAT_Y);
  const slideTilt = Math.atan2(PLAT_Y, 3);   // ~33.7°
  const chute = new THREE.Mesh(
    new THREE.BoxGeometry(slideLen, 0.1, 0.9),
    m(0x3FA9E8)
  );
  chute.rotation.z = slideTilt;
  chute.position.set(
    SLIDE_CX - 1.0 - (Math.cos(slideTilt) * slideLen) / 2,
    PLAT_Y / 2 + 0.05,
    SLIDE_CZ
  );
  chute.castShadow = true;
  chute.receiveShadow = true;
  scene.add(chute);
  // Slide side walls (low rails so it looks like a real chute)
  for (const sz of [-0.45, 0.45]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(slideLen, 0.25, 0.05),
      m(0x2A88C2)
    );
    wall.rotation.z = slideTilt;
    wall.position.set(
      SLIDE_CX - 1.0 - (Math.cos(slideTilt) * slideLen) / 2,
      PLAT_Y / 2 + 0.2,
      SLIDE_CZ + sz
    );
    scene.add(wall);
  }
  // Little run-out lip at the bottom of the slide
  add(makeBox(0.8, 0.08, 0.9, 0x3FA9E8,
    SLIDE_CX - 1.0 - Math.cos(slideTilt) * slideLen - 0.4, 0.05, SLIDE_CZ));

  // ---- SWING SET ----
  const SW_CX = CX - 3.5;
  const SW_CZ = CZ + 2.0;
  // Two A-frame leg pairs (front-back) on each side
  function aFrame(ox) {
    add(makeBox(0.18, 2.6, 0.18, 0x7A4A20,
      SW_CX + ox, 0, SW_CZ - 0.9), true);
    add(makeBox(0.18, 2.6, 0.18, 0x7A4A20,
      SW_CX + ox, 0, SW_CZ + 0.9), true);
  }
  aFrame(-2.2);
  aFrame( 2.2);
  // Top crossbar
  add(makeBox(4.8, 0.18, 0.18, 0x7A4A20, SW_CX, 2.4, SW_CZ));
  // Two swings — each a pivot Group hanging from the crossbar so the
  // playground.js interaction module can swing the whole rig (chains +
  // seat) by setting group.rotation.x.
  const swingPivots = [];
  for (const sx of [-1.0, 1.0]) {
    const pivot = new THREE.Group();
    pivot.position.set(SW_CX + sx, 2.4, SW_CZ);   // top of chains (crossbar)
    // Chains — slender dark cylinders anchored at the top so they hang down.
    for (const cz of [-0.25, 0.25]) {
      const chain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 1.55, 6),
        m(0x333333)
      );
      // Move down so the cylinder's top sits at the pivot origin.
      chain.position.set(0, -1.55 / 2, cz);
      pivot.add(chain);
    }
    // Seat — hangs at chain-length below the pivot.
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.08, 0.3),
      m(0xFFD700)
    );
    seat.position.set(0, -1.55, 0);
    seat.castShadow = true;
    pivot.add(seat);
    scene.add(pivot);
    swingPivots.push(pivot);
  }

  // ---- SANDBOX ----
  const SB_CX = CX + 4.5, SB_CZ = CZ + 4.0;
  add(makeFloor(3, 3, 0xF2D89A, SB_CX, SB_CZ, 0.04));
  // Wood border around the sand
  add(makeBox(3.2, 0.2, 0.2, 0x8B5A2B, SB_CX, 0, SB_CZ - 1.5));
  add(makeBox(3.2, 0.2, 0.2, 0x8B5A2B, SB_CX, 0, SB_CZ + 1.5));
  add(makeBox(0.2, 0.2, 3.2, 0x8B5A2B, SB_CX - 1.5, 0, SB_CZ));
  add(makeBox(0.2, 0.2, 3.2, 0x8B5A2B, SB_CX + 1.5, 0, SB_CZ));
  // A toy bucket and shovel hint
  const bucket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.32, 12),
    m(0xE65A2A)
  );
  bucket.position.set(SB_CX - 0.6, 0.16, SB_CZ + 0.5);
  scene.add(bucket);

  // ---- SEESAW ----
  const SS_CX = CX - 3.0, SS_CZ = CZ - 4.0;
  // Pivot block
  add(makeBox(0.6, 0.5, 0.6, 0x555555, SS_CX, 0, SS_CZ));
  // Plank tilted slightly
  const plank = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.12, 0.4),
    m(0xE65A2A)
  );
  plank.rotation.z = 0.12;
  plank.position.set(SS_CX, 0.7, SS_CZ);
  plank.castShadow = true;
  scene.add(plank);
  // Handle pegs at each end
  for (const sx of [-1.6, 1.6]) {
    add(makeBox(0.08, 0.35, 0.08, 0xFFD700,
      SS_CX + sx, 0.7 + Math.sin(0.12) * sx, SS_CZ));
  }

  // ---- A couple of shade trees on the corners ----
  {
    const a = makeTree(CX - W / 2 - 0.5, CZ + D / 2 + 0.5); add(a.trunk); add(a.top);
    const b = makeTree(CX + W / 2 + 0.5, CZ - D / 2 - 0.5); add(b.trunk); add(b.top);
  }

  // ---- Sign ----
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 256; signCanvas.height = 64;
  const sctx = signCanvas.getContext("2d");
  sctx.fillStyle = "#1a0a2e"; sctx.fillRect(0, 0, 256, 64);
  sctx.fillStyle = "#FFD700"; sctx.font = "bold 24px Arial";
  sctx.fillText("🛝 Kids' Playground", 10, 42);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(signCanvas), transparent: true
  }));
  sign.position.set(CX, 4.5, CZ - D / 2 - 0.5);
  sign.scale.set(5, 1.25, 1);
  scene.add(sign);

  // Expose geometry the playground.js interaction module needs to ride
  // the slide and swing on the swings. Coordinates derived above.
  const slideTop    = new THREE.Vector3(SLIDE_CX - 1.0, PLAT_Y + 0.15, SLIDE_CZ);
  const slideBottom = new THREE.Vector3(
    SLIDE_CX - 1.0 - Math.cos(slideTilt) * slideLen,
    0.1,
    SLIDE_CZ
  );
  zones.playground = {
    center: new THREE.Vector3(CX, 0, CZ),
    slide: {
      // "Mount" zone: stand near the base of the stairs to ride.
      mountPos: new THREE.Vector3(SLIDE_CX + 2.4, 0, SLIDE_CZ),
      topPos:    slideTop,
      bottomPos: slideBottom,
      tilt:      slideTilt,
    },
    swings: [
      { pivot: swingPivots[0], anchorPos: new THREE.Vector3(SW_CX - 1.0, 2.4, SW_CZ), seatY: 0.85, chainLen: 1.55 },
      { pivot: swingPivots[1], anchorPos: new THREE.Vector3(SW_CX + 1.0, 2.4, SW_CZ), seatY: 0.85, chainLen: 1.55 },
    ],
  };
}

// Builds a single suburban house with body, pitched roof, door, windows, mailbox,
// driveway, and a label. Registers a parking spot in zones.parkingSpots and
// pushes a wall collider so the car can't drive through it.
function buildHouse(scene, add, colliders, zones, h) {
  const HOUSE_Z = 60;          // body center z
  const DRIVE_Z = 52;          // driveway center z (between street z=48 and house z=60)
  const W = 10, D = 8, BODY_H = 4;
  const WALL_T = 0.3;          // wall thickness
  const DOOR_W = 2.0;          // doorway opening width (player can walk through)
  const m = c => new THREE.MeshToonMaterial({ color: c });

  // ---- Walls (collidable) ----
  // The front of the house faces -Z (toward the street). Front wall is split
  // into two pieces leaving a doorway gap in the middle.
  const sideLen = (W - DOOR_W) / 2;
  const frontZ = HOUSE_Z - D / 2 + WALL_T / 2;
  const backZ  = HOUSE_Z + D / 2 - WALL_T / 2;

  // Left half of front wall
  const fL = makeBox(sideLen, BODY_H, WALL_T, h.color,
    h.x - (W / 2 - sideLen / 2), 0, frontZ);
  scene.add(fL); colliders.push(new THREE.Box3().setFromObject(fL));
  // Right half of front wall
  const fR = makeBox(sideLen, BODY_H, WALL_T, h.color,
    h.x + (W / 2 - sideLen / 2), 0, frontZ);
  scene.add(fR); colliders.push(new THREE.Box3().setFromObject(fR));
  // Header above the doorway (decorative, not collidable so head clearance is fine)
  const header = makeBox(DOOR_W, BODY_H - 2.4, WALL_T, h.color,
    h.x, 2.4, frontZ);
  scene.add(header);
  // Back wall (solid)
  const back = makeBox(W, BODY_H, WALL_T, h.color, h.x, 0, backZ);
  scene.add(back); colliders.push(new THREE.Box3().setFromObject(back));
  // Left wall (solid)
  const wL = makeBox(WALL_T, BODY_H, D, h.color, h.x - W / 2 + WALL_T / 2, 0, HOUSE_Z);
  scene.add(wL); colliders.push(new THREE.Box3().setFromObject(wL));
  // Right wall (solid)
  const wR = makeBox(WALL_T, BODY_H, D, h.color, h.x + W / 2 - WALL_T / 2, 0, HOUSE_Z);
  scene.add(wR); colliders.push(new THREE.Box3().setFromObject(wR));

  // ---- Interior floor (wood planks) ----
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W - WALL_T * 2, D - WALL_T * 2),
    new THREE.MeshLambertMaterial({ color: 0xC9A36A })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(h.x, 0.03, HOUSE_Z);
  floor.receiveShadow = true;
  scene.add(floor);
  // A small accent rug
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 2.2),
    new THREE.MeshLambertMaterial({ color: 0xB04A3A })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(h.x, 0.04, HOUSE_Z + 0.5);
  scene.add(rug);

  // ---- Interior furniture (decorative — no colliders) ----
  // Sofa against the back wall
  const sofaBase = makeBox(3.2, 0.6, 1.1, 0x3A6EA5, h.x, 0, HOUSE_Z + D / 2 - 1.4);
  scene.add(sofaBase);
  const sofaBack = makeBox(3.2, 0.7, 0.3, 0x3A6EA5,
    h.x, 0.6, HOUSE_Z + D / 2 - 0.8);
  scene.add(sofaBack);
  for (const dx of [-1.4, 1.4]) {
    const arm = makeBox(0.3, 0.8, 1.1, 0x2E5A88,
      h.x + dx, 0.6, HOUSE_Z + D / 2 - 1.4);
    scene.add(arm);
  }
  // Coffee table in front of the sofa
  const coffee = makeBox(1.6, 0.4, 0.9, 0x6B3410, h.x, 0, HOUSE_Z + 0.4);
  scene.add(coffee);
  // Bed in one back corner
  const bed = makeBox(2.0, 0.4, 3.0, 0x8B4513,
    h.x - W / 2 + 1.4, 0, HOUSE_Z - D / 2 + 2.0);
  scene.add(bed);
  const mattress = makeBox(1.8, 0.25, 2.6, 0xF5F5DC,
    h.x - W / 2 + 1.4, 0.4, HOUSE_Z - D / 2 + 2.0);
  scene.add(mattress);
  const pillow = makeBox(1.6, 0.15, 0.5, 0xFFC0CB,
    h.x - W / 2 + 1.4, 0.65, HOUSE_Z - D / 2 + 1.2);
  scene.add(pillow);
  // Nightstand + lamp
  const stand = makeBox(0.7, 0.7, 0.7, 0x6B3410,
    h.x - W / 2 + 0.6, 0, HOUSE_Z - D / 2 + 0.6);
  scene.add(stand);
  const lampBase = makeBox(0.2, 0.4, 0.2, 0x333333,
    h.x - W / 2 + 0.6, 0.7, HOUSE_Z - D / 2 + 0.6);
  scene.add(lampBase);
  const lampShade = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.4, 8, 1, true),
    new THREE.MeshToonMaterial({ color: 0xFFE5A0, side: THREE.DoubleSide })
  );
  lampShade.position.set(h.x - W / 2 + 0.6, 1.3, HOUSE_Z - D / 2 + 0.6);
  scene.add(lampShade);
  const lampLight = new THREE.PointLight(0xFFD58A, 0.8, 6);
  lampLight.position.set(h.x - W / 2 + 0.6, 1.6, HOUSE_Z - D / 2 + 0.6);
  scene.add(lampLight);
  // Kitchen counter against the right wall
  const counter = makeBox(0.9, 0.9, 3.5, 0xE0E0E0,
    h.x + W / 2 - 0.7, 0, HOUSE_Z + 1.0);
  scene.add(counter);
  const sink = makeBox(0.7, 0.08, 1.0, 0xA0C8E0,
    h.x + W / 2 - 0.7, 0.9, HOUSE_Z + 1.0);
  scene.add(sink);

  // ---- Roof (hideable when the player is inside) ----
  const roofMat = m(h.roof);
  const roofParts = [];
  const slope = new THREE.BoxGeometry(W + 0.4, 0.3, Math.hypot(D / 2, 2.5));
  for (const sign of [-1, 1]) {
    const r = new THREE.Mesh(slope, roofMat);
    r.position.set(h.x, BODY_H + 1.0, HOUSE_Z + sign * D / 4);
    r.rotation.x = sign * Math.atan2(2.5, D / 2);
    r.castShadow = true;
    scene.add(r);
    roofParts.push(r);
  }
  // Roof ridge cap
  const ridge = makeBox(W + 0.5, 0.25, 0.25, h.roof, h.x, BODY_H + 2.4, HOUSE_Z);
  scene.add(ridge);
  roofParts.push(ridge);

  // ---- Door (decorative — placed open just inside the doorway gap) ----
  const door = makeBox(1.4, 2.2, 0.1, h.door,
    h.x - DOOR_W / 2 + 0.05, 0, HOUSE_Z - D / 2 + 0.5);
  door.rotation.y = -Math.PI / 6; // ajar
  scene.add(door);
  // Door knob
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 6, 6),
    new THREE.MeshToonMaterial({ color: 0xFFD700 })
  );
  knob.position.set(h.x - DOOR_W / 2 + 1.3, 1.1, HOUSE_Z - D / 2 + 0.45);
  scene.add(knob);

  // Two windows flanking the door — placed on the front wall halves
  for (const dx of [-(W / 2 - sideLen / 2), (W / 2 - sideLen / 2)]) {
    const frame = makeBox(1.4, 1.1, 0.08, 0xFFFFFF,
      h.x + dx, 1.3, HOUSE_Z - D / 2 - 0.05);
    scene.add(frame);
    const pane = makeBox(1.15, 0.9, 0.05, 0x9FD6F2,
      h.x + dx, 1.3, HOUSE_Z - D / 2 - 0.1);
    scene.add(pane);
  }
  // One upper window (above door)
  const upper = makeBox(1.0, 0.7, 0.05, 0x9FD6F2, h.x, 3.1, HOUSE_Z - D / 2 - 0.05);
  scene.add(upper);

  // Driveway (lighter asphalt) — connects street to garage area
  const drive = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 8),
    new THREE.MeshLambertMaterial({ color: 0x5A5A60 })
  );
  drive.rotation.x = -Math.PI / 2;
  drive.position.set(h.x, 0.02, DRIVE_Z);
  drive.receiveShadow = true;
  scene.add(drive);

  // Parking guide stripes
  for (const dx of [-1.6, 1.6]) {
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 7),
      new THREE.MeshBasicMaterial({ color: 0xFFFFFF })
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(h.x + dx, 0.05, DRIVE_Z);
    scene.add(stripe);
  }

  // Mailbox at the street edge of the driveway
  const post = makeBox(0.15, 1.0, 0.15, 0x4A2C0A, h.x - 2.6, 0, DRIVE_Z - 3.8);
  scene.add(post);
  const box = makeBox(0.35, 0.35, 0.55, h.door, h.x - 2.6, 1.0, DRIVE_Z - 3.8);
  scene.add(box);

  // Front-yard tree
  const t = makeTree(h.x + 4.2, DRIVE_Z - 4);
  scene.add(t.trunk); scene.add(t.top);

  // Sign label (rendered via Sprite so it always faces the camera)
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(20,10,40,0.85)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#FFD700";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";
  ctx.fillText(h.name, 128, 40);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true })
  );
  sprite.position.set(h.x, BODY_H + 3.4, HOUSE_Z);
  sprite.scale.set(7, 1.75, 1);
  scene.add(sprite);

  // Register parking spot for the vehicle-side detector
  zones.parkingSpots.push({
    name: h.name,
    cx: h.x, cz: DRIVE_Z,
    halfW: 2.4, halfD: 3.5,
  });

  // Register the house so the main loop can hide the roof when the player
  // walks inside (otherwise the camera would just see the underside of it).
  zones.houses = zones.houses || [];
  zones.houses.push({
    name: h.name,
    cx: h.x, cz: HOUSE_Z,
    halfW: W / 2, halfD: D / 2,
    roofParts,
    // Sittable / layable furniture inside this house. Coordinates mirror
    // the meshes built above; sitting.js uses these to let the player
    // rest in their home on the Sabbath.
    //   sofa is 3.2 wide centered at (h.x, HOUSE_Z + D/2 - 1.4),
    //   back at +Z so the player faces -Z (toward the coffee table).
    //   bed is 2 wide × 3 deep at (h.x - W/2 + 1.4, HOUSE_Z - D/2 + 2.0),
    //   pillow at low-z, so the player lies with head toward -Z.
    sofaSeats: [-1.0, 0, 1.0].map(dx => ({
      x: h.x + dx,
      z: HOUSE_Z + D / 2 - 1.6,
      y: 0.65,
      rotY: 0,
    })),
    bed: {
      x: h.x - W / 2 + 1.4,
      z: HOUSE_Z - D / 2 + 2.0,
      y: 0.7,
      // Head end (toward pillow at low z)
      headZ: HOUSE_Z - D / 2 + 1.2,
    },
  });
}

export function buildWorld(scene) {
  const colliders = [];
  const zones = {};

  function add(mesh, collidable = false) {
    scene.add(mesh);
    if (collidable) colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }

  // Ground (sits at y=0; everything else floats slightly above to avoid Z-fighting)
  add(makeFloor(180, 200, 0xC8B89A, 0, -10, 0));

  // ---- SANCTUARY ----
  add(makeFloor(24, 32, 0xF5F0E8, 0, -16));
  zones.sanctuary = { center: new THREE.Vector3(0, 0, -16) };
  // back wall (solid — behind the pastor)
  add(makeBox(24, 6, 0.5, 0x4B0082, 0, 0, -32), true);
  // front wall — split into two halves leaving a 6-wide doorway in the middle
  add(makeBox(9, 6, 0.5, 0x4B0082, -7.5, 0, 0), true);
  add(makeBox(9, 6, 0.5, 0x4B0082,  7.5, 0, 0), true);
  // optional door header above the opening
  add(makeBox(6, 1.5, 0.5, 0x4B0082, 0, 4.5, 0));
  add(makeBox(0.5, 6, 32, 0x4B0082, -12, 0, -16), true);
  add(makeBox(0.5, 6, 32, 0x4B0082,  12, 0, -16), true);
  add(makeBox(24, 0.5, 32, 0x3A0066, 0, 6, -16));

  [0xFFD700, 0xFF6B35, 0x6A4C93, 0x1982C4].forEach((c, i) => {
    add(makeGlass(2.5, 3, c, -10 + i * 6, 3.5, -31.7));
    add(makeGlass(2.5, 3, c, -10 + i * 6, 3.5, -0.3, Math.PI));
  });

  add(makeBox(0.4, 3, 0.3, 0xFFD700,  0, 3.5, -31.8));
  add(makeBox(1.5, 0.4, 0.3, 0xFFD700, 0, 4.5, -31.8));

  add(makeBox(12, 0.5, 6, 0x8B4513, 0, 0, -28));
  zones.basicPulpit = add(makeBox(1.5, 1, 1, 0xA0522D, 0, 0.5, -26.5));

  zones.pewsBasic = [];
  [[-4,-10],[-4,-15],[-4,-20],[-4,-25],[4,-10],[4,-15],[4,-20],[4,-25]].forEach(([x, z]) => {
    const pew = makePew(x, z); scene.add(pew); zones.pewsBasic.push(pew);
  });
  zones.extraPews = [];
  [[-4,-7],[4,-7]].forEach(([x, z]) => {
    const pew = makePew(x, z); pew.visible = false; scene.add(pew); zones.extraPews.push(pew);
  });

  // ---- FOYER ----
  add(makeFloor(20, 12, 0xFAF0E6, 0, 5));
  zones.foyer = { center: new THREE.Vector3(0, 0, 5) };
  // north wall — split with a 6-wide front entrance to step outside
  add(makeBox(7, 4, 0.5, 0x5B2D8E, -6.5, 0, 11), true);
  add(makeBox(7, 4, 0.5, 0x5B2D8E,  6.5, 0, 11), true);
  add(makeBox(6, 1, 0.5, 0x5B2D8E, 0, 3.5, 11));
  // west wall (solid)
  add(makeBox(0.5, 4, 12, 0x5B2D8E, -10, 0, 5), true);
  // east wall — split with a 5-wide doorway toward the courtyard
  add(makeBox(0.5, 4, 3.5, 0x5B2D8E, 10, 0,  9.25), true);
  add(makeBox(0.5, 4, 3.5, 0x5B2D8E, 10, 0,  0.75), true);
  add(makeBox(20, 0.3, 12, 0x4A2070, 0, 4, 5));
  add(makeBox(3, 1, 1, 0xD2A679, -5, 0, 8));
  add(makeBox(2, 1.2, 1, 0x8B4513, 6, 0, 8));
  add(makeBox(0.4, 0.6, 0.4, 0x2C1810, 6, 1.2, 7.8));

  // ---- COURTYARD ---- (shifted east for wider walkway)
  add(makeFloor(30, 24, 0x90C968, 32, -5));
  zones.courtyard = { center: new THREE.Vector3(32, 0, -5) };

  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 0.5, 16),
    new THREE.MeshToonMaterial({ color: 0xB0C4DE })
  );
  fountain.position.set(32, 0.25, -5); add(fountain);
  const fountainRing = new THREE.Mesh(
    new THREE.TorusGeometry(2, 0.3, 8, 16),
    new THREE.MeshToonMaterial({ color: 0x87CEEB })
  );
  fountainRing.position.set(32, 0.7, -5);
  fountainRing.rotation.x = -Math.PI / 2; add(fountainRing);

  zones.fountain = { center: new THREE.Vector3(32, 0, -5), radius: 3 };

  [[27,-10],[37,-10],[27,0],[37,0]].forEach(([x, z]) => add(makePew(x, z)));
  [[25,-15],[39,-15],[25,5],[39,5]].forEach(([x, z]) => {
    const { trunk, top } = makeTree(x, z); add(trunk); add(top);
  });

  // ---- FELLOWSHIP HALL ---- (shifted west for wider walkway)
  add(makeFloor(22, 20, 0xFFFACD, -32, -10));
  zones.fellowship = { center: new THREE.Vector3(-32, 0, -10) };
  add(makeBox(22, 5, 0.5, 0x6A0DAD, -32, 0, -20), true);
  add(makeBox(22, 5, 0.5, 0x6A0DAD, -32, 0,   0), true);
  add(makeBox(0.5, 5, 20, 0x6A0DAD, -43, 0, -10), true);
  // east wall — split with a 5-wide doorway at z=-10 facing the sanctuary
  add(makeBox(0.5, 5, 7.5, 0x6A0DAD, -21, 0, -16.25), true);
  add(makeBox(0.5, 5, 7.5, 0x6A0DAD, -21, 0,  -3.75), true);
  add(makeBox(22, 0.3, 20, 0x5A0090, -32, 5, -10));
  [[-32,-15],[-32,-5],[-27,-10],[-37,-10]].forEach(([x, z]) => {
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.1, 12),
      new THREE.MeshToonMaterial({ color: 0xDEB887 })
    );
    table.position.set(x, 0.75, z); add(table);
    add(makeBox(0.2, 0.75, 0.2, 0xA0522D, x, 0, z));
  });

  // ---- PRAYER ROOM ---- (shifted south to give the back lawn more room)
  add(makeFloor(10, 10, 0xF0E6FF, -8, -46));
  zones.prayerRoom = { center: new THREE.Vector3(-8, 0, -46), locked: true };
  add(makeBox(10, 4, 0.5, 0x2E0854, -8, 0, -51), true);
  // north wall split with a 2-wide doorway in the middle (door fills the gap until unlocked)
  add(makeBox(4, 4, 0.5, 0x2E0854,-11, 0, -41), true);
  add(makeBox(4, 4, 0.5, 0x2E0854, -5, 0, -41), true);
  add(makeBox(0.5, 4, 10, 0x2E0854,-13, 0, -46), true);
  add(makeBox(0.5, 4, 10, 0x2E0854, -3, 0, -46), true);
  add(makeBox(10, 0.3, 10, 0x1E0044,-8, 4, -46));
  zones.prayerDoor = add(makeBox(2, 4, 0.5, 0x666666, -8, 0, -41), true);
  // Remember this collider so growth.js can remove it when the door unlocks.
  zones.prayerDoorCollider = colliders[colliders.length - 1];
  [[-6,-48],[-10,-48],[-6,-44],[-10,-44]].forEach(([x, z]) => {
    const pl = new THREE.PointLight(0xFF8C00, 0.8, 4);
    pl.position.set(x, 1.5, z); scene.add(pl);
    add(makeBox(0.2, 0.6, 0.2, 0xFFFACD, x, 0, z));
  });
  add(makeBox(3, 0.2, 1, 0x4A2070,-8, 0.2,-45));

  // ---- PASTOR'S OFFICE ---- (shifted south)
  add(makeFloor(10, 10, 0xF5F5DC, 8, -46));
  zones.pastorOffice = { center: new THREE.Vector3(8, 0, -46) };
  add(makeBox(10, 4, 0.5, 0x3D1054, 8, 0, -51), true);
  // north wall facing sanctuary — split with a 3-wide doorway in the middle
  add(makeBox(3.5, 4, 0.5, 0x3D1054, 4.75, 0, -41), true);
  add(makeBox(3.5, 4, 0.5, 0x3D1054, 11.25, 0, -41), true);
  add(makeBox(0.5, 4, 10, 0x3D1054, 3, 0, -46), true);
  add(makeBox(0.5, 4, 10, 0x3D1054, 13, 0, -46), true);
  add(makeBox(10, 0.3, 10, 0x2D0844, 8, 4, -46));
  add(makeBox(3, 0.8, 1.5, 0x8B4513, 8, 0,-49));
  add(makeBox(0.3, 0.6, 1.5, 0x6B3410, 6.6, 0,-49));
  add(makeBox(0.3, 0.6, 1.5, 0x6B3410, 9.4, 0,-49));
  [0xFF6B6B,0x4ECDC4,0x45B7D1,0xF7DC6F,0xBB8FCE,0x82E0AA].forEach((c, i) => {
    add(makeBox(0.25, 0.5, 0.8, c, 12.7, 0.5 + Math.floor(i / 3) * 0.55, -44.5 + (i % 3) * 0.9));
  });
  add(makeBox(0.4, 2, 2.5, 0x8B6914,12.8, 0,-45.5));

  // ---- BIBLE STUDY ROOM ---- (east of pastor's office)
  // A small library / discipleship room with bookshelves around the walls
  // and 5 chairs in a circle in the middle. The "Spot the Imposter"
  // minigame runs out of here — see src/minigames/imposter.js.
  {
    const SCX = 22, SCZ = -46;          // room centre
    const SW = 10, SD = 10;             // footprint

    // Path connector from the pastor's office spur over to the study door
    add(makeFloor(8, 4, 0xD4C5A9, 17, -42, 0.015));

    // Floor (warm hardwood)
    add(makeFloor(SW, SD, 0xB58B5C, SCX, SCZ));

    // Walls (rich brown). North wall split with a 3-wide doorway facing
    // the sanctuary so the player can walk in from the back path.
    add(makeBox(SW,    4, 0.5, 0x6B4226, SCX, 0, SCZ + SD / 2), true);          // south
    add(makeBox(3.5,   4, 0.5, 0x6B4226, SCX - 3.25, 0, SCZ - SD / 2), true);   // north-left
    add(makeBox(3.5,   4, 0.5, 0x6B4226, SCX + 3.25, 0, SCZ - SD / 2), true);   // north-right
    add(makeBox(0.5,   4, SD,  0x6B4226, SCX - SW / 2, 0, SCZ), true);          // west
    add(makeBox(0.5,   4, SD,  0x6B4226, SCX + SW / 2, 0, SCZ), true);          // east
    // Header above the doorway + flat roof
    add(makeBox(3,   1.2, 0.5, 0x8B6914, SCX, 3.4, SCZ - SD / 2));
    add(makeBox(SW, 0.3, SD,   0x5A3520, SCX, 4, SCZ));

    // Bookshelves with colourful book spines along the east + west walls
    const SPINE_COLORS = [0xCC2A2A, 0x2E6FAE, 0xE8C078, 0x3FA9E8, 0xCC8833];
    for (let i = -1; i <= 1; i++) {
      const z = SCZ + i * 2.2;
      // West shelf cabinet
      add(makeBox(0.4, 2.5, 1.6, 0x4A2E1A, SCX - SW / 2 + 0.6, 0, z));
      // East shelf cabinet
      add(makeBox(0.4, 2.5, 1.6, 0x4A2E1A, SCX + SW / 2 - 0.6, 0, z));
      // Book spines on each row
      SPINE_COLORS.forEach((c, k) => {
        add(makeBox(0.3, 0.4, 1.4, c, SCX - SW / 2 + 0.6, 0.4 + k * 0.45, z));
        add(makeBox(0.3, 0.4, 1.4, c, SCX + SW / 2 - 0.6, 0.4 + k * 0.45, z));
      });
    }

    // Central rug
    add(makeFloor(2.6, 2.6, 0x8B0000, SCX, SCZ + 0.5, 0.03));

    // 5 chairs + decorative seated members arranged in a circle
    const CIRC_R = 2.0;
    const CIRC_CX = SCX, CIRC_CZ = SCZ + 0.5;
    const SHIRT_COLORS = [0xFF6B6B, 0x4ECDC4, 0xFFD700, 0xA29BFE, 0x6BCB77];
    const SKIN_COLORS  = [0xFFCBA4, 0xD4956A, 0xFFCBA4, 0x8B5A2B, 0xD4956A];
    const memberMeshes = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2; // start at top of circle
      const x = CIRC_CX + Math.cos(a) * CIRC_R;
      const z = CIRC_CZ + Math.sin(a) * CIRC_R;
      // Chair
      add(makeBox(0.7, 0.5, 0.7, 0x8B5A2B, x, 0, z));
      add(makeBox(0.7, 0.8, 0.12, 0x6B3410, x, 0.55, z + 0.3));   // chair back
      // Seated person — torso + head, facing the circle's centre
      const yaw = Math.atan2(CIRC_CX - x, CIRC_CZ - z);
      const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.7, 0.4),
        new THREE.MeshToonMaterial({ color: SHIRT_COLORS[i] })
      );
      torso.position.set(x, 0.95, z);
      torso.rotation.y = yaw;
      torso.castShadow = true;
      scene.add(torso);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.45),
        new THREE.MeshToonMaterial({ color: SKIN_COLORS[i] })
      );
      head.position.set(x, 1.55, z);
      head.rotation.y = yaw;
      head.castShadow = true;
      scene.add(head);
      memberMeshes.push({ torso, head, x, z });
    }

    // Bible on a small lectern at the centre of the rug
    add(makeBox(0.6, 0.7, 0.4, 0x4A2E1A, CIRC_CX, 0, CIRC_CZ));   // lectern stand
    add(makeBox(0.7, 0.08, 0.5, 0x222222, CIRC_CX, 0.7, CIRC_CZ));// closed Bible cover
    add(makeBox(0.65, 0.04, 0.45, 0xFFFFFF, CIRC_CX, 0.74, CIRC_CZ)); // pages
    // Tiny gold cross on the cover
    add(makeBox(0.05, 0.2, 0.04, 0xFFD700, CIRC_CX, 0.85, CIRC_CZ + 0.05));
    add(makeBox(0.15, 0.05, 0.04, 0xFFD700, CIRC_CX, 0.88, CIRC_CZ + 0.05));

    // Sign above the doorway
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 256; signCanvas.height = 64;
    const sctx = signCanvas.getContext("2d");
    sctx.fillStyle = "#1a0a2e"; sctx.fillRect(0, 0, 256, 64);
    sctx.fillStyle = "#FFD700"; sctx.font = "bold 22px Arial";
    sctx.fillText("\uD83D\uDCD6 Bible Study Room", 14, 42);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(signCanvas), transparent: true
    }));
    sign.position.set(SCX, 4.8, SCZ - SD / 2 - 0.5);
    sign.scale.set(5, 1.25, 1);
    scene.add(sign);

    zones.studyRoom = {
      center: new THREE.Vector3(SCX, 0, SCZ),
      circleCenter: new THREE.Vector3(CIRC_CX, 0, CIRC_CZ),
      members: memberMeshes,
    };
  }

  // ---- EXPANSION ZONE: CHILDREN'S WING ---- (pushed further back)
  // A small two-room building directly north of the baptism pool. Locked
  // behind a temporary construction barrier wall (at z=-58) until the
  // congregation hits 50 members; growth.js then hides the barrier AND
  // removes its collider (tracked here as `expansionBarrierCollider`)
  // so the player can actually walk inside.
  {
    const CX = 0, CZ = -68;       // building center
    const W = 20, D = 16;         // footprint
    const wallColor = 0x4FB8D9;   // bright teal — kid-friendly
    const trimColor = 0xFFD54F;
    const floorColor = 0xFFF3D0;

    // Floor
    add(makeFloor(W, D, floorColor, CX, CZ));
    zones.expansionZone = {
      center: new THREE.Vector3(CX, 0, CZ),
      entry:  new THREE.Vector3(CX, 0, CZ + D / 2 + 1.5),
      locked: true,
    };

    // South wall (facing baptism pool) — split with a 4-wide doorway in
    // the middle so the player can enter from the south.
    const southZ = CZ + D / 2;            // z = -60
    add(makeBox(8, 4, 0.5, wallColor, CX - 6, 0, southZ), true);
    add(makeBox(8, 4, 0.5, wallColor, CX + 6, 0, southZ), true);
    // Door header above the opening
    add(makeBox(4, 1.2, 0.5, trimColor, CX, 3.4, southZ));

    // North, east, west walls (solid)
    add(makeBox(W,   4, 0.5, wallColor, CX, 0, CZ - D / 2), true);  // north
    add(makeBox(0.5, 4, D,   wallColor, CX - W / 2, 0, CZ), true);  // west
    add(makeBox(0.5, 4, D,   wallColor, CX + W / 2, 0, CZ), true);  // east

    // Roof
    add(makeBox(W, 0.3, D, 0x2D8AA8, CX, 4, CZ));
    // Yellow trim band along the roofline
    add(makeBox(W + 0.4, 0.3, 0.2, trimColor, CX, 3.6, CZ - D / 2 - 0.05));
    add(makeBox(W + 0.4, 0.3, 0.2, trimColor, CX, 3.6, CZ + D / 2 + 0.05));

    // Interior divider with an opening (splits classroom / play area)
    add(makeBox(8, 3.5, 0.3, 0xCCEFFA, CX - 6, 0, CZ));
    add(makeBox(8, 3.5, 0.3, 0xCCEFFA, CX + 6, 0, CZ));

    // -- Classroom side (north half: z < CZ) --
    // Chalkboard on the north wall
    add(makeBox(5, 2, 0.1, 0x1B3A2F, CX - 4, 1.4, CZ - D / 2 + 0.3));
    add(makeBox(5.4, 0.2, 0.15, 0x8B5A2B, CX - 4, 0.3, CZ - D / 2 + 0.3));  // chalk tray
    // Little student desks in a row
    for (let i = -1; i <= 1; i++) {
      add(makeBox(1.2, 0.7, 0.7, 0xDEB887, CX - 4 + i * 1.8, 0, CZ - 3.5));
      add(makeBox(0.8, 0.45, 0.6, 0xE94F37, CX - 4 + i * 1.8, 0, CZ - 2.5));  // chair
    }
    // Teacher's desk
    add(makeBox(2.2, 0.8, 1, 0x8B4513, CX - 4, 0, CZ - D / 2 + 1.6));

    // -- Play area side (north half: x > CX) --
    // Colorful play mat
    add(makeFloor(6, 5, 0xFFB6C1, CX + 4, CZ - 3, 0.04));
    // Toy chest
    add(makeBox(1.5, 0.8, 1, 0xA64DFF, CX + 6.5, 0, CZ - 5));
    // Stacked blocks
    [0xE94F37, 0x43A047, 0x1E88E5, 0xFFD54F].forEach((c, i) => {
      add(makeBox(0.6, 0.6, 0.6, c, CX + 3 + (i % 2) * 0.7, 0.3 + Math.floor(i / 2) * 0.6, CZ - 2));
    });
    // Mini cross on the play-side wall
    add(makeBox(0.3, 1.4, 0.08, trimColor, CX + 9.6, 1.6, CZ - 3));
    add(makeBox(0.9, 0.3, 0.08, trimColor, CX + 9.6, 2.1, CZ - 3));

    // -- South half (entryway): welcoming signage + a small bench --
    add(makeBox(3, 0.5, 0.8, 0x8B4513, CX + 4, 0, CZ + D / 2 - 2));   // bench
    add(makeBox(3, 0.5, 0.8, 0x8B4513, CX - 4, 0, CZ + D / 2 - 2));

    // Floating label sign above the doorway so it's easy to spot
    const wingCanvas = document.createElement("canvas");
    wingCanvas.width = 320; wingCanvas.height = 64;
    const wctx = wingCanvas.getContext("2d");
    wctx.fillStyle = "rgba(26,10,46,0.85)"; wctx.fillRect(0, 0, 320, 64);
    wctx.fillStyle = "#FFD54F"; wctx.font = "bold 26px Arial";
    wctx.fillText("👶 Children's Wing", 20, 42);
    const wingSign = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(wingCanvas), transparent: true
    }));
    wingSign.position.set(CX, 5.2, southZ);
    wingSign.scale.set(5.2, 1.05, 1);
    scene.add(wingSign);
    zones.expansionWingSign = wingSign;
  }

  // Temporary construction barrier in front of the wing (lifted at 50 members).
  zones.expansionBarrier = add(makeBox(20, 6, 0.5, 0x888888, 0, 0, -58), true);
  // Track the barrier's collider so growth.js can remove it on unlock —
  // otherwise the wall is invisible but the player still bounces off it.
  zones.expansionBarrierCollider = colliders[colliders.length - 1];

  // ---- BAPTISM POOL ---- (tucked between prayer room and pastor's office)
  buildBaptismPool(scene, add, zones);

  const lockCanvas = document.createElement("canvas");
  lockCanvas.width = 256; lockCanvas.height = 64;
  const lctx = lockCanvas.getContext("2d");
  lctx.fillStyle = "#888"; lctx.font = "bold 28px Arial";
  lctx.fillText("🔒 EXPANSION ZONE", 10, 44);
  zones.lockSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lockCanvas), transparent: true })
  );
  zones.lockSprite.position.set(0, 5,-58);
  zones.lockSprite.scale.set(8, 2, 1);
  scene.add(zones.lockSprite);

  // ---- PATHWAYS ----
  add(makeFloor(6, 5, 0xD4C5A9, 0, 2.5, 0.015));
  add(makeFloor(5, 8, 0xD4C5A9, 16, 3, 0.015));   // east path widened to reach the courtyard
  add(makeFloor(5, 8, 0xD4C5A9,-16, 3, 0.015));   // west path widened to reach the fellowship hall
  add(makeFloor(6, 14, 0xD4C5A9, 0,-38, 0.015));  // back path now reaches prayer/office
  add(makeFloor(8, 6, 0xD4C5A9,-8,-43, 0.015));   // spur to prayer room door
  add(makeFloor(8, 6, 0xD4C5A9, 8,-43, 0.015));   // spur to pastor's office door

  // ---- PARKING LOT (asphalt, lines, curb) ----
  // Widened to 48u so the outer parked cars (lotX = ±21, ~2u wide) sit fully on asphalt.
  add(makeFloor(48, 24, 0x3C3C42, 0, 28, 0.015));
  // White stripes between parking spaces (9 stripes -> 8 stalls per row, matching 8 parked cars)
  for (let i = -4; i <= 4; i++) {
    const stripeFront = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    stripeFront.rotation.x = -Math.PI / 2;
    stripeFront.position.set(i * 6, 0.05, 22);
    scene.add(stripeFront);
    const stripeBack = stripeFront.clone();
    stripeBack.position.set(i * 6, 0.05, 34);
    scene.add(stripeBack);
  }
  // Lane divider (extended to match the wider lot)
  for (let i = -4; i <= 4; i++) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.25),
      new THREE.MeshBasicMaterial({ color: 0xffff66 })
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(i * 5, 0.05, 28);
    scene.add(dash);
  }
  // Curb along the front of the church (just behind the foyer entrance)
  add(makeBox(24, 0.25, 0.4, 0xCCCCCC, 0, 0, 12.5));

  // ---- BASKETBALL COURT ---- (east of the parking lot)
  buildBasketballCourt(scene, add, colliders, zones);

  // ---- PLAYGROUND ---- (east of the courtyard "park" area)
  buildPlayground(scene, add, colliders, zones);

  // ---- NEIGHBORHOOD ---- (residential street south of the parking lot)
  // Connector road from the parking lot exit (z=34) down to the main street (z=44)
  add(makeFloor(8, 12, 0x3C3C42, 0, 40, 0.016));
  // Main east-west street
  add(makeFloor(90, 8, 0x3C3C42, 0, 48, 0.016));
  // Yellow dashed center line
  for (let i = -10; i <= 10; i++) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 0.2),
      new THREE.MeshBasicMaterial({ color: 0xffff66 })
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(i * 4, 0.05, 48);
    scene.add(dash);
  }

  // Four houses with driveways. Each driveway is a parkable zone.
  zones.parkingSpots = [];
  const HOMES = [
    { name: "The Smiths' House",   x: -32, color: 0xE8B4A0, roof: 0x6E2A1F, door: 0x3E2723 },
    { name: "The Johnsons' House", x: -12, color: 0xB4D6F0, roof: 0x2C4A6E, door: 0x1B3554 },
    { name: "The Browns' House",   x:  12, color: 0xEFDFAF, roof: 0x7A5A2A, door: 0x4A2E0F },
    { name: "The Garcias' House",  x:  32, color: 0xCBB3E0, roof: 0x4B2D6A, door: 0x2A1444 },
  ];
  HOMES.forEach(h => buildHouse(scene, add, colliders, zones, h));

  // ---- INVISIBLE BOUNDARY WALLS ----
  const invis = new THREE.MeshBasicMaterial({ visible: false });
  [[160,8,0.5,0,0,-85],[160,8,0.5,0,0,82],[0.5,8,170,-80,0,-10],[0.5,8,170,80,0,-10]]
    .forEach(([w, h, d, x, y, z]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), invis);
      m.position.set(x, y + h / 2, z);
      scene.add(m);
      colliders.push(new THREE.Box3().setFromObject(m));
    });

  zones.colliders = colliders;
  return { colliders, zones };
}

// Call once per frame with the player's world position. When the player is
// inside a house, that house's roof + ridge are hidden so the third-person
// camera can see in; they reappear once the player walks out.
export function updateHouses(zones, playerPos) {
  if (!zones || !zones.houses) return;
  for (const h of zones.houses) {
    const inside =
      Math.abs(playerPos.x - h.cx) < h.halfW &&
      Math.abs(playerPos.z - h.cz) < h.halfD;
    for (const part of h.roofParts) {
      if (part.visible === inside) part.visible = !inside;
    }
  }
}
