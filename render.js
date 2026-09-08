// ---------------------------------------------------------------------------
// render.js — everything you see on the canvas.
//
// The canvas is only 200x150 pixels. CSS blows it up to fill the window with
// smoothing turned off, which is what gives the chunky Minecraft-ish look.
// So: one unit here really is one fat visible pixel. Keep coordinates whole.
//
// The street runs vertically, so the camera only scrolls in y.
// ---------------------------------------------------------------------------

const COL = {
  grass:      '#7fc14a',
  grassDark:  '#6cae3d',
  grassLight: '#95d25e',
  road:       '#6f7480',
  roadDark:   '#5f6470',
  roadPatch:  '#787d88',
  lane:       '#e8dc72',
  curb:       '#b9b4a4',
  walk:       '#cfc9b6',
  walkEdge:   '#b3ad99',
  shadow:     'rgba(28, 40, 22, 0.24)',
  path:       '#ddd6c2',
  bush:       '#4e9a4a',
  bushDark:   '#3d7d3b',
};

// ---------------------------------------------------------------------------
// The main draw. `g` is the whole game state (see game.js).
// ---------------------------------------------------------------------------
function drawWorld(ctx, g) {
  const cam = g.camera;
  ctx.save();
  ctx.translate(Math.round(cam.shakeX), -Math.round(cam.y) + Math.round(cam.shakeY));

  drawGround(ctx, cam);

  // Collect everything that needs to overlap correctly, then paint it back to
  // front by its y position — that's what sells the depth from above.
  const drawables = [];
  const top = cam.y - 60, bot = cam.y + VIEW_H + 60;

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
  drawables.push({ y: g.player.y, draw: () => drawPostman(ctx, g.player) });

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  drawEffects(ctx, g);

  ctx.restore();

  drawCloudShadows(ctx, g);
}

// ---------------------------------------------------------------------------
// Ground: grass, pavements, road, lane markings.
// ---------------------------------------------------------------------------
function drawGround(ctx, cam) {
  const y0 = Math.floor(cam.y) - 4;
  const h = VIEW_H + 8;

  px(ctx, 0, y0, VIEW_W, h, COL.grass);

  // A sparse dither of darker grass tufts. Tied to world position (not time)
  // so the texture stays put as the camera scrolls.
  ctx.fillStyle = COL.grassDark;
  const step = 9;
  for (let gy = Math.floor(y0 / step) * step; gy < y0 + h; gy += step) {
    for (let gx = 2; gx < VIEW_W; gx += step) {
      if (((gx * 7 + gy * 13) % 29) < 6) {
        ctx.fillRect(gx + ((gy / step) % 2) * 4, gy, 2, 1);
      }
    }
  }

  // Pavements, with slab joints running across them.
  for (const band of [BAND.leftWalk, BAND.rightWalk]) {
    px(ctx, band[0], y0, band[1] - band[0], h, COL.walk);
    ctx.fillStyle = COL.walkEdge;
    for (let sy = Math.floor(y0 / 15) * 15; sy < y0 + h; sy += 15) {
      ctx.fillRect(band[0], sy, band[1] - band[0], 1);
    }
  }

  // Road.
  px(ctx, BAND.road[0], y0, BAND.road[1] - BAND.road[0], h, COL.road);
  px(ctx, BAND.road[0], y0, 3, h, COL.curb);            // kerbs
  px(ctx, BAND.road[1] - 3, y0, 3, h, COL.curb);
  px(ctx, BAND.road[0] + 3, y0, 2, h, COL.roadDark);
  px(ctx, BAND.road[1] - 5, y0, 2, h, COL.roadDark);

  // Scattered tarmac patches, so the road isn't a flat grey slab.
  ctx.fillStyle = COL.roadPatch;
  for (let py = Math.floor(y0 / 37) * 37; py < y0 + h; py += 37) {
    const px1 = BAND.road[0] + 8 + ((py * 17) % 40);
    ctx.fillRect(px1, py, 9, 5);
    ctx.fillRect(px1 + 3, py + 5, 5, 3);
  }

  // Double yellow line down the middle.
  ctx.fillStyle = COL.lane;
  for (let ly = Math.floor(y0 / 18) * 18; ly < y0 + h; ly += 18) {
    ctx.fillRect(ROAD_MID - 3, ly, 2, 11);
    ctx.fillRect(ROAD_MID + 1, ly, 2, 11);
  }
}

