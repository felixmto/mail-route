// ---------------------------------------------------------------------------
// world.js — the shape of the street, and the code that builds a route.
//
// The street runs VERTICALLY. You walk up and down it; the houses are off to
// your left and right. So:
//     world x = across the street (left houses .. road .. right houses)
//     world y = how far along the round you are (this is what scrolls)
// The whole width of the street fits on screen, so the camera only ever moves
// up and down.
// ---------------------------------------------------------------------------

const VIEW_W = 200;
const VIEW_H = 150;

// A cross-section of the street, left to right.
const BAND = {
  leftHouse:  [4, 46],
  leftYard:   [46, 58],
  leftWalk:   [58, 70],     // pavement — curbside mailboxes live here
  road:       [70, 130],
  rightWalk:  [130, 142],
  rightYard:  [142, 154],
  rightHouse: [154, 196],
};

const ROAD_MID  = 100;   // the centre line
// The lanes are placed so that a car never reaches the centre line: the widest
// vehicle is 20px, so a lane centred at 83 reaches 94 at most, leaving a clear
// strip either side of x=100. That strip is a genuine refuge — you can cross
// one lane, stand on the markings, and wait for the second. The double yellow
// line is what shows the player where it is.
const LANE_UP   = 83;    // cars in this lane drive up the screen
const LANE_DOWN = 117;   // ...and down the screen in this one

// ---------------------------------------------------------------------------
// TUNING — this is the table to edit if the game feels too easy or too hard.
//
//   houses  how much mail is in the bag (one letter per house)
//   porch   fraction of houses that need a walk to the front door
//   dogs    how many dog territories are scattered along the route
//
// Rough maths: on an empty road the round takes about 2.8 seconds per house.
// Traffic roughly doubles that once you add waiting at the kerb, so reckon on
// about 5 seconds a house in practice — 38 houses is a bit over 3 minutes of a
// 5-minute shift, leaving the rest as your margin for dogs and near misses.
// If you raise these counts, re-check that a shift is still finishable.
// ---------------------------------------------------------------------------
const SHIFTS = {
  5:  { houses: 38,  porch: 0.25, dogs: 2 },
  10: { houses: 78,  porch: 0.35, dogs: 5 },
  15: { houses: 115, porch: 0.45, dogs: 8 },
};

const HOUSE_PITCH = 100;   // gap between two houses on the SAME side
const PITCH_JITTER = 18;   // ...give or take, so the street isn't a grid
const START_PAD = 80;      // empty tarmac before the first house
const END_PAD = 110;

const FACADE = 12;         // how wide the street-facing wall of a house reads

// ---------------------------------------------------------------------------
// generateRoute(minutes) — builds an entire shift and hands back everything
// the rest of the game needs: houses, cars, dogs, route length.
// ---------------------------------------------------------------------------
function generateRoute(minutes) {
  const cfg = SHIFTS[minutes];
  const rng = makeRng(Date.now());

  const houses = [];
  const solids = [];   // rectangles the postman cannot walk through
  const dogs = [];

  // --- Houses, alternating sides up the street ----------------------------
  let leftY = START_PAD;
  let rightY = START_PAD + HOUSE_PITCH / 2;   // offset so the sides interleave

  for (let i = 0; i < cfg.houses; i++) {
    const side = i % 2 === 0 ? 'left' : 'right';
    const depth = 48 + Math.floor(rng() * 14);      // 48..61 px along the street
    const y = side === 'left' ? leftY : rightY;
    const isPorch = rng() < cfg.porch;

    houses.push(makeHouse(y, depth, side, isPorch, rng, solids));

    const step = HOUSE_PITCH + Math.floor((rng() - 0.5) * PITCH_JITTER * 2);
    if (side === 'left') leftY += step; else rightY += step;
  }

  const routeLength = Math.max(leftY, rightY) + END_PAD;

  // --- Dogs: one per territory, guarding a porch house --------------------
  const porchHouses = houses.filter(h => h.type === 'porch');
  shuffle(porchHouses, rng);
  for (let i = 0; i < cfg.dogs && i < porchHouses.length; i++) {
    dogs.push(makeDog(porchHouses[i], rng));
  }

  // --- Traffic ------------------------------------------------------------
  const cars = generateTraffic(rng, routeLength);

  // --- Scenery: trees on the verges, neighbours out and about -------------
  // Neither of these is solid. They're there to make the street feel lived in,
  // and keeping them walk-through means they can't wall off a delivery or
  // change how long a round takes.
  const trees = generateTrees(rng, houses, solids, routeLength);
  const neighbours = generateNeighbours(rng, houses, routeLength);

  return {
    minutes,
    houses,
    solids,
    dogs,
    cars,
    trees,
    neighbours,
    routeLength,
    totalMail: houses.length,
  };
}

