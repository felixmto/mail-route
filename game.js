// ---------------------------------------------------------------------------
// game.js — the loop that ties everything together: input, timer, collisions,
// delivering mail, and the menu / win / lose screens.
// ---------------------------------------------------------------------------

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');

// How many device pixels there are to one world unit. Set by fitToWindow(),
// and applied as a transform before every frame, so all the drawing code can
// work in world units and still come out sharp on any screen.
let unitScale = 1;

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
  keyELabel: document.getElementById('key-e-label'),
  keyC:    document.getElementById('key-c'),
  keyCLabel: null,   // filled in below, once we know the chip exists
  coffeeIcon: document.getElementById('coffee-icon'),
};
if (el.keyC) el.keyCLabel = el.keyC.querySelector('span');

// The cup icon is the same pixel art as everything else, painted into its own
// little 12x9 canvas and blown up by CSS. Repainted only when it changes state,
// since drawHud runs every frame.
const coffeeIconCtx = el.coffeeIcon ? el.coffeeIcon.getContext('2d') : null;
let coffeeIconPainted = null;

function paintCoffeeIcon(spent) {
  if (!coffeeIconCtx || coffeeIconPainted === spent) return;
  coffeeIconPainted = spent;

  // Match the screen's pixel density here too, or the cup looks soft next to
  // the crisp text beside it.
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = 26, cssH = 22;
  el.coffeeIcon.width = Math.round(cssW * dpr);
  el.coffeeIcon.height = Math.round(cssH * dpr);
  coffeeIconCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  coffeeIconCtx.clearRect(0, 0, cssW, cssH);
  drawCoffeeCup(coffeeIconCtx, 2, 0, 22, spent);
}

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
  treatDog: null,         // a dog close enough to hand a biscuit to
  coffee: { available: true, activeT: 0 },
  stats: { bites: 0, hitByCar: 0, hops: 0, treats: 0 },
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
      if (g.state === 'PLAYING') useE();
      break;
    case 'c': case 'C':
      if (g.state === 'PLAYING') drinkCoffee();
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
  g.treatDog = null;
  g.coffee = { available: true, activeT: 0 };
  g.stats = { bites: 0, hitByCar: 0, hops: 0, treats: 0 };
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
  g.treatDog = null;

  // A finished shift scores the mail you delivered, plus 10 points for every
  // second you had left on the clock.
  const delivered = g.world.totalMail - g.mailLeft;
  const bonus = won ? Math.floor(g.timeLeft) * 10 : 0;
  g.score += bonus;

  const shiftLength = g.world.minutes * 60;
  const taken = shiftLength - Math.max(0, g.timeLeft);

  el.title.textContent = won ? 'SHIFT COMPLETE' : 'SHIFT OVER';
  el.sub.textContent = won
    ? `All ${delivered} houses done in ${formatTime(taken)}.`
    : `The clock beat you with ${g.mailLeft} letter${g.mailLeft === 1 ? '' : 's'} still in the bag.`;

  const rows = [
    ['Houses reached', `${delivered} / ${g.world.totalMail}`],
    ['Time taken', formatTime(taken)],
  ];
  if (won) rows.push(['Time left', formatTime(g.timeLeft)]);
  rows.push(
    ['Dogs befriended', g.stats.treats],
    ['Dog bites', g.stats.bites],
    ['Hit by a car', g.stats.hitByCar],
  );
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

// Which dog (if any) is close enough to hand a biscuit to right now?
function findTreatableDog() {
  const p = g.player;
  for (const dog of g.world.dogs) {
    if (dog.happy) continue;
    if (Math.abs(dog.y - p.y) > TREAT_RANGE + 10) continue;   // cheap reject
    if (Math.hypot(dog.x - p.x, dog.y - p.y) <= TREAT_RANGE) return dog;
  }
  return null;
}

// E does whichever of the two jobs matters here. A dog bearing down on you is
// the more urgent of the two, so treating wins if both are possible.
function useE() {
  const p = g.player;
  if (isAirborne(p) || p.stunT > 0 || p.deliverCool > 0) return;
  if (g.treatDog) giveTreat(g.treatDog);
  else if (g.promptHouse) deliverTo(g.promptHouse);
}

function giveTreat(dog) {
  const p = g.player;
  dog.happy = true;
  dog.state = 'patrol';
  dog.barkT = 0;
  dog.heartT = 1.4;
  dog.thinkT = 0;
  p.deliverCool = 0.25;
  g.stats.treats++;
  g.score += 50;

  g.effects.push({
    type: 'biscuit', x: (p.x + dog.x) / 2, y: (p.y + dog.y) / 2 - 6,
    t: 0.5, life: 0.5,
  });
  g.effects.push({
    type: 'popup', text: '+50',
    x: p.x - 6, y: p.y - 22, t: 0.9, life: 0.9, colour: '#ffd2e0',
  });
}

