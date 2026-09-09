// ---------------------------------------------------------------------------
// render.js — everything you see on the canvas.
//
// Drawn in world units (see art.js): the street is VIEW_W x VIEW_H of them and
// game.js scales that up to the window at the screen's real pixel density. So
// the shapes here are smooth curves and rounded corners rather than blocks.
//
// The street runs vertically, so the camera only ever scrolls in y.
// ---------------------------------------------------------------------------

function drawWorld(ctx, g) {
  const cam = g.camera;
  ctx.save();
  ctx.translate(cam.shakeX, -cam.y + cam.shakeY);

  drawGround(ctx, cam, g);

  // Collect everything that needs to overlap correctly, then paint it back to
  // front by its y position — that's what sells the depth from above.
  const drawables = [];
  const top = cam.y - 70, bot = cam.y + VIEW_H + 70;

  for (const h of g.world.houses) {
    if (h.y1 < top || h.y0 > bot) continue;
    drawables.push({ y: h.y0, draw: () => drawHouse(ctx, h) });
  }
  for (const car of g.world.cars) {
    if (car.y < top - 40 || car.y > bot + 40) continue;
    drawables.push({ y: car.y, draw: () => drawCar(ctx, car) });
  }
  for (const dog of g.world.dogs) {
    if (dog.y < top || dog.y > bot) continue;
    drawables.push({ y: dog.y, draw: () => drawDog(ctx, dog) });
  }
  for (const n of g.world.neighbours) {
    if (n.y < top || n.y > bot) continue;
    drawables.push({ y: n.y, draw: () => drawNeighbour(ctx, n) });
  }
  // Trees sort by the foot of the trunk, so you pass behind one when you're
  // above it and in front of it when you're below — you walk under the canopy.
  for (const t of g.world.trees) {
    if (t.y < top || t.y > bot + 30) continue;
    drawables.push({ y: t.y, draw: () => drawTree(ctx, t, g.time) });
  }
  drawables.push({ y: g.player.y, draw: () => drawPostman(ctx, g.player) });

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  drawEffects(ctx, g);
  ctx.restore();

  drawCloudShadows(ctx, g);
}

// ---------------------------------------------------------------------------
// Ground: grass, pavements, road, markings.
// ---------------------------------------------------------------------------
function drawGround(ctx, cam, g) {
  const y0 = cam.y - 10;
  const h = VIEW_H + 20;

  ctx.fillStyle = C.grass;
  ctx.fillRect(0, y0, VIEW_W, h);

  // Soft tufts of darker grass. Positions come from the world coordinate, not
  // from time, so the texture stays put as the street scrolls past.
  ctx.fillStyle = C.grassShade;
  const step = 13;
  for (let gy = Math.floor(y0 / step) * step; gy < y0 + h; gy += step) {
    for (let gx = 3; gx < VIEW_W; gx += step) {
      const n = (gx * 37 + gy * 61) % 100;
      if (n < 26) {
        const ox = ((gy / step) % 2) * 6 + (n % 5);
        ellipse(ctx, gx + ox, gy + (n % 7), 2.2, 1.1, C.grassShade);
      }
    }
  }

  // Pavements, with a soft joint line every so often.
  for (const band of [BAND.leftWalk, BAND.rightWalk]) {
    ctx.fillStyle = C.pavement;
    ctx.fillRect(band[0], y0, band[1] - band[0], h);
    ctx.fillStyle = C.pavementLine;
    for (let sy = Math.floor(y0 / 16) * 16; sy < y0 + h; sy += 16) {
      ctx.fillRect(band[0], sy, band[1] - band[0], 0.5);
    }
  }

  // Road, with a raised kerb either side.
  ctx.fillStyle = C.road;
  ctx.fillRect(BAND.road[0], y0, BAND.road[1] - BAND.road[0], h);
  ctx.fillStyle = C.kerb;
  ctx.fillRect(BAND.road[0], y0, 2, h);
  ctx.fillRect(BAND.road[1] - 2, y0, 2, h);

  // A few lighter patches so the tarmac isn't a flat slab.
  for (let py = Math.floor(y0 / 43) * 43; py < y0 + h; py += 43) {
    const px1 = BAND.road[0] + 9 + ((py * 17) % 38);
    ellipse(ctx, px1, py, 6, 3.5, C.roadLight);
    ellipse(ctx, px1 + 9, py + 15, 4, 2.4, C.roadLight);
  }

  // Double centre line, with rounded ends.
  for (let ly = Math.floor(y0 / 20) * 20; ly < y0 + h; ly += 20) {
    stroke(ctx, ROAD_MID - 2, ly, ROAD_MID - 2, ly + 11, 1.5, C.roadLine, true);
    stroke(ctx, ROAD_MID + 2, ly, ROAD_MID + 2, ly + 11, 1.5, C.roadLine, true);
  }
}