// ---------------------------------------------------------------------------
// One house. `solids` is appended to with anything the player can bump into.
//
// A house is drawn as a roof seen from above with its front wall folded out
// towards the road, so `x0..x1` is the whole footprint and the FACADE-wide
// strip nearest the road is the bit with the door and windows on it.
// ---------------------------------------------------------------------------
function makeHouse(y, depth, side, isPorch, rng, solids) {
  const left = side === 'left';
  const cy = y + depth / 2;

  // Porch houses are set further back from the road, which is what leaves
  // room for a fenced front garden you have to walk into.
  const setback = isPorch ? 8 : 0;
  const x0 = left ? BAND.leftHouse[0] : BAND.rightHouse[0] + setback;
  const x1 = left ? BAND.leftHouse[1] - setback : BAND.rightHouse[1];

  const h = {
    side, x0, x1, y0: y, y1: y + depth, cy, depth,
    palette: pickHousePalette(rng),
    type: isPorch ? 'porch' : 'mailbox',
    delivered: false,
    flagT: 0,                       // 0 = flag up (mail waiting), 1 = down
    frontX: left ? x1 : x0,         // the edge of the house facing the road
  };

  solids.push({ x: x0, y: h.y0, w: x1 - x0, h: depth });

  if (isPorch) {
    // Front door, reachable only through the garden gate.
    h.zone = { x: left ? x1 + 6 : x0 - 6, y: cy, r: 9 };

    // Picket fence along the street edge of the garden, with a gate in it.
    const fenceX = left ? BAND.leftWalk[0] - 2 : BAND.rightWalk[1];
    // The fence spans just the width of the house's own frontage, with a wide
    // gate in the middle of it. Keeping it short and the gate generous matters:
    // a long fence with a narrow gap turns the front garden into a pen you have
    // to feel your way out of, which is annoying rather than interesting.
    // Fence length vs gate width is a real trade-off. Too long a fence with too
    // narrow a gate and the front garden becomes a pen you have to feel your
    // way out of; too short and it doesn't read as a fence at all. This leaves
    // a ~24px gate with a visible run of pickets either side of it, and always
    // at least 11px of clear grass between one garden's fence and the next.
    h.fence = {
      x: fenceX,
      y0: h.y0 - 5, y1: h.y1 + 5,
      gate0: cy - 12, gate1: cy + 12,
    };
    solids.push({ x: fenceX, y: h.fence.y0, w: 2, h: (cy - 12) - h.fence.y0 });
    solids.push({ x: fenceX, y: cy + 12, w: 2, h: h.fence.y1 - (cy + 12) });
  } else {
    // Mailbox planted on the pavement at the curb.
    h.mailbox = { x: left ? BAND.leftWalk[0] + 2 : BAND.rightWalk[1] - 11, y: cy - 7 };
    h.zone = { x: left ? BAND.leftWalk[1] - 1 : BAND.rightWalk[0] + 1, y: cy, r: 11 };
  }

  return h;
}

function pickHousePalette(rng) {
  const sets = [
    { roof: '#7fc9a8', wall: '#f7f2e4', door: '#8a5a34' },  // mint
    { roof: '#f2a97e', wall: '#fdf3e3', door: '#6f4a2c' },  // peach
    { roof: '#8fb9e8', wall: '#f4f5ef', door: '#7a4f2e' },  // sky
    { roof: '#f0d078', wall: '#fbf6e6', door: '#6b4527' },  // butter
    { roof: '#d79bc4', wall: '#f9f1ef', door: '#7d5236' },  // blossom
    { roof: '#a8b6e0', wall: '#f2f3f0', door: '#6d4830' },  // lilac
  ];
  return sets[Math.floor(rng() * sets.length)];
}

