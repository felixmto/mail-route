// ---------------------------------------------------------------------------
// game.js — the loop that ties everything together: input, timer, collisions,
// delivering mail, and the menu / win / lose screens.
// ---------------------------------------------------------------------------

const canvas = document.getElementById('screen');
// Set the pixel buffer from the constants rather than trusting the width and
// height attributes in the HTML — that way the two can never drift apart.
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const el = {
  stage:   document.getElementById('stage'),
  hud:     document.getElementById('hud'),
  clock:   document.getElementById('clock'),
  mail:    document.getElementById('mail'),
  score:   document.getElementById('score'),
  fill:    document.getElementById('routefill'),
  you:     document.getElementById('routeyou'),
  menu:    document.getElementById('menu'),
  paused:  document.getElementById('paused'),
  over:    document.getElementById('over'),
  title:   document.getElementById('over-title'),
  sub:     document.getElementById('over-sub'),
  stats:   document.getElementById('over-stats'),
  keyE:    document.getElementById('key-e'),
};

// The whole game lives in this one object. It's also exposed as window.__game
// at the bottom of the file, which makes it easy to poke at from the console.
const g = {
  state: 'MENU',          // MENU | PLAYING | PAUSED | WON | LOST
  world: null,
  player: null,
  camera: { y: 0, shakeX: 0, shakeY: 0, shakeT: 0 },
  effects: [],
  time: 0,                // seconds since the shift started
  timeLeft: 0,
  mailLeft: 0,
  score: 0,
  promptHouse: null,      // the house you're currently standing at, if any
  stats: { bites: 0, hitByCar: 0, hops: 0 },
};

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const input = { left: false, right: false, up: false, down: false, jumpPressed: false };

const KEY_MAP = {
  ArrowLeft: 'left',  a: 'left',  A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'up',      w: 'up',    W: 'up',
  ArrowDown: 'down',  s: 'down',  S: 'down',
};

window.addEventListener('keydown', (e) => {
  // Stop the arrow keys and space from scrolling the page underneath us.
  if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();

  const dir = KEY_MAP[e.key];
  if (dir) { input[dir] = true; return; }

  if (e.repeat) return;

  switch (e.key) {
    case ' ':
      if (g.state === 'PLAYING') input.jumpPressed = true;
      break;
    case 'e': case 'E': case 'Enter':
      if (g.state === 'PLAYING') tryDeliver();
      break;
    case 'p': case 'P':
      if (g.state === 'PLAYING') setState('PAUSED');
      else if (g.state === 'PAUSED') setState('PLAYING');
      break;
    case 'r': case 'R':
      if (g.state !== 'MENU') setState('MENU');
      break;
  }
});

window.addEventListener('keyup', (e) => {
  const dir = KEY_MAP[e.key];
  if (dir) input[dir] = false;
});

// Releasing focus shouldn't leave the postman walking forever.
window.addEventListener('blur', () => {
  input.left = input.right = input.up = input.down = false;
});

// ---------------------------------------------------------------------------
// Starting and ending a shift
// ---------------------------------------------------------------------------
function startShift(minutes) {
  g.world = generateRoute(minutes);
  g.player = makePostman(ROAD_MID, 40);
  g.camera.y = 0;
  g.camera.shakeT = 0;
  g.effects.length = 0;
  g.time = 0;
  g.timeLeft = minutes * 60;
  g.mailLeft = g.world.totalMail;
  g.score = 0;
  g.promptHouse = null;
  g.stats = { bites: 0, hitByCar: 0, hops: 0 };
  setState('PLAYING');
}

function setState(next) {
  g.state = next;
  el.menu.classList.toggle('hidden', next !== 'MENU');
  el.paused.classList.toggle('hidden', next !== 'PAUSED');
  el.over.classList.toggle('hidden', next !== 'WON' && next !== 'LOST');
  el.hud.classList.toggle('hidden', next === 'MENU' || next === 'WON' || next === 'LOST');
}

function endShift(won) {
  g.promptHouse = null;   // so the legend's E goes dark on the end screen

  // A finished shift scores the mail you delivered, plus 10 points for every
  // second you had left on the clock.
  const delivered = g.world.totalMail - g.mailLeft;
  const bonus = won ? Math.floor(g.timeLeft) * 10 : 0;
  g.score += bonus;

  el.title.textContent = won ? 'SHIFT COMPLETE' : 'SHIFT OVER';
  el.sub.textContent = won
    ? 'Bag empty with time to spare. Nice round.'
    : `The clock beat you with ${g.mailLeft} letter${g.mailLeft === 1 ? '' : 's'} still in the bag.`;

  const rows = [
    ['Delivered', `${delivered} / ${g.world.totalMail}`],
    ['Time left', won ? formatTime(g.timeLeft) : '0:00'],
    ['Dog bites', g.stats.bites],
    ['Hit by a car', g.stats.hitByCar],
  ];
  if (won) rows.push(['Time bonus', `+${bonus}`]);
  rows.push(['Score', g.score]);

  el.stats.innerHTML = rows
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join('');

  setState(won ? 'WON' : 'LOST');
}