function drinkCoffee() {
  if (!g.coffee.available) return;
  const p = g.player;
  if (p.stunT > 0) return;
  g.coffee.available = false;
  g.coffee.activeT = COFFEE_DURATION;
  g.effects.push({
    type: 'popup', text: 'COFFEE',
    x: p.x - 12, y: p.y - 24, t: 1.2, life: 1.2, colour: '#ffe08a',
  });
}

function deliverTo(h) {
  const p = g.player;

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

    if (dog.happy || dog.state !== 'chase' || dog.cooldown > 0) continue;
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

  // --- Coffee ---------------------------------------------------------------
  if (g.coffee.activeT > 0) {
    g.coffee.activeT = Math.max(0, g.coffee.activeT - dt);
    // A puff of steam off his shoulders while it's working.
    if (Math.random() < dt * 8) {
      g.effects.push({ type: 'dust', x: p.x, y: p.y - 4, t: 0.3, life: 0.3 });
    }
  }
  p.speedMul = g.coffee.activeT > 0 ? COFFEE_BOOST : 1;

  // --- What will E do right now? -------------------------------------------
  const busy = isAirborne(p) || p.stunT > 0;
  g.treatDog = busy ? null : findTreatableDog();
  g.promptHouse = busy ? null : findDeliverableHouse();

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

  // The E in the legend lights up when there's something to do right here, and
  // says which — a letter to post, or a biscuit to hand over.
  // Guarded because drawHud runs every frame: if the markup ever goes missing,
  // a thrown error here would kill the whole game loop rather than just the HUD.
  if (el.keyE) {
    el.keyE.classList.toggle('active', g.promptHouse !== null || g.treatDog !== null);
    el.keyE.classList.toggle('treat', g.treatDog !== null);
  }
  if (el.keyELabel) el.keyELabel.textContent = g.treatDog ? 'treat' : 'deliver';
  const brewing = g.coffee.activeT > 0;
  const spent = !g.coffee.available && !brewing;
  if (el.keyC) {
    el.keyC.classList.toggle('active', brewing);
    el.keyC.classList.toggle('spent', spent);
  }
  // While it's working the chip counts the seconds down instead of saying
  // "coffee", which is where the old timer under the cup went.
  if (el.keyCLabel) {
    el.keyCLabel.textContent = brewing ? Math.ceil(g.coffee.activeT) + 's' : 'coffee';
  }
  if (el.coffeeIcon) el.coffeeIcon.classList.toggle('spent', spent);
  paintCoffeeIcon(spent);

  const done = 1 - g.mailLeft / g.world.totalMail;
  el.fill.style.width = (done * 100).toFixed(1) + '%';
  el.you.style.left = ((g.player.y / g.world.routeLength) * 100).toFixed(1) + '%';
}

// ---------------------------------------------------------------------------
// Fitting the 200x150 canvas to the window at a whole-number scale, so every
// game pixel stays a perfect square block.
// ---------------------------------------------------------------------------
function fitToWindow() {
  // Fill as much of the window as we can while keeping the street's shape.
  // No longer rounded to a whole number: the art is smooth now, so a fractional
  // scale is fine and lets the game use the whole window.
  const scale = Math.max(1, Math.min(
    (window.innerWidth - 24) / VIEW_W,
    (window.innerHeight - 24) / VIEW_H,
  ));
  const cssW = Math.round(VIEW_W * scale);
  const cssH = Math.round(VIEW_H * scale);

  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  el.stage.style.width = cssW + 'px';
  el.stage.style.height = cssH + 'px';

  // Give the canvas as many real pixels as the display actually has, so the
  // curves are crisp on a retina screen rather than blown up from half size.
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  unitScale = (cssW / VIEW_W) * dpr;
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

  // One unit of drawing = one world unit, wherever we are on screen.
  ctx.setTransform(unitScale, 0, 0, unitScale, 0, 0);
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  if (g.world) {
    drawWorld(ctx, g);
  } else {
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
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

paintCoffeeIcon(false);
setState('MENU');
requestAnimationFrame(frame);

// Handy for poking at the game from the browser console, e.g.
//   __game.timeLeft = 10          // rush the end of a shift
//   __input.right = true          // hold a key down
window.__game = g;
window.__input = input;