// ---------------------------------------------------------------------------
// A dog guards a circular patch around "its" front garden. It chases you while
// you're inside that patch and trots home the moment you leave it. It is a
// little SLOWER than you walk, so you can always get away by heading off —
// the danger is dawdling at the door while it closes in.
// ---------------------------------------------------------------------------
function makeDog(house, rng) {
  const homeX = house.side === 'left' ? BAND.leftWalk[0] + 4 : BAND.rightWalk[1] - 4;
  return {
    house,
    homeX,
    homeY: house.cy,
    x: homeX,
    y: house.cy,
    r: 48,                       // territory radius
    state: 'patrol',
    targetX: homeX,
    targetY: house.cy,
    thinkT: 0,
    barkT: 0,
    cooldown: 0,                 // stops a dog re-catching you instantly
    anim: rng() * 2,
    facing: 1,
  };
}

// ---------------------------------------------------------------------------
// Traffic. Two lanes running in opposite directions, so crossing the road is
// the thing that actually costs you time. Cars are laid out along the whole
// route with random gaps and just loop around when they reach the end.
// ---------------------------------------------------------------------------
const CAR_COLOURS = [
  { body: '#d2493f', roof: '#a83a32' },
  { body: '#3f7fd2', roof: '#3163a8' },
  { body: '#e8e2d2', roof: '#c3bdad' },
  { body: '#4fae74', roof: '#3d8b5c' },
  { body: '#3a3f4a', roof: '#2b2f38' },
  { body: '#e0b44f', roof: '#b8913e' },
  { body: '#8a63b8', roof: '#6f4f96' },
];

function generateTraffic(rng, routeLength) {
  const cars = [];
  for (const dir of [-1, 1]) {
    // Start well off the end of the route so nothing pops into view at the
    // moment the shift begins.
    let y = -140;
    while (y < routeLength + 140) {
      cars.push(makeCar(rng, y, dir));
      // Gaps have to be big enough that you're not just standing at the kerb.
      // Note there's a safe refuge on the centre line between the two lanes,
      // so you only ever need one lane clear at a time if you cross in stages.
      y += 300 + rng() * 260;
    }
  }
  return cars;
}

function makeCar(rng, y, dir) {
  const van = rng() < 0.22;
  return {
    dir,                                     // -1 drives up screen, +1 down
    x: (dir < 0 ? LANE_UP : LANE_DOWN) + (rng() - 0.5) * 2,
    y,
    w: van ? 20 : 18,
    h: van ? 44 : 34,
    speed: 42 + rng() * 30,
    van,
    palette: CAR_COLOURS[Math.floor(rng() * CAR_COLOURS.length)],
    honkT: 0,
  };
}


// ---------------------------------------------------------------------------
// Trees. They go on the grass either side of the street — in the gaps between
// houses and around the front gardens — never on the pavement, the road, or
// across the path you walk to a front door.
//
// You walk underneath the canopy rather than around it: they're sorted into the
// scene by the foot of the trunk, so you pass behind a tree when you're above
// it and in front when you're below.
// ---------------------------------------------------------------------------
const TREE_TINTS = [
  { light: '#7cc46a', mid: '#5da356', dark: '#47823f' },
  { light: '#8fcf72', mid: '#6cae5c', dark: '#528c45' },
  { light: '#6fbf7d', mid: '#519c62', dark: '#3d7c4c' },
  { light: '#a3d177', mid: '#82b45e', dark: '#658f48' },
];