// ---------------------------------------------------------------------------
// A house: roof seen from above, with its front wall folded out towards the
// road so you can see the door and windows. Plus a garden path, and either a
// mailbox at the kerb or a picket fence around the front garden.
// ---------------------------------------------------------------------------
function drawHouse(ctx, h) {
  const p = h.palette;
  const left = h.side === 'left';

  // Ground shadow, so houses don't look like they float.
  px(ctx, h.x0, h.y1, h.x1 - h.x0, 2, 'rgba(30,45,25,0.18)');

  // --- Roof --------------------------------------------------------------
  const roofX0 = left ? h.x0 : h.x0 + FACADE;
  const roofX1 = left ? h.x1 - FACADE : h.x1;
  const roofW = roofX1 - roofX0;
  px(ctx, roofX0, h.y0, roofW, h.depth, p.roof);

  // Ridge running along the street, highlight one side and shade the other.
  const ridge = Math.round(roofX0 + roofW / 2);
  px(ctx, roofX0, h.y0, roofW / 2, h.depth, shade(p.roof, 1.09));
  px(ctx, ridge, h.y0, 1, h.depth, shade(p.roof, 1.2));

  // Shingle rows.
  ctx.fillStyle = shade(p.roof, 0.88);
  for (let sy = h.y0 + 4; sy < h.y1 - 1; sy += 5) {
    ctx.fillRect(roofX0, sy, roofW, 1);
  }
  // Eaves at the outer edge and where the roof meets the facade.
  px(ctx, left ? roofX0 : roofX1 - 2, h.y0, 2, h.depth, shade(p.roof, 0.78));

  // Chimney.
  px(ctx, ridge - 2, h.y0 + 5, 5, 7, '#9aa0a8');
  px(ctx, ridge - 2, h.y0 + 5, 5, 2, '#b9bfc6');

  // --- Front wall, facing the road ---------------------------------------
  const wallX = left ? h.x1 - FACADE : h.x0;
  px(ctx, wallX, h.y0, FACADE, h.depth, p.wall);
  px(ctx, wallX, h.y0, FACADE, 1, shade(p.wall, 0.85));
  px(ctx, wallX, h.y1 - 1, FACADE, 1, shade(p.wall, 0.85));

  drawHouseFront(ctx, h, wallX, p, left);

  // --- Garden --------------------------------------------------------------
  const gardenX0 = left ? h.x1 : BAND.rightYard[0];
  const gardenX1 = left ? BAND.leftWalk[0] : h.x0;

  if (h.type === 'porch') {
    // Path from the door out to the garden gate.
    px(ctx, gardenX0, h.cy - 4, gardenX1 - gardenX0, 8, COL.path);
    drawFence(ctx, h);
    drawBush(ctx, left ? h.x1 + 3 : h.x0 - 6, h.y0 + 6);
    drawBush(ctx, left ? h.x1 + 3 : h.x0 - 6, h.y1 - 10);
  } else {
    px(ctx, gardenX0, h.cy - 3, gardenX1 - gardenX0, 6, COL.path);
    drawMailbox(ctx, h);
    drawBush(ctx, left ? h.x1 + 2 : h.x0 - 5, h.y0 + 5);
  }
}

