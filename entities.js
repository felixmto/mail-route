// ---------------------------------------------------------------------------
// entities.js — everything that moves: the postman, the dogs, the traffic.
// ---------------------------------------------------------------------------

const WALK_SPEED   = 48;    // pixels per second
const HOP_SPEED    = 66;    // a hop is a burst — it covers ground faster
const DOG_SPEED    = 40;    // SLOWER than a walk: you can always leg it
const DOG_PATROL   = 17;
const DOG_AGGRO    = 34;    // how close you can get before it notices you

const HOP_TIME     = 0.42;  // seconds in the air
const HOP_HEIGHT   = 13;    // how far up the screen the sprite lifts
const HOP_COOLDOWN = 0.18;

const BITE_TIME    = 1.3;   // how long a dog leaves you sprawling
const BITE_PENALTY = 8;     // ...plus this many seconds off the clock

const CAR_TIME     = 1.7;   // a car hurts more, and costs you more
const CAR_PENALTY  = 6;

// After any hit you get a short grace period where nothing can touch you.
// Without this you get clipped by the same car twice, or pinned by a dog.
const GRACE_BITE = 1.2;
const GRACE_CAR  = 1.4;

// How close a charging dog has to be before you can hand it a treat. It's
// deliberately about the same as its biting range, so treating one is a nerve
// test: hold your ground until it reaches you, or turn and run.
const TREAT_RANGE = 24;

// The coffee: one cup a shift, and it makes you noticeably quicker for a while.
const COFFEE_DURATION = 60;   // seconds
const COFFEE_BOOST    = 1.5;  // multiplier on your walking and hopping speed

const PLAYER_W = 8;         // collision box at the feet — narrower than the
const PLAYER_H = 6;         // sprite, which reads better from above

// ---------------------------------------------------------------------------
// The postman
// ---------------------------------------------------------------------------
function makePostman(x, y) {
  return {
    x, y,                  // (x, y) is the point between his feet
    facing: 'down',
    anim: 0,
    walking: false,
    hopT: 0,               // counts 0 -> HOP_TIME while airborne
    hopCool: 0,
    stunT: 0,
    invulnT: 0,
    speedMul: 1,           // raised while the coffee is working
    deliverCool: 0,
  };
}

// How high off the ground he is right now. A simple arc: 0 at both ends of the
// hop, HOP_HEIGHT in the middle. (4*t*(1-t) peaks at exactly 1 when t = 0.5.)
function hopHeight(p) {
  if (p.hopT <= 0) return 0;
  const t = p.hopT / HOP_TIME;
  return HOP_HEIGHT * 4 * t * (1 - t);
}

function isAirborne(p) {
  return p.hopT > 0;
}

function updatePostman(p, input, world, dt) {
  // Timers first.
  if (p.stunT > 0) p.stunT -= dt;
  if (p.invulnT > 0) p.invulnT -= dt;
  if (p.hopCool > 0) p.hopCool -= dt;
  if (p.deliverCool > 0) p.deliverCool -= dt;

  if (p.hopT > 0) {
    p.hopT += dt;
    if (p.hopT >= HOP_TIME) {   // landed
      p.hopT = 0;
      p.hopCool = HOP_COOLDOWN;
      return 'landed';
    }
  }

  // Being stunned means no input at all — that is what makes it cost you.
  if (p.stunT > 0) { p.walking = false; return null; }

  let dx = 0, dy = 0;
  if (input.left)  dx -= 1;
  if (input.right) dx += 1;
  if (input.up)    dy -= 1;
  if (input.down)  dy += 1;

  // Start a hop.
  if (input.jumpPressed && p.hopT === 0 && p.hopCool <= 0) {
    p.hopT = 0.0001;          // any value above zero counts as airborne
    input.jumpPressed = false;
    return 'hopped';
  }

  p.walking = (dx !== 0 || dy !== 0);

  if (p.walking) {
    // Normalise so walking diagonally isn't faster than walking straight.
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;

    const speed = (isAirborne(p) ? HOP_SPEED : WALK_SPEED) * p.speedMul;

    // Face whichever axis you're pushing hardest.
    if (Math.abs(dx) > Math.abs(dy)) p.facing = dx > 0 ? 'right' : 'left';
    else p.facing = dy > 0 ? 'down' : 'up';

    // Move one axis at a time so sliding along a wall feels smooth instead of
    // sticking. If a move would put us inside something solid, undo just that
    // axis and keep the other one.
    const stepX = dx * speed * dt;
    const stepY = dy * speed * dt;

    p.x += stepX;
    if (hitsSolid(p.x, p.y, world.solids)) p.x -= stepX;

    p.y += stepY;
    if (hitsSolid(p.x, p.y, world.solids)) p.y -= stepY;

    p.anim += dt * (speed / 15);
  } else {
    p.anim = 0;
  }

  // Never walk off the sides of the street or past either end of the round.
  p.x = clamp(p.x, 8, VIEW_W - 8);
  p.y = clamp(p.y, 10, world.routeLength - 10);

  return null;
}

