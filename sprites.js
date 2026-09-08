// ---------------------------------------------------------------------------
// sprites.js — all the hand-drawn pixel art.
//
// HOW A SPRITE WORKS
// Each sprite is just an array of strings. One character = one pixel.
//   '.'  means transparent — draw nothing there.
//   anything else is looked up in PAL below to get a colour.
// So you can edit the art by typing. Every row of a sprite must be the same
// length, or the picture will come out ragged.
// ---------------------------------------------------------------------------

const PAL = {
  h: '#2f4f9e',  // postal cap
  H: '#5a3d24',  // hair
  f: '#f3c9a0',  // face
  F: '#d9a97e',  // face shading
  e: '#2b2b38',  // eyes
  u: '#5b83e0',  // uniform shirt
  U: '#3f61b4',  // uniform shading
  s: '#8f6f3c',  // satchel strap
  p: '#31406b',  // trousers
  k: '#26262f',  // shoes
  a: '#d1a95f',  // satchel
  A: '#b38c46',  // satchel shading
  w: '#ffffff',
  d: '#b07a41',  // dog fur
  D: '#8a5c2c',  // dog fur shading
  n: '#33251a',  // dog nose
  t: '#c99757',  // dog ears / tail
  b: '#4a78dc',  // mailbox body
  B: '#2f5199',  // mailbox shading
  o: '#8a6b45',  // wooden post
  O: '#6d5236',  // post shading
  r: '#e04b4b',  // mailbox flag (red = mail waiting)
};

// ---------------------------------------------------------------------------
// The postman — 12 x 16. Four directions, two frames each.
// ---------------------------------------------------------------------------
const POSTMAN = {
  // Walking towards the camera (down the screen).
  down: [
    [
      '....hhhh....',
      '...hhhhhh...',
      '..hhhhhhhh..',
      '....ffff....',
      '...ffffff...',
      '...feffef...',
      '....fFFf....',
      '..uuuuuuuu..',
      '.suuuuuuuus.',
      '.suuuuuuuus.',
      '.saaUUUUaas.',
      '..aaUUUUaa..',
      '...pppppp...',
      '...pp..pp...',
      '...pp..pp...',
      '..kkk..kkk..',
    ],
    [
      '....hhhh....',
      '...hhhhhh...',
      '..hhhhhhhh..',
      '....ffff....',
      '...ffffff...',
      '...feffef...',
      '....fFFf....',
      '..uuuuuuuu..',
      '.suuuuuuuus.',
      '.suuuuuuuus.',
      '.saaUUUUaas.',
      '..aaUUUUaa..',
      '...pppppp...',
      '..ppp..ppp..',
      '..pp....pp..',
      '.kkk....kkk.',
    ],
  ],
  // Walking away from the camera (up the screen) — back of the head, no brim.
  up: [
    [
      '....hhhh....',
      '...hhhhhh...',
      '...hhhhhh...',
      '....HHHH....',
      '...HHHHHH...',
      '...HHHHHH...',
      '....HHHH....',
      '..uuuuuuuu..',
      '.suuuuuuuus.',
      '.suuuuuuuus.',
      '.saaUUUUaas.',
      '..aaUUUUaa..',
      '...pppppp...',
      '...pp..pp...',
      '...pp..pp...',
      '..kkk..kkk..',
    ],
    [
      '....hhhh....',
      '...hhhhhh...',
      '...hhhhhh...',
      '....HHHH....',
      '...HHHHHH...',
      '...HHHHHH...',
      '....HHHH....',
      '..uuuuuuuu..',
      '.suuuuuuuus.',
      '.suuuuuuuus.',
      '.saaUUUUaas.',
      '..aaUUUUaa..',
      '...pppppp...',
      '..ppp..ppp..',
      '..pp....pp..',
      '.kkk....kkk.',
    ],
  ],
  // Drawn facing RIGHT. The renderer mirrors it for walking left.
  side: [
    [
      '...hhhh.....',
      '..hhhhhh....',
      '..hhhhhhhh..',
      '...ffff.....',
      '..ffffff....',
      '..fffffe....',
      '...fFFf.....',
      '..uuuuuu....',
      '.suuuuuuU...',
      '.suuuuuuU...',
      '.saaUUUU....',
      '..aaUUUU....',
      '...pppp.....',
      '...pp.pp....',
      '...pp.pp....',
      '..kkk.kkk...',
    ],
    [
      '...hhhh.....',
      '..hhhhhh....',
      '..hhhhhhhh..',
      '...ffff.....',
      '..ffffff....',
      '..fffffe....',
      '...fFFf.....',
      '..uuuuuu....',
      '.suuuuuuU...',
      '.suuuuuuU...',
      '.saaUUUU....',
      '..aaUUUU....',
      '...pppp.....',
      '..ppp.ppp...',
      '..pp...pp...',
      '.kkk...kkk..',
    ],
  ],
};

// ---------------------------------------------------------------------------
// Neighbourhood dog — 14 x 10, drawn facing RIGHT.
// ---------------------------------------------------------------------------
const DOG = [
  [
    '..............',
    '.t.........ee.',
    '.tt...dddddhh.',
    '.ttddddddddhhn',
    '.dddddddddddhh',
    '.dwddddddddwd.',
    '.dd..dd..dd.d.',
    '.D...DD...D...',
    '.D...DD...D...',
    '.k...kk...k...',
  ],
  [
    '..............',
    '.t.........ee.',
    '.tt...dddddhh.',
    '.ttddddddddhhn',
    '.dddddddddddhh',
    '.dwddddddddwd.',
    '.dd..dd..dd.d.',
    '..D..DD..D....',
    '..D..DD..D....',
    '..k..kk..k....',
  ],
];
// The dog sprite reuses 'h' for its head — recolour it to fur when drawing.
const DOG_PAL = Object.assign({}, PAL, { h: PAL.d, w: '#f2e6d2', e: PAL.t });

// ---------------------------------------------------------------------------
// Curbside mailbox — 9 x 14. The flag is drawn separately so it can flip down.
// ---------------------------------------------------------------------------
const MAILBOX = [
  '..bbbbb..',
  '.bbbbbbb.',
  'bbbbbbbbb',
  'bbbbbbbbb',
  'bBBBBBBBb',
  '..bbbbb..',
  '...ooo...',
  '...ooo...',
  '...ooo...',
  '...ooo...',
  '...oOo...',
  '...oOo...',
  '..ooooo..',
  '.ooooooo.',
];

// ---------------------------------------------------------------------------
// drawSprite — paint one sprite with its top-left corner at (x, y).
// Coordinates are rounded to whole pixels so the art never lands on a half
// pixel and turns blurry. Pass flip=true to mirror it horizontally.
// ---------------------------------------------------------------------------
function drawSprite(ctx, rows, x, y, pal, flip) {
  pal = pal || PAL;
  const ox = Math.round(x);
  const oy = Math.round(y);
  const w = rows[0].length;

  for (let ry = 0; ry < rows.length; ry++) {
    const row = rows[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      if (ch === '.') continue;
      const colour = pal[ch];
      if (!colour) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(ox + (flip ? w - 1 - rx : rx), oy + ry, 1, 1);
    }
  }
}

// Tiny helper: a whole-pixel rectangle. Used constantly by render.js.
function px(ctx, x, y, w, h, colour) {
  ctx.fillStyle = colour;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