// Door and windows on the street-facing wall.
function drawHouseFront(ctx, h, wallX, p, left) {
  const doorX = left ? wallX + 2 : wallX + 2;
  const doorY = Math.round(h.cy - 7);

  // Doorstep.
  px(ctx, left ? wallX + FACADE - 1 : wallX - 1, doorY - 1, 2, 16, shade(p.wall, 0.8));

  px(ctx, doorX, doorY, FACADE - 4, 14, p.door);
  px(ctx, doorX, doorY, FACADE - 4, 1, shade(p.door, 1.3));
  px(ctx, doorX, doorY + 13, FACADE - 4, 1, shade(p.door, 0.75));
  // Door knob, on the road side of the door.
  px(ctx, left ? doorX + FACADE - 6 : doorX + 1, Math.round(h.cy), 1, 2, '#ffe08a');

  // Letter slot — glows gold once this house is done.
  px(ctx, doorX + 2, doorY + 5, FACADE - 8, 2, h.delivered ? '#ffe08a' : '#3a2a1c');

  // A window either side of the door, with frames and sills.
  for (const wy of [h.y0 + 7, h.y1 - 17]) {
    px(ctx, wallX + 1, wy, FACADE - 2, 10, '#ffffff');
    px(ctx, wallX + 2, wy + 1, FACADE - 4, 8, '#bfe3f5');
    px(ctx, wallX + 2, wy + 1, FACADE - 4, 3, '#d6eefa');   // glint
    px(ctx, wallX + 2, wy + 4, FACADE - 4, 1, '#ffffff');   // glazing bar
    px(ctx, wallX + 1, wy + 10, FACADE - 2, 1, shade(p.wall, 0.72));
  }

  if (h.delivered) {
    drawTick(ctx, left ? h.x1 + 4 : h.x0 - 4, h.cy - 14);
  }
}

function drawFence(ctx, h) {
  const f = h.fence;
  ctx.fillStyle = '#f4eee2';
  for (let y = f.y0; y < f.y1; y += 4) {
    if (y > f.gate0 - 4 && y < f.gate1) continue;         // leave the gate open
    ctx.fillRect(Math.round(f.x - 2), Math.round(y), 5, 3);
  }
  // Rails.
  ctx.fillStyle = '#dcd4c4';
  ctx.fillRect(Math.round(f.x), Math.round(f.y0), 1, Math.max(0, (f.gate0 - 4) - f.y0));
  ctx.fillRect(Math.round(f.x), Math.round(f.gate1), 1, Math.max(0, f.y1 - f.gate1));
}

function drawMailbox(ctx, h) {
  const m = h.mailbox;
  drawSprite(ctx, MAILBOX, m.x, m.y, PAL);

  // The flag stands up while there's mail to deliver and drops when done.
  // h.flagT eases 0 -> 1 on delivery so it animates rather than snapping.
  const t = h.flagT;
  const fx = m.x + (h.side === 'left' ? -2 : 9);
  const fy = m.y + 1 + Math.round(t * 5);
  const colour = t > 0.6 ? '#a8392b' : PAL.r;
  px(ctx, fx, fy, 2, 6 - Math.round(t * 3), colour);
  px(ctx, fx, fy, 3, 2, colour);

  if (h.delivered) drawTick(ctx, m.x + 4, m.y - 6);
}

function drawBush(ctx, x, y) {
  px(ctx, x, y + 1, 6, 5, COL.bush);
  px(ctx, x + 1, y, 4, 7, COL.bush);
  px(ctx, x + 1, y + 4, 4, 3, COL.bushDark);
  px(ctx, x + 2, y + 1, 2, 1, '#6fbf68');
}

function drawTick(ctx, cx, cy) {
  ctx.fillStyle = '#3fbf63';
  ctx.fillRect(Math.round(cx) - 3, Math.round(cy) + 2, 2, 2);
  ctx.fillRect(Math.round(cx) - 1, Math.round(cy) + 4, 2, 2);
  ctx.fillRect(Math.round(cx) + 1, Math.round(cy) + 1, 2, 3);
  ctx.fillRect(Math.round(cx) + 3, Math.round(cy) - 2, 2, 3);
}

// ---------------------------------------------------------------------------
// The postman. The sprite lifts up the screen during a hop while its shadow
// stays glued to the ground — that's what reads as "in the air" from above.
// ---------------------------------------------------------------------------
function drawPostman(ctx, p) {
  const lift = hopHeight(p);
  const frame = p.walking ? (Math.floor(p.anim) % 2) : 0;

  // Shadow shrinks as he rises.
  const s = 1 - lift / (HOP_HEIGHT * 1.8);
  ctx.fillStyle = COL.shadow;
  ctx.fillRect(Math.round(p.x - 5 * s), Math.round(p.y - 2), Math.round(10 * s), 3);

  // Flicker on and off during the grace period after a hit — the usual arcade
  // shorthand for "nothing can touch you right now".
  if (p.invulnT > 0 && Math.floor(p.invulnT * 18) % 2 === 0) return;

  let rows, flip = false;
  if (p.facing === 'up')        rows = POSTMAN.up[frame];
  else if (p.facing === 'down') rows = POSTMAN.down[frame];
  else { rows = POSTMAN.side[frame]; flip = (p.facing === 'left'); }

  // A stumble tips him sideways for a moment.
  const tilt = p.stunT > 0 ? Math.sin(p.stunT * 28) * 2 : 0;

  drawSprite(ctx, rows, p.x - 6 + tilt, p.y - 16 - lift, PAL, flip);

  // Little dizzy stars while stunned.
  if (p.stunT > 0) {
    ctx.fillStyle = '#ffe08a';
    for (let i = 0; i < 3; i++) {
      const a = p.stunT * 7 + i * 2.1;
      ctx.fillRect(Math.round(p.x + Math.cos(a) * 6),
                   Math.round(p.y - 21 + Math.sin(a) * 3), 2, 2);
    }
  }
}