// ---------------------------------------------------------------------------
// Delivering
// ---------------------------------------------------------------------------

// Which undelivered house (if any) is the postman standing at right now?
function findDeliverableHouse() {
  const p = g.player;
  for (const h of g.world.houses) {
    if (h.delivered) continue;
    if (Math.abs(h.cy - p.y) > 44) continue;             // cheap early reject
    if (Math.hypot(h.zone.x - p.x, h.zone.y - p.y) <= h.zone.r) return h;
  }
  return null;
}

function tryDeliver() {
  const p = g.player;
  // No posting mail mid-air, mid-stumble, or twice in one press.
  if (isAirborne(p) || p.stunT > 0 || p.deliverCool > 0) return;

  const h = g.promptHouse;
  if (!h) return;

  h.delivered = true;
  p.deliverCool = 0.25;
  g.mailLeft--;

  const points = h.type === 'porch' ? 150 : 100;
  g.score += points;

  g.effects.push({
    type: 'popup', text: '+' + points,
    x: p.x - 8, y: p.y - 16, t: 0.9, life: 0.9,
    colour: h.type === 'porch' ? '#ffe08a' : '#b6f2a1',
  });


  if (g.mailLeft <= 0) endShift(true);
}

// ---------------------------------------------------------------------------
// One physics step (always 1/60th of a second — see the loop at the bottom).
// ---------------------------------------------------------------------------
function update(dt) {
  g.time += dt;
  g.timeLeft -= dt;

  const p = g.player;
  const w = g.world;

  const event = updatePostman(p, input, w, dt);
  if (event === 'hopped') {
    g.stats.hops++;
  }
  if (event === 'landed') {
    g.effects.push({ type: 'dust', x: p.x, y: p.y, t: 0.22, life: 0.22 });
  }

  // --- Traffic ------------------------------------------------------------
  // You cannot hop over a car, so crossing the road is purely about timing.
  for (const car of w.cars) {
    updateCar(car, w.routeLength, dt);
    if (Math.abs(car.y - p.y) > 80) continue;

    if (p.invulnT > 0 || !carHits(car, p)) continue;

    p.stunT = CAR_TIME;
    p.invulnT = CAR_TIME + GRACE_CAR;
    g.timeLeft -= CAR_PENALTY;
    g.stats.hitByCar++;
    car.honkT = 0.6;
    // Shoved towards the nearer kerb, never under the car.
    p.x = clamp(p.x + (p.x < ROAD_MID ? -1 : 1) * 14, 8, VIEW_W - 8);
    shake(5);
    g.effects.push({
      type: 'popup', text: '-' + CAR_PENALTY,
      x: p.x - 6, y: p.y - 24, t: 1.1, life: 1.1, colour: '#ff8f7a',
    });
  }

  // --- Dogs ---------------------------------------------------------------
  for (const dog of w.dogs) {
    updateDog(dog, p, dt);

    if (dog.state !== 'chase' || dog.cooldown > 0) continue;
    if (Math.hypot(dog.x - p.x, dog.y - p.y) > 7) continue;
    if (isAirborne(p) || p.invulnT > 0) continue;

    // Caught. The real cost is the 8 seconds, not the stumble.
    p.stunT = BITE_TIME;
    p.invulnT = BITE_TIME + GRACE_BITE;
    g.timeLeft -= BITE_PENALTY;
    g.stats.bites++;
    // A long stand-down, so getting past a dog costs you one bite rather than
    // three: you need time to deliver and get clear before it comes back.
    dog.cooldown = 5;
    dog.state = 'return';
    separate(p, dog, 20);
    shake(4);
    g.effects.push({
      type: 'popup', text: '-8',
      x: p.x - 6, y: p.y - 18, t: 1.1, life: 1.1, colour: '#ff8f7a',
    });
  }

  // --- Delivery prompt ----------------------------------------------------
  g.promptHouse = (isAirborne(p) || p.stunT > 0) ? null : findDeliverableHouse();

  // --- Mailbox flags easing down after a delivery --------------------------
  for (const h of w.houses) {
    if (h.delivered && h.flagT < 1) h.flagT = Math.min(1, h.flagT + dt * 4);
  }

  // --- Effects ------------------------------------------------------------
  for (let i = g.effects.length - 1; i >= 0; i--) {
    g.effects[i].t -= dt;
    if (g.effects[i].t <= 0) g.effects.splice(i, 1);
  }

  // Last line of defence: never leave the postman trapped inside scenery.
  unstick(p, w.solids);

  updateCamera(dt);

  if (g.timeLeft <= 0) {
    g.timeLeft = 0;
    endShift(false);
  }
}