// If the postman has somehow ended up *inside* something solid — a dog or a
// car can knock him hard enough to land him in a front room — every direction
// he tries to walk is blocked and he's stuck for good. This spirals outwards
// to find the nearest bit of open ground and puts him there.
function unstick(p, solids) {
  if (!hitsSolid(p.x, p.y, solids)) return false;
  for (let radius = 2; radius <= 60; radius += 2) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const nx = p.x + Math.cos(angle) * radius;
      const ny = p.y + Math.sin(angle) * radius;
      if (!hitsSolid(nx, ny, solids)) {
        p.x = clamp(nx, 8, VIEW_W - 8);
        p.y = ny;
        return true;
      }
    }
  }
  return false;
}

// Does the postman's little foot-box overlap any solid rectangle?
function hitsSolid(x, y, solids) {
  const l = x - PLAYER_W / 2, r = x + PLAYER_W / 2;
  const t = y - PLAYER_H,     b = y;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (r > s.x && l < s.x + s.w && b > s.y && t < s.y + s.h) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Dogs
// ---------------------------------------------------------------------------
function updateDog(dog, p, dt) {
  dog.anim += dt * 5;
  if (dog.barkT > 0) dog.barkT -= dt;
  if (dog.heartT > 0) dog.heartT -= dt;
  if (dog.cooldown > 0) dog.cooldown -= dt;

  // A dog that's had a treat is friends for the rest of the shift. It pootles
  // around its garden and never chases you again.
  if (dog.happy) {
    dog.thinkT -= dt;
    if (dog.thinkT <= 0) {
      const a = Math.random() * Math.PI * 2;
      dog.targetX = clamp(dog.homeX + Math.cos(a) * dog.r * 0.4,
                          BAND.leftYard[0] + 2, BAND.rightYard[1] - 2);
      dog.targetY = dog.homeY + Math.sin(a) * dog.r * 0.4;
      dog.thinkT = 2 + Math.random() * 2.5;
    }
    stepDogToward(dog, dog.targetX, dog.targetY, DOG_PATROL * 0.7, dt);
    return;
  }

  const toPlayer = Math.hypot(p.x - dog.x, p.y - dog.y);
  const fromHome = Math.hypot(p.x - dog.homeX, p.y - dog.homeY);

  // --- Decide what the dog is doing --------------------------------------
  if (dog.state === 'chase') {
    // Give up once the postman is clear of the territory (with a little slack
    // so the dog doesn't flip states while you hover on the boundary).
    if (fromHome > dog.r + 20) dog.state = 'return';
  } else if (fromHome < dog.r && toPlayer < DOG_AGGRO && dog.cooldown <= 0) {
    dog.state = 'chase';
    dog.barkT = 0.7;
  }

  if (dog.state === 'return' &&
      Math.hypot(dog.x - dog.homeX, dog.y - dog.homeY) < 6) {
    dog.state = 'patrol';
    dog.thinkT = 0;
  }

  // --- Pick a destination -------------------------------------------------
  let tx, ty, speed;
  if (dog.state === 'chase') {
    tx = p.x; ty = p.y; speed = DOG_SPEED;
  } else if (dog.state === 'return') {
    tx = dog.homeX; ty = dog.homeY; speed = DOG_PATROL * 1.8;
  } else {
    // Patrol: wander to a new random spot inside the territory now and then.
    dog.thinkT -= dt;
    if (dog.thinkT <= 0) {
      const a = Math.random() * Math.PI * 2;
      const rad = Math.random() * dog.r * 0.55;
      // Keep it out of the road — it lives in the garden, not the traffic.
      dog.targetX = clamp(dog.homeX + Math.cos(a) * rad,
                          BAND.leftYard[0] + 2, BAND.rightYard[1] - 2);
      dog.targetY = dog.homeY + Math.sin(a) * rad;
      dog.thinkT = 1.3 + Math.random() * 1.9;
    }
    tx = dog.targetX; ty = dog.targetY; speed = DOG_PATROL;
  }

  stepDogToward(dog, tx, ty, speed, dt);
}

// Walk a dog towards a point at a given speed.
function stepDogToward(dog, tx, ty, speed, dt) {
  const dx = tx - dog.x, dy = ty - dog.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 1) {
    dog.x += (dx / dist) * speed * dt;
    dog.y += (dy / dist) * speed * dt;
    if (Math.abs(dx) > 1) dog.facing = dx > 0 ? 1 : -1;
  }
}