function drawDog(ctx, dog) {
  ctx.fillStyle = COL.shadow;
  ctx.fillRect(Math.round(dog.x - 6), Math.round(dog.y - 2), 12, 3);

  const frame = Math.floor(dog.anim) % 2;
  drawSprite(ctx, DOG[frame], dog.x - 7, dog.y - 10, DOG_PAL, dog.facing < 0);

  // "!" bubble when it first spots you.
  if (dog.barkT > 0) {
    px(ctx, dog.x - 3, dog.y - 22, 7, 9, '#ffffff');
    px(ctx, dog.x - 1, dog.y - 20, 2, 4, '#c8362c');
    px(ctx, dog.x - 1, dog.y - 15, 2, 2, '#c8362c');
    px(ctx, dog.x - 1, dog.y - 13, 2, 2, '#ffffff');
  }
}

// ---------------------------------------------------------------------------
// Cars, seen from above. `dir` is -1 for driving up the screen, +1 for down,
// so the bonnet (and the headlights) go on whichever end is the front.
// ---------------------------------------------------------------------------
function drawCar(ctx, car) {
  const w = car.w, h = car.h;
  const x = Math.round(car.x - w / 2);
  const y = Math.round(car.y - h / 2);
  const c = car.palette;
  const frontY = car.dir < 0 ? y : y + h - 1;      // which end leads
  const backY  = car.dir < 0 ? y + h - 1 : y;

  // Shadow, offset a little so the car reads as sitting above the tarmac.
  px(ctx, x + 2, y + 3, w, h, 'rgba(20,26,20,0.22)');

  // Wheels poking out either side.
  px(ctx, x - 1, y + 5, 2, 7, '#24242c');
  px(ctx, x + w - 1, y + 5, 2, 7, '#24242c');
  px(ctx, x - 1, y + h - 12, 2, 7, '#24242c');
  px(ctx, x + w - 1, y + h - 12, 2, 7, '#24242c');

  // Body, chamfered at the corners so it isn't a plain rectangle.
  px(ctx, x + 1, y, w - 2, h, c.body);
  px(ctx, x, y + 2, w, h - 4, c.body);
  px(ctx, x + 1, y + 1, w - 2, 1, shade(c.body, 1.18));   // top highlight
  px(ctx, x + 1, y + h - 2, w - 2, 1, shade(c.body, 0.8));

  // Cabin and glass.
  const cabY = y + Math.round(h * 0.28);
  const cabH = Math.round(h * 0.42);
  px(ctx, x + 2, cabY, w - 4, cabH, c.roof);
  const glassFront = car.dir < 0 ? cabY - 4 : cabY + cabH;
  px(ctx, x + 3, glassFront, w - 6, 4, '#9fd0e8');
  px(ctx, x + 3, glassFront, w - 6, 1, '#cfeaf7');
  const glassBack = car.dir < 0 ? cabY + cabH : cabY - 3;
  px(ctx, x + 4, glassBack, w - 8, 3, '#7fb2cc');

  // A roof rack on the vans, to tell them apart at a glance.
  if (car.van) {
    px(ctx, x + 3, cabY + 2, w - 6, 1, shade(c.roof, 0.8));
    px(ctx, x + 3, cabY + 5, w - 6, 1, shade(c.roof, 0.8));
  }

  // Lights.
  px(ctx, x + 2, frontY - (car.dir < 0 ? 0 : 1), 3, 2, '#fff2b8');
  px(ctx, x + w - 5, frontY - (car.dir < 0 ? 0 : 1), 3, 2, '#fff2b8');
  px(ctx, x + 2, backY - (car.dir < 0 ? 1 : 0), 3, 2, '#d94a3a');
  px(ctx, x + w - 5, backY - (car.dir < 0 ? 1 : 0), 3, 2, '#d94a3a');
}