// ---------------------------------------------------------------------------
// A house: the roof seen from above, with its front wall folded out towards the
// road so you can see the door and windows.
// ---------------------------------------------------------------------------
function drawHouse(ctx, h) {
  const p = h.palette;
  const left = h.side === 'left';
  const w = h.x1 - h.x0;

  // Soft shadow on the grass.
  rr(ctx, h.x0 + 1.5, h.y0 + 2, w, h.depth, 4, 'rgba(38, 54, 32, 0.15)');

  // --- Garden ---------------------------------------------------------------
  const gardenX0 = left ? h.x1 : BAND.rightYard[0];
  const gardenX1 = left ? BAND.leftWalk[0] : h.x0;
  const pathW = h.type === 'porch' ? 9 : 7;
  rr(ctx, gardenX0, h.cy - pathW / 2, gardenX1 - gardenX0, pathW, 1.5, C.path);

  // --- The building ---------------------------------------------------------
  // Roof and front wall are painted inside one rounded silhouette, so the house
  // reads as a single building rather than two shapes butted together.
  const roofX0 = left ? h.x0 : h.x0 + FACADE;
  const roofW = (left ? h.x1 - FACADE : h.x1) - roofX0;
  const wallX = left ? h.x1 - FACADE : h.x0;

  ctx.save();
  rrPath(ctx, h.x0, h.y0, w, h.depth, 4);
  ctx.clip();

  // Roof.
  ctx.fillStyle = p.roof;
  ctx.fillRect(roofX0, h.y0, roofW, h.depth);
  // The far slope, away from the street, catches less light.
  ctx.fillStyle = p.dark;
  ctx.fillRect(left ? roofX0 : roofX0 + roofW - 7, h.y0, 7, h.depth);

  // Front wall.
  ctx.fillStyle = C.wall;
  ctx.fillRect(wallX, h.y0, FACADE, h.depth);
  // Shade on the wall where the roof overhangs it.
  ctx.fillStyle = C.wallShade;
  ctx.fillRect(left ? wallX : wallX + FACADE - 2.5, h.y0, 2.5, h.depth);
  // ...and the shadow the roof casts onto it.
  ctx.fillStyle = 'rgba(70, 60, 48, 0.13)';
  ctx.fillRect(left ? wallX : wallX + FACADE - 4, h.y0, 4, h.depth);

  // The ridge, just a whisper of a highlight.
  const ridge = roofX0 + roofW * (left ? 0.62 : 0.38);
  stroke(ctx, ridge, h.y0 + 4, ridge, h.y1 - 4, 0.7,
         'rgba(255, 255, 255, 0.10)', true);

  ctx.restore();

  // A soft outline holds the whole shape together against the grass.
  rrPath(ctx, h.x0, h.y0, w, h.depth, 4);
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = p.dark;
  ctx.stroke();

  // Chimney, sitting on the roof.
  rr(ctx, ridge - 2.2, h.y0 + 5.5, 4.4, 5.5, 1.2, C.chimney);
  rr(ctx, ridge - 2.8, h.y0 + 5, 5.6, 1.8, 0.9, '#b6bcc5');

  drawHouseFront(ctx, h, wallX, left);

  // --- Fence or mailbox -----------------------------------------------------
  if (h.type === 'porch') {
    drawFence(ctx, h);
    drawBush(ctx, left ? h.x1 + 4 : h.x0 - 4, h.y0 + 7);
    drawBush(ctx, left ? h.x1 + 4 : h.x0 - 4, h.y1 - 7);
  } else {
    drawMailbox(ctx, h);
    drawBush(ctx, left ? h.x1 + 4 : h.x0 - 4, h.y0 + 6);
  }
}