// ---------------------------------------------------------------------------
// Traffic. Cars drive their lane at a steady speed and loop back around to the
// far end of the route when they run off it, which keeps the road busy all the
// way along without having to spawn and destroy anything.
// ---------------------------------------------------------------------------
function updateCar(car, routeLength, dt) {
  if (car.honkT > 0) car.honkT -= dt;
  car.y += car.dir * car.speed * dt;
  if (car.dir > 0 && car.y > routeLength + 140) car.y = -140;
  if (car.dir < 0 && car.y < -140) car.y = routeLength + 140;
}

// Is the postman's foot-box inside this car?
function carHits(car, p) {
  const l = p.x - PLAYER_W / 2, r = p.x + PLAYER_W / 2;
  const t = p.y - PLAYER_H,     b = p.y;
  const cl = car.x - car.w / 2, cr = car.x + car.w / 2;
  const ct = car.y - car.h / 2, cb = car.y + car.h / 2;
  return r > cl && l < cr && b > ct && t < cb;
}

// ---------------------------------------------------------------------------
// Neighbours. They amble between spots near where they started and stop for a
// breather now and then. Nothing about them affects the round — no collision,
// no scoring — so they can never make a shift harder or easier.
// ---------------------------------------------------------------------------
function updateNeighbour(n, dt) {
  n.thinkT -= dt;

  if (n.thinkT <= 0) {
    if (n.walking) {
      // Just arrived somewhere: stand about for a moment.
      n.walking = false;
      n.thinkT = 1 + Math.random() * 3.5;
    } else {
      // Pick somewhere new within their patch.
      n.walking = true;
      n.thinkT = 2 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * n.roam;
      n.targetX = n.homeX + Math.cos(a) * r * 0.35;   // mostly up and down
      n.targetY = n.homeY + Math.sin(a) * r;
    }
  }

  if (!n.walking) { n.anim = 0; return; }

  const dx = n.targetX - n.x, dy = n.targetY - n.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) { n.walking = false; n.anim = 0; return; }

  n.x += (dx / dist) * n.speed * dt;
  n.y += (dy / dist) * n.speed * dt;
  n.anim += dt * (n.speed / 3.4);

  // Face whichever way they're mostly heading.
  if (Math.abs(dx) > Math.abs(dy)) n.facing = dx > 0 ? 'right' : 'left';
  else n.facing = dy > 0 ? 'down' : 'up';
}

// ---------------------------------------------------------------------------
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