// ---------------------------------------------------------------------------
// Floating "+1" popups, dust puffs, etc.
// ---------------------------------------------------------------------------
function drawEffects(ctx, g) {
  for (const e of g.effects) {
    const life = e.t / e.life;                 // 1 -> 0 as it fades
    if (e.type === 'popup') {
      ctx.globalAlpha = Math.min(1, life * 2.2);
      drawTinyText(ctx, e.text, e.x, e.y - (1 - life) * 14, e.colour);
      ctx.globalAlpha = 1;
    } else if (e.type === 'dust') {
      ctx.globalAlpha = life;
      ctx.fillStyle = '#e6e0cd';
      const spread = (1 - life) * 7;
      ctx.fillRect(Math.round(e.x - 3 - spread), Math.round(e.y - 2), 2, 2);
      ctx.fillRect(Math.round(e.x + 2 + spread), Math.round(e.y - 2), 2, 2);
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------------------
// A 3x5 pixel font. Only the characters the game actually prints.
// ---------------------------------------------------------------------------
const FONT = {
  A:['010','101','111','101','101'], B:['110','101','110','101','110'],
  C:['011','100','100','100','011'], D:['110','101','101','101','110'],
  E:['111','100','110','100','111'], F:['111','100','110','100','100'],
  G:['011','100','101','101','011'], H:['101','101','111','101','101'],
  I:['111','010','010','010','111'], J:['001','001','001','101','010'],
  K:['101','101','110','101','101'], L:['100','100','100','100','111'],
  M:['101','111','111','101','101'], N:['101','111','111','111','101'],
  O:['010','101','101','101','010'], P:['110','101','110','100','100'],
  Q:['010','101','101','011','001'], R:['110','101','110','101','101'],
  S:['011','100','010','001','110'], T:['111','010','010','010','010'],
  U:['101','101','101','101','011'], V:['101','101','101','010','010'],
  W:['101','101','111','111','101'], X:['101','101','010','101','101'],
  Y:['101','101','010','010','010'], Z:['111','001','010','100','111'],
  0:['111','101','101','101','111'], 1:['010','110','010','010','111'],
  2:['110','001','010','100','111'], 3:['110','001','010','001','110'],
  4:['101','101','111','001','001'], 5:['111','100','110','001','110'],
  6:['011','100','110','101','010'], 7:['111','001','010','010','010'],
  8:['010','101','010','101','010'], 9:['010','101','011','001','110'],
  '+':['000','010','111','010','000'], '!':['010','010','010','000','010'],
  ' ':['000','000','000','000','000'], ':':['000','010','000','010','000'],
  '-':['000','000','111','000','000'],
};

function drawTinyText(ctx, text, x, y, colour) {
  ctx.fillStyle = colour;
  let cx = Math.round(x);
  const cy = Math.round(y) - 5;
  for (const raw of String(text).toUpperCase()) {
    const glyph = FONT[raw];
    if (glyph) {
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          if (glyph[gy][gx] === '1') ctx.fillRect(cx + gx, cy + gy, 1, 1);
        }
      }
    }
    cx += 4;
  }
}

// ---------------------------------------------------------------------------
// Slow-drifting cloud shadows over the whole scene. Drawn last, in screen
// space, so they pass over houses and postman alike.
// ---------------------------------------------------------------------------
function drawCloudShadows(ctx, g) {
  ctx.fillStyle = 'rgba(30, 48, 30, 0.07)';
  for (let i = 0; i < 3; i++) {
    // Each blob drifts at its own speed and wraps around the screen.
    const h = 90 + i * 34;
    const y = ((g.time * (4 + i * 2) - g.camera.y * 0.22) % (VIEW_H + h)) - h;
    const x = -30 + i * 74;
    ctx.fillRect(x, Math.round(y), 96, h);
  }
}

// Lighten (>1) or darken (<1) a #rrggbb colour.
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