// Door and windows on the street-facing wall.
function drawHouseFront(ctx, h, wallX, left) {
  const p = h.palette;
  const doorH = 13;
  const doorY = h.cy - doorH / 2;

  rr(ctx, wallX + 2, doorY, FACADE - 4, doorH, 2, C.door);
  rr(ctx, wallX + 2, doorY, FACADE - 4, 2.4, 1.2, C.doorShade);
  // Knob, on the road side of the door.
  circle(ctx, left ? wallX + FACADE - 4 : wallX + 4, h.cy + 2.5, 0.9, C.gold);

  // Letter slot — turns gold once this house is done.
  rr(ctx, wallX + 3.6, h.cy - 3.4, FACADE - 7.2, 1.6, 0.8,
     h.delivered ? C.gold : 'rgba(0,0,0,0.35)');

  // A window either side of the door.
  for (const wy of [h.y0 + 6, h.y1 - 16]) {
    rr(ctx, wallX + 1.6, wy, FACADE - 3.2, 10, 1.8, C.window);
    rr(ctx, wallX + 1.6, wy, FACADE - 3.2, 4, 1.8, C.windowGlint);
    rrPath(ctx, wallX + 1.6, wy, FACADE - 3.2, 10, 1.8);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = C.wall;
    ctx.stroke();
  }

  if (h.delivered && h.type === 'porch') {
    drawTick(ctx, left ? h.x1 + 5 : h.x0 - 5, h.cy - 15);
  }
}

function drawFence(ctx, h) {
  const f = h.fence;
  for (let y = f.y0; y < f.y1 - 1; y += 4.2) {
    if (y > f.gate0 - 4 && y < f.gate1) continue;      // leave the gate open
    rr(ctx, f.x - 1.6, y, 3.2, 3.4, 1.4, C.fence);
  }
  // Rails behind the pickets.
  for (const seg of [[f.y0, f.gate0 - 4], [f.gate1, f.y1]]) {
    if (seg[1] - seg[0] > 1) {
      stroke(ctx, f.x, seg[0], f.x, seg[1], 1, C.fenceShade, true);
    }
  }
}

function drawMailbox(ctx, h) {
  const m = h.mailbox;
  const cx = m.x + 4.5;
  const top = m.y + 3;

  groundShadow(ctx, cx, m.y + 14, 4, 1.6, 0.16);

  // Post.
  rr(ctx, cx - 1.3, m.y + 5, 2.6, 9.5, 1.2, C.post);

  // Box: a rounded arch lying on its side.
  rr(ctx, cx - 5, top - 3, 10, 7.5, 3.2, C.mailbox);
  rr(ctx, cx - 5, top + 1.5, 10, 3, 1.4, C.mailboxDark);

  // Flag, which drops once the letter is in. h.flagT eases 0 -> 1.
  const t = h.flagT;
  const fx = h.side === 'left' ? cx - 5.6 : cx + 5.6;
  ctx.save();
  ctx.translate(fx, top + 1);
  ctx.rotate((h.side === 'left' ? -1 : 1) * t * 1.5);
  rr(ctx, -0.7, -5.5, 1.4, 6, 0.7, t > 0.5 ? '#a8483f' : C.flag);
  rr(ctx, -0.7, -5.5, 3.4, 2.6, 0.8, t > 0.5 ? '#a8483f' : C.flag);
  ctx.restore();

  if (h.delivered) drawTick(ctx, cx, m.y - 5);
}

function drawBush(ctx, x, y) {
  groundShadow(ctx, x, y + 3.4, 3.6, 1.3, 0.14);
  circle(ctx, x - 1.8, y + 1.4, 2.6, C.bushDark);
  circle(ctx, x + 1.8, y + 1.4, 2.4, C.bushDark);
  circle(ctx, x, y - 0.4, 3.1, C.bush);
  circle(ctx, x - 0.9, y - 1.4, 1.3, C.bushLight);
}

