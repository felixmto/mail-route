// ---------------------------------------------------------------------------
// art.js — the colour palette and the handful of drawing helpers the renderer
// is built out of.
//
// HOW DRAWING WORKS NOW
// Everything is drawn in "world units". The visible stretch of street is
// VIEW_W x VIEW_H of them (200 x 150), and game.js scales that up to fill
// whatever space the window gives us, at the screen's real pixel density.
// So every number in here and in render.js is a world unit, not a screen
// pixel — which is why the art stays smooth at any size instead of turning
// into blocks. Line widths and font sizes are in world units too.
// ---------------------------------------------------------------------------

const C = {
  // --- Ground ---
  grass:        '#8ac96e',
  grassShade:   '#7abb5e',
  grassLight:   '#9bd47f',
  pavement:     '#e6e0d3',
  pavementLine: '#d3ccbc',
  kerb:         '#cfc8b9',
  road:         '#565c68',
  roadLight:    '#616773',
  roadLine:     '#f2cf6b',

  // --- Buildings ---
  wall:         '#fbf7f0',
  wallShade:    '#ebe4d9',
  door:         '#8b5e3c',
  doorShade:    '#734b2f',
  window:       '#bfe3f5',
  windowGlint:  '#ddf1fb',
  chimney:      '#9aa0aa',
  path:         '#e0dacb',
  fence:        '#fbf8f2',
  fenceShade:   '#ddd6c7',

  // --- Foliage ---
  bush:         '#5fa85a',
  bushDark:     '#4d8f4a',
  bushLight:    '#79c070',

  // --- The postman ---
  skin:         '#f2c9a0',
  skinShade:    '#dcae85',
  uniform:      '#3f63b5',
  uniformDark:  '#33509a',
  cap:          '#2c4791',
  satchel:      '#d8ad63',
  satchelDark:  '#b98f4a',
  trousers:     '#2f3c63',
  shoe:         '#2a2f3a',

  // --- The dog ---
  dog:          '#bb8b57',
  dogDark:      '#9c7044',
  dogNose:      '#3a2c20',

  // --- Furniture ---
  mailbox:      '#4a78dc',
  mailboxDark:  '#3760b4',
  post:         '#9a7a52',
  flag:         '#e2574c',

  // --- Accents ---
  gold:         '#ffd66b',
  mint:         '#7fdca0',
  pink:         '#ff9fbb',
  danger:       '#ff8d7a',
  ink:          '#20262f',
  shadow:       'rgba(38, 54, 32, 0.16)',
};

// Pastel roof colours. Every house picks one of these pairs.
const ROOFS = [
  { roof: '#7fc9a8', dark: '#66b490' },   // mint
  { roof: '#f0a98a', dark: '#d88f70' },   // coral
  { roof: '#8fb9e8', dark: '#749fd2' },   // sky
  { roof: '#f2d07a', dark: '#d9b660' },   // butter
  { roof: '#d79bc4', dark: '#bd82ab' },   // blossom
  { roof: '#a8b6e0', dark: '#8d9cc9' },   // lilac
];

// Car paintwork.
const CAR_PAINT = [
  { body: '#e5675f', dark: '#c44f48' },
  { body: '#4e8fd6', dark: '#3b73b3' },
  { body: '#f0efe8', dark: '#d3d1c7' },
  { body: '#5fbe86', dark: '#48a06c' },
  { body: '#454b58', dark: '#333844' },
  { body: '#e8b54f', dark: '#c8963a' },
  { body: '#9a7bc8', dark: '#7f61aa' },
];

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

// Trace a rounded rectangle. Kept as our own helper rather than the browser's
// roundRect so it behaves the same everywhere, and so the radius can never be
// bigger than the box (which would flip the corners inside out).
function rrPath(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

function rr(ctx, x, y, w, h, r, colour) {
  rrPath(ctx, x, y, w, h, r);
  ctx.fillStyle = colour;
  ctx.fill();
}

function circle(ctx, x, y, r, colour) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}

function ellipse(ctx, x, y, rx, ry, colour) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}

// The soft blob under anything that stands on the ground. Everything gets one,
// which is most of what stops a flat top-down scene looking like cut paper.
function groundShadow(ctx, x, y, rx, ry, alpha) {
  ellipse(ctx, x, y, rx, ry, `rgba(38, 54, 32, ${alpha === undefined ? 0.18 : alpha})`);
}

// A rounded line, used for road markings and the like.
function stroke(ctx, x1, y1, x2, y2, width, colour, round) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = width;
  ctx.strokeStyle = colour;
  ctx.lineCap = round ? 'round' : 'butt';
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// ---------------------------------------------------------------------------
// Text. Sizes are world units, so text scales with everything else.
// ---------------------------------------------------------------------------
const FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function text(ctx, str, x, y, size, colour, opts) {
  const o = opts || {};
  ctx.font = `${o.weight || 700} ${size}px ${FONT_STACK}`;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = o.baseline || 'middle';
  if (o.outline) {
    ctx.lineWidth = size * 0.34;
    ctx.strokeStyle = o.outline;
    ctx.lineJoin = 'round';
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = colour;
  ctx.fillText(str, x, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------------------
// The coffee cup. Drawn here rather than in render.js because the HUD paints
// the same cup into its own little canvas beside the key legend.
// Draws into a box `size` units wide, with its own coordinate origin at (x, y).
// ---------------------------------------------------------------------------
function drawCoffeeCup(ctx, x, y, size, spent) {
  const s = size / 24;                       // the artwork is designed at 24 wide
  const cup   = spent ? '#8d939d' : '#fbf8f2';
  const shade = spent ? '#767c86' : '#ded7ca';
  const brew  = spent ? '#5b616b' : '#7a4a26';
  const brewLight = spent ? '#6a707a' : '#96602f';

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  // Saucer.
  ellipse(ctx, 9.5, 20.5, 9, 2.4, shade);

  // Handle, behind the cup.
  ctx.beginPath();
  ctx.arc(16.8, 11, 4.4, -1.15, 1.15);
  ctx.lineWidth = 2.3;
  ctx.strokeStyle = shade;
  ctx.stroke();

  // Body: a cup that tapers towards the base.
  ctx.beginPath();
  ctx.moveTo(2, 5.5);
  ctx.lineTo(17, 5.5);
  ctx.lineTo(15.4, 17);
  ctx.quadraticCurveTo(15.1, 19.4, 12.7, 19.4);
  ctx.lineTo(6.3, 19.4);
  ctx.quadraticCurveTo(3.9, 19.4, 3.6, 17);
  ctx.closePath();
  ctx.fillStyle = cup;
  ctx.fill();

  // The coffee, seen as an ellipse down inside the rim.
  ellipse(ctx, 9.5, 5.9, 6.6, 2.2, brew);
  ellipse(ctx, 8.2, 5.4, 2.6, 0.9, brewLight);

  // Rim, drawn as a ring so the coffee still shows through the middle.
  ctx.beginPath();
  ctx.ellipse(9.5, 5.5, 7.6, 2.7, 0, 0, Math.PI * 2);
  ctx.lineWidth = 1.7;
  ctx.strokeStyle = cup;
  ctx.stroke();

  ctx.restore();
}