function generateTrees(rng, houses, solids, routeLength) {
  const trees = [];
  const target = Math.floor(routeLength / 34);
  let attempts = 0;

  while (trees.length < target && attempts < target * 40) {
    attempts++;
    const left = rng() < 0.5;
    // Grass only: never the pavement, never the road.
    const x = left ? 7 + rng() * 47 : 146 + rng() * 47;
    const y = 30 + rng() * (routeLength - 60);
    const size = 6.5 + rng() * 4;

    // Don't plant one inside a house or a fence.
    if (!clearOfSolids(x, y, size * 0.55, solids)) continue;

    // Don't block a garden path, a doorway or a mailbox: those all sit level
    // with the middle of a house, so just stay clear of that line.
    let blocksAnApproach = false;
    for (const h of houses) {
      if (h.side !== (left ? 'left' : 'right')) continue;
      if (Math.abs(h.cy - y) < 12) { blocksAnApproach = true; break; }
    }
    if (blocksAnApproach) continue;

    // Give them room to breathe.
    if (trees.some(t => Math.hypot(t.x - x, t.y - y) < 14)) continue;

    trees.push({
      x, y, size,
      tint: TREE_TINTS[Math.floor(rng() * TREE_TINTS.length)],
      lean: (rng() - 0.5) * 0.9,        // a slight tilt, so they aren't clones
      sway: rng() * Math.PI * 2,        // where in its sway the tree starts
    });
  }
  return trees;
}

// Is a small box around (x, y) free of every solid rectangle?
function clearOfSolids(x, y, pad, solids) {
  for (const s of solids) {
    if (x + pad > s.x && x - pad < s.x + s.w &&
        y + pad > s.y && y - pad < s.y + s.h) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Neighbours. Some stroll up and down the pavement, others potter about in
// their own front garden. They don't get in your way — you walk straight past
// them — they're just there so the street isn't deserted.
// ---------------------------------------------------------------------------
const SKIN  = ['#f2c9a0', '#e0a878', '#c98c5c', '#8d5a3b', '#66412a', '#f7d9b8'];
const HAIR  = ['#3a2a1e', '#6b4423', '#221c18', '#8a6a3a', '#a8a29b', '#c96f3f'];
const SHIRT = ['#e0685f', '#4e9fd6', '#5fbe86', '#e8b54f', '#9a7bc8', '#e2879f',
               '#4fb3a8', '#f0f0e8', '#6c7a8a'];
const PANTS = ['#3a4557', '#5a4636', '#2f3c63', '#6b6f78', '#43524a'];

function generateNeighbours(rng, houses, routeLength) {
  const neighbours = [];
  const target = Math.floor(routeLength / 95);

  // About a third of them are stood in a front garden, the rest are out
  // walking. Only houses without a fence get a garden neighbour, so nobody
  // ends up trapped behind their own pickets.
  const openHouses = houses.filter(h => h.type === 'mailbox');
  shuffle(openHouses, rng);
  let openIndex = 0;

  for (let i = 0; i < target; i++) {
    const inGarden = rng() < 0.35 && openIndex < openHouses.length;
    let x, y, roam;

    if (inGarden) {
      const h = openHouses[openIndex++];
      const left = h.side === 'left';
      x = left ? h.x1 + 5 : h.x0 - 5;
      y = h.cy + (rng() - 0.5) * (h.depth - 14);
      roam = 7;
    } else {
      const left = rng() < 0.5;
      // Pavement only, which has nothing solid on it to walk through.
      x = left ? BAND.leftWalk[0] + 2 + rng() * 7
               : BAND.rightWalk[0] + 2 + rng() * 7;
      y = 40 + rng() * (routeLength - 80);
      roam = 26;
    }

    neighbours.push({
      x, y,
      homeX: x, homeY: y,
      roam,
      targetX: x, targetY: y,
      thinkT: rng() * 2,
      speed: 9 + rng() * 7,
      walking: false,
      facing: rng() < 0.5 ? 'down' : 'up',
      anim: rng() * 2,
      height: 14.5 + rng() * 2.5,
      skin: SKIN[Math.floor(rng() * SKIN.length)],
      hair: HAIR[Math.floor(rng() * HAIR.length)],
      shirt: SHIRT[Math.floor(rng() * SHIRT.length)],
      pants: PANTS[Math.floor(rng() * PANTS.length)],
    });
  }
  return neighbours;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// A seeded random number generator, so a route is reproducible if we ever want
// to replay one. Returns a function that gives numbers in [0, 1).
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}