// Push the postman clear of whatever he just walked into.
//
// This has to move him to at least `minDist` away, not just shove him a fixed
// number of pixels: a small shove can leave him still inside the thing's hit
// radius, and then he gets knocked over again the moment he stands up.
function separate(p, other, minDist) {
  let dx = p.x - other.x;
  let dy = p.y - other.y;
  let len = Math.hypot(dx, dy);
  if (len < 0.001) { dx = 0; dy = -1; len = 1; }   // exactly on top of it
  const push = minDist - len;
  if (push <= 0) return;

  const ux = dx / len, uy = dy / len;
  // Straight back is the natural direction, but if that would shove him
  // through a wall, slide along one axis instead — and if every option is
  // blocked, leave him where he is rather than push him inside a building.
  const options = [[ux, uy], [ux, 0], [0, uy], [-ux, -uy]];
  for (const [ox, oy] of options) {
    const nx = clamp(p.x + ox * push, 8, VIEW_W - 8);
    const ny = clamp(p.y + oy * push, 10, g.world.routeLength - 10);
    if (!hitsSolid(nx, ny, g.world.solids)) { p.x = nx; p.y = ny; return; }
  }
}

function shake(amount) {
  g.camera.shakeT = Math.max(g.camera.shakeT, amount * 0.06);
  g.camera.amount = amount;
}

function updateCamera(dt) {
  const cam = g.camera;

  // Keep the postman in the middle of the screen, easing rather than snapping.
  // The street runs up and down, so this is the only axis the camera moves on.
  const want = clamp(g.player.y - VIEW_H / 2, 0, g.world.routeLength - VIEW_H);
  cam.y += (want - cam.y) * Math.min(1, dt * 9);

  if (cam.shakeT > 0) {
    cam.shakeT -= dt;
    const a = (cam.amount || 2) * (cam.shakeT / 0.24);
    cam.shakeX = (Math.random() - 0.5) * a * 2;
    cam.shakeY = (Math.random() - 0.5) * a * 2;
  } else {
    cam.shakeX = cam.shakeY = 0;
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function drawHud() {
  el.clock.textContent = formatTime(g.timeLeft);
  el.clock.classList.toggle('urgent', g.timeLeft <= 30);
  el.mail.textContent = `MAIL ${g.mailLeft}/${g.world.totalMail}`;
  el.score.textContent = g.score;

  // The E in the legend lights up when there's a letter to post right here.
  // Guarded because drawHud runs every frame: if the markup ever goes missing,
  // a thrown error here would kill the whole game loop rather than just the HUD.
  if (el.keyE) el.keyE.classList.toggle('active', g.promptHouse !== null);

  const done = 1 - g.mailLeft / g.world.totalMail;
  el.fill.style.width = (done * 100).toFixed(1) + '%';
  el.you.style.left = ((g.player.y / g.world.routeLength) * 100).toFixed(1) + '%';
}

// ---------------------------------------------------------------------------
// Fitting the 200x150 canvas to the window at a whole-number scale, so every
// game pixel stays a perfect square block.
// ---------------------------------------------------------------------------
function fitToWindow() {
  const scale = Math.max(1, Math.floor(Math.min(
    (window.innerWidth - 24) / VIEW_W,
    (window.innerHeight - 24) / VIEW_H,
  )));
  canvas.style.width = VIEW_W * scale + 'px';
  canvas.style.height = VIEW_H * scale + 'px';
  el.stage.style.width = VIEW_W * scale + 'px';
  el.stage.style.height = VIEW_H * scale + 'px';
}
window.addEventListener('resize', fitToWindow);
fitToWindow();

// ---------------------------------------------------------------------------
// The main loop.
//
// Physics runs at a fixed 60 steps a second no matter how fast the monitor
// refreshes, so the game plays identically on a 60Hz laptop and a 144Hz screen.
// ---------------------------------------------------------------------------
const STEP = 1 / 60;
let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.25) dt = 0.25;      // after a tab switch, don't fast-forward

  if (g.state === 'PLAYING') {
    accumulator += dt;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
      if (g.state !== 'PLAYING') break;   // the shift may have just ended
    }
    drawHud();
  } else {
    accumulator = 0;
  }

  if (g.world) {
    drawWorld(ctx, g);
  } else {
    // Menu backdrop before any route exists.
    px(ctx, 0, 0, VIEW_W, VIEW_H, COL.grass);
  }

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
for (const btn of document.querySelectorAll('.shift[data-minutes]')) {
  btn.addEventListener('click', () => startShift(Number(btn.dataset.minutes)));
}
document.getElementById('again').addEventListener('click', () => setState('MENU'));

// Show a real route behind the menu instead of a blank green field.
g.world = generateRoute(5);
g.player = makePostman(ROAD_MID, 60);
g.camera.y = 40;
g.mailLeft = g.world.totalMail;

setState('MENU');
requestAnimationFrame(frame);

// Handy for poking at the game from the browser console, e.g.
//   __game.timeLeft = 10          // rush the end of a shift
//   __input.right = true          // hold a key down
window.__game = g;
window.__input = input;