function drawTick(ctx, cx, cy) {
  circle(ctx, cx, cy, 2.4, C.mint);
  ctx.beginPath();
  ctx.moveTo(cx - 1.1, cy);
  ctx.lineTo(cx - 0.3, cy + 0.9);
  ctx.lineTo(cx + 1.2, cy - 1);
  ctx.lineWidth = 0.85;
  ctx.strokeStyle = '#12301f';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// ---------------------------------------------------------------------------
// The postman. Built from a few rounded shapes: legs, body, satchel, head, cap.
// During a hop the whole figure lifts up the screen while its shadow stays on
// the ground, which is what reads as "in the air" from above.
// ---------------------------------------------------------------------------
function drawPostman(ctx, p) {
  const lift = hopHeight(p);
  const facing = p.facing;
  const swing = p.walking ? Math.sin(p.anim * Math.PI) * 1.9 : 0;

  // Shadow shrinks and softens as he rises.
  const k = 1 - lift / (HOP_HEIGHT * 2.2);
  groundShadow(ctx, p.x, p.y - 1, 5.2 * k, 2.1 * k, 0.2 * k);

  // Flicker during the grace period after a hit.
  if (p.invulnT > 0 && Math.floor(p.invulnT * 18) % 2 === 0) return;

  ctx.save();
  ctx.translate(p.x, p.y - lift);
  if (p.stunT > 0) ctx.rotate(Math.sin(p.stunT * 26) * 0.11);

  const side = facing === 'left' || facing === 'right';
  const dir = facing === 'left' ? -1 : 1;

  // --- Legs -----------------------------------------------------------------
  if (side) {
    rr(ctx, -1.6 + swing * 0.5 * dir, -5.4, 3.2, 5.4, 1.5, C.trousers);
    rr(ctx, -1.6 - swing * 0.5 * dir, -5.4, 3.2, 5.4, 1.5, C.trousers);
    rr(ctx, -1.9 + swing * 0.7 * dir, -1.6, 3.8, 1.9, 0.9, C.shoe);
  } else {
    rr(ctx, -3.1, -5.4 + Math.abs(swing) * 0.3, 2.9, 5.4, 1.4, C.trousers);
    rr(ctx,  0.2, -5.4 - Math.abs(swing) * 0.3, 2.9, 5.4, 1.4, C.trousers);
    rr(ctx, -3.3, -1.7, 3.2, 1.9, 0.9, C.shoe);
    rr(ctx,  0.1, -1.7, 3.2, 1.9, 0.9, C.shoe);
  }

  // --- Body -----------------------------------------------------------------
  const bodyW = side ? 6.6 : 8.4;
  rr(ctx, -bodyW / 2, -12.6, bodyW, 8, 2.8, C.uniform);
  // A darker side so he isn't a flat slab of blue.
  ctx.save();
  rrPath(ctx, -bodyW / 2, -12.6, bodyW, 8, 2.8);
  ctx.clip();
  ctx.fillStyle = C.uniformDark;
  ctx.fillRect(bodyW / 2 - 2.2, -12.6, 2.2, 8);
  ctx.restore();

  // --- Satchel, on his hip --------------------------------------------------
  const bagX = side ? -bodyW / 2 - 1.4 : bodyW / 2 - 1.6;
  rr(ctx, bagX, -8.4, 3.8, 4.4, 1.4, C.satchel);
  rr(ctx, bagX, -8.4, 3.8, 1.5, 0.7, C.satchelDark);
  stroke(ctx, bagX + 1.9, -8.4, bagX + 1.9 - (side ? -1 : 1) * 3.2, -12.2,
         1.1, C.satchelDark, true);

  // --- Head -----------------------------------------------------------------
  const headY = -15.4;
  circle(ctx, 0, headY, 3.9, C.skin);
  if (facing === 'up') circle(ctx, 0, headY, 3.9, C.skinShade);

  // Eyes.
  if (facing === 'down') {
    circle(ctx, -1.5, headY + 0.6, 0.62, C.ink);
    circle(ctx,  1.5, headY + 0.6, 0.62, C.ink);
  } else if (side) {
    circle(ctx, 1.7 * dir, headY + 0.5, 0.62, C.ink);
  }

  // --- Cap ------------------------------------------------------------------
  ctx.beginPath();
  ctx.arc(0, headY - 0.2, 4.1, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = C.cap;
  ctx.fill();
  // Brim, pointing whichever way he's looking.
  if (facing === 'down') {
    rr(ctx, -4.3, headY - 0.6, 8.6, 1.9, 0.9, C.cap);
  } else if (side) {
    rr(ctx, dir > 0 ? -1 : -5.2, headY - 0.7, 6.2, 1.8, 0.9, C.cap);
  } else {
    rr(ctx, -4, headY - 0.9, 8, 1.7, 0.8, C.cap);
  }

  ctx.restore();

  // Dizzy stars while stunned.
  if (p.stunT > 0) {
    for (let i = 0; i < 3; i++) {
      const a = p.stunT * 7 + i * 2.1;
      circle(ctx, p.x + Math.cos(a) * 6.5, p.y - 21 - lift + Math.sin(a) * 2.2,
             0.9, C.gold);
    }
  }
}

// ---------------------------------------------------------------------------
// The dog.
// ---------------------------------------------------------------------------
function drawDog(ctx, dog) {
  const d = dog.facing < 0 ? -1 : 1;
  const trot = Math.sin(dog.anim * Math.PI) * 1.2;

  groundShadow(ctx, dog.x, dog.y - 1, 6, 2.2, 0.18);

  ctx.save();
  ctx.translate(dog.x, dog.y);
  ctx.scale(d, 1);

  // Legs.
  rr(ctx, -3.6 + trot, -4.2, 2, 4, 0.9, C.dogDark);
  rr(ctx,  2 - trot, -4.2, 2, 4, 0.9, C.dogDark);

  // Tail, flicking.
  stroke(ctx, -4.4, -7.4, -6.6, -9.4 - trot * 0.8, 1.5, C.dog, true);

  // Body and head.
  rr(ctx, -5, -9.6, 9.4, 6.2, 3, C.dog);
  circle(ctx, 5.1, -9.4, 3.4, C.dog);

  // Ear and snout.
  rr(ctx, 3.4, -13.4, 2.6, 3.4, 1.2, C.dogDark);
  rr(ctx, 6.4, -9.2, 3.2, 2.6, 1.2, C.dog);
  circle(ctx, 9.2, -8.6, 0.85, C.dogNose);
  circle(ctx, 5.6, -10.2, 0.6, C.ink);

  ctx.restore();

  // "!" when it first spots you.
  if (dog.barkT > 0 && !dog.happy) {
    const bx = dog.x, by = dog.y - 19;
    circle(ctx, bx, by, 4.2, '#ffffff');
    rr(ctx, bx - 0.7, by - 2.4, 1.4, 3, 0.7, '#d0453a');
    circle(ctx, bx, by + 2.1, 0.75, '#d0453a');
  }

  // A heart once it's had its biscuit — big for a moment, then a small one so
  // you can see at a glance which dogs are already friends.
  if (dog.happy) {
    const big = dog.heartT > 0;
    const rise = big ? (1.4 - dog.heartT) * 4 : 0;
    drawHeart(ctx, dog.x, dog.y - 16 - rise, big ? 3.4 : 2.1);
  }
}

function drawHeart(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.95);
  ctx.bezierCurveTo(-r * 1.5, -r * 0.25, -r * 0.6, -r * 1.25, 0, -r * 0.42);
  ctx.bezierCurveTo(r * 0.6, -r * 1.25, r * 1.5, -r * 0.25, 0, r * 0.95);
  ctx.closePath();
  ctx.fillStyle = C.pink;
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// A tree: a trunk with a cluster of overlapping blobs for the canopy. The whole
// crown sways very gently, each tree slightly out of step with its neighbours.
// ---------------------------------------------------------------------------
function drawTree(ctx, t, time) {
  const s = t.size;
  const sway = Math.sin(time * 0.7 + t.sway) * (s * 0.035);
  const cx = t.x + t.lean * s * 0.3 + sway;
  const cy = t.y - s * 1.55;

  // Shadow on the grass, thrown slightly to one side.
  ellipse(ctx, t.x + s * 0.22, t.y - s * 0.06, s * 0.85, s * 0.34,
          'rgba(38, 54, 32, 0.20)');

  // Trunk, leaning very slightly.
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.lean * 0.06);
  rr(ctx, -s * 0.13, -s * 1.5, s * 0.26, s * 1.5, s * 0.1, '#7d5a3c');
  rr(ctx, -s * 0.13, -s * 1.5, s * 0.11, s * 1.5, s * 0.06, '#6a4a30');
  ctx.restore();

  // Canopy: a darker base, then lighter blobs stacked on top.
  circle(ctx, cx - s * 0.5, cy + s * 0.34, s * 0.72, t.tint.dark);
  circle(ctx, cx + s * 0.52, cy + s * 0.3, s * 0.68, t.tint.dark);
  circle(ctx, cx, cy + s * 0.42, s * 0.8, t.tint.mid);
  circle(ctx, cx - s * 0.34, cy - s * 0.24, s * 0.66, t.tint.mid);
  circle(ctx, cx + s * 0.36, cy - s * 0.2, s * 0.62, t.tint.light);
  circle(ctx, cx - s * 0.06, cy - s * 0.5, s * 0.58, t.tint.light);
}

// ---------------------------------------------------------------------------
// A neighbour. Same build as the postman but shorter, in their own clothes,
// and with hair instead of a postal cap.
// ---------------------------------------------------------------------------
function drawNeighbour(ctx, n) {
  const swing = n.walking ? Math.sin(n.anim * Math.PI) * 1.6 : 0;
  const side = n.facing === 'left' || n.facing === 'right';
  const dir = n.facing === 'left' ? -1 : 1;
  const h = n.height;

  groundShadow(ctx, n.x, n.y - 1, 4.4, 1.8, 0.18);

  ctx.save();
  ctx.translate(n.x, n.y);

  // Legs.
  if (side) {
    rr(ctx, -1.4 + swing * 0.5 * dir, -h * 0.36, 2.8, h * 0.36, 1.3, n.pants);
    rr(ctx, -1.4 - swing * 0.5 * dir, -h * 0.36, 2.8, h * 0.36, 1.3, n.pants);
  } else {
    rr(ctx, -2.7, -h * 0.36 + Math.abs(swing) * 0.3, 2.5, h * 0.36, 1.2, n.pants);
    rr(ctx,  0.2, -h * 0.36 - Math.abs(swing) * 0.3, 2.5, h * 0.36, 1.2, n.pants);
  }

  // Body.
  const bodyW = side ? 5.8 : 7.4;
  const bodyH = h * 0.44;
  rr(ctx, -bodyW / 2, -h * 0.79, bodyW, bodyH, 2.5, n.shirt);
  ctx.save();
  rrPath(ctx, -bodyW / 2, -h * 0.79, bodyW, bodyH, 2.5);
  ctx.clip();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.fillRect(bodyW / 2 - 2, -h * 0.79, 2, bodyH);
  ctx.restore();

  // Head.
  const headY = -h * 0.79 - 3.3;
  circle(ctx, 0, headY, 3.5, n.skin);

  // Hair, sitting over the top of the head.
  ctx.beginPath();
  ctx.arc(0, headY - (n.facing === 'up' ? 0.1 : 0.5), 3.6,
          Math.PI * (n.facing === 'up' ? 0.02 : 0.06),
          Math.PI * (n.facing === 'up' ? 0.98 : 0.94), true);
  ctx.closePath();
  ctx.fillStyle = n.hair;
  ctx.fill();

  // Eyes.
  if (n.facing === 'down') {
    circle(ctx, -1.3, headY + 0.7, 0.55, C.ink);
    circle(ctx,  1.3, headY + 0.7, 0.55, C.ink);
  } else if (side) {
    circle(ctx, 1.5 * dir, headY + 0.6, 0.55, C.ink);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Cars, seen from above. `dir` is -1 driving up the screen, +1 down, so the
// bonnet and headlights go on whichever end is leading.
// ---------------------------------------------------------------------------
function drawCar(ctx, car) {
  const w = car.w, h = car.h;
  const x = car.x - w / 2, y = car.y - h / 2;
  const c = car.palette;
  const up = car.dir < 0;

  // Shadow, offset so the car reads as sitting above the tarmac.
  rr(ctx, x + 1.2, y + 1.8, w, h, w * 0.34, 'rgba(20, 26, 32, 0.26)');

  // Wheels.
  for (const wy of [y + 5, y + h - 11]) {
    rr(ctx, x - 1.1, wy, 2.4, 6, 1.1, '#22262e');
    rr(ctx, x + w - 1.3, wy, 2.4, 6, 1.1, '#22262e');
  }

  // Body.
  rr(ctx, x, y, w, h, w * 0.34, c.body);
  // A darker flank down one side.
  ctx.save();
  rrPath(ctx, x, y, w, h, w * 0.34);
  ctx.clip();
  ctx.fillStyle = c.dark;
  ctx.fillRect(x + w - 3.4, y, 3.4, h);
  ctx.restore();

  // Roof.
  const roofY = y + h * 0.3;
  const roofH = h * 0.36;
  rr(ctx, x + 1.8, roofY, w - 3.6, roofH, 2.4, c.dark);

  // Windscreen at the leading end, rear window behind.
  const glass = 'rgba(190, 226, 242, 0.95)';
  rr(ctx, x + 2.4, up ? roofY - 4.4 : roofY + roofH - 0.4, w - 4.8, 4.6, 1.8, glass);
  rr(ctx, x + 3.2, up ? roofY + roofH - 0.4 : roofY - 3.6, w - 6.4, 3.8, 1.6,
     'rgba(150, 194, 214, 0.9)');

  // Lights.
  const frontY = up ? y + 1.2 : y + h - 3.2;
  const backY  = up ? y + h - 3 : y + 1.4;
  rr(ctx, x + 1.8, frontY, 3.6, 2, 1, '#fff3c4');
  rr(ctx, x + w - 5.4, frontY, 3.6, 2, 1, '#fff3c4');
  rr(ctx, x + 1.8, backY, 3.4, 1.8, 0.9, '#e05a4c');
  rr(ctx, x + w - 5.2, backY, 3.4, 1.8, 0.9, '#e05a4c');
}

// ---------------------------------------------------------------------------
// Floating "+1" popups, dust puffs, the biscuit.
// ---------------------------------------------------------------------------
function drawEffects(ctx, g) {
  for (const e of g.effects) {
    const life = e.t / e.life;                 // 1 -> 0 as it fades
    ctx.globalAlpha = Math.min(1, life * 2.2);

    if (e.type === 'popup') {
      text(ctx, e.text, e.x, e.y - (1 - life) * 14, 8, e.colour,
           { outline: 'rgba(20, 26, 34, 0.55)' });
    } else if (e.type === 'biscuit') {
      const bx = e.x, by = e.y - (1 - life) * 6;
      rr(ctx, bx - 2.4, by - 1.6, 4.8, 3.2, 1.4, '#e0b46a');
      circle(ctx, bx - 0.8, by - 0.2, 0.4, '#b8873f');
      circle(ctx, bx + 0.9, by + 0.4, 0.4, '#b8873f');
    } else if (e.type === 'dust') {
      const spread = (1 - life) * 7;
      circle(ctx, e.x - 3 - spread, e.y - 2, 1.4 * life + 0.5, '#efe9da');
      circle(ctx, e.x + 3 + spread, e.y - 2, 1.4 * life + 0.5, '#efe9da');
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Slow-drifting cloud shadows over the whole scene. Drawn last, in screen
// space, so they pass over houses and postman alike.
// ---------------------------------------------------------------------------
function drawCloudShadows(ctx, g) {
  ctx.fillStyle = 'rgba(34, 52, 34, 0.06)';

  // How many clouds it takes to dapple the view. A tall phone screen shows
  // nearly three times as much street as the desktop 4:3 box, and three fixed
  // clouds spread over that distance leave the sky looking bare.
  const count = Math.max(3, Math.round(VIEW_H / 50));

  for (let i = 0; i < count; i++) {
    const h = 70 + (i % 3) * 26;
    const span = VIEW_H + h * 2;
    // Each cloud gets its own drift speed AND its own head start, so they don't
    // line up in rows once there are more than three of them.
    const drift = g.time * (4 + (i % 3) * 2) - g.camera.y * 0.22 + i * 97;
    const y = (((drift % span) + span) % span) - h;
    // Step across the street and wrap, so they stagger instead of stacking up
    // in the same three columns however many there are.
    const x = ((i * 78) % (VIEW_W + 40)) - 20;
    ctx.beginPath();
    ctx.ellipse(x + 45, y + h / 2, 58, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
