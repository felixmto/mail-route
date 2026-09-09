// ---------------------------------------------------------------------------
// mobile.js — the phone version: portrait screen, swipe to steer, tap to post.
//
// Loaded last, so everything it needs (input, useE, drinkCoffee, setState,
// fitToWindow, g) already exists as a global.
//
// The controls are deliberately different from the desktop game rather than a
// translation of it. There is nowhere to rest four thumbs on a phone, so:
//
//   * the postman walks non-stop, and a swipe turns him
//   * he pulls up by himself at a house, and waits there
//   * a double-tap posts the letter (or hands a dog a biscuit)
//   * coffee, pause and quit are buttons along the top
//
// There is no hop on a phone. It can't clear a car anyway, so it was only ever
// a small burst of speed, and every sensible gesture for it collides with the
// double-tap.
// ---------------------------------------------------------------------------

// --- Gesture thresholds, all in CSS pixels / milliseconds ------------------
const SWIPE_MIN     = 22;   // how far a finger travels before it's a swipe
const TAP_MAX_MOVE  = 14;   // ...and how far it may wobble and still be a tap
const TAP_MAX_MS    = 260;  // a tap is a quick touch, not a rest
const DOUBLE_TAP_MS = 320;  // second tap has to land inside this to count

const STORE_KEY = 'mailroute.mobile';

const mEl = {
  body:    document.body,
  screen:  document.getElementById('screen'),
  rotate:  document.getElementById('rotate'),
  modeDesktop: document.getElementById('mode-desktop'),
  modeMobile:  document.getElementById('mode-mobile'),
  act:     document.getElementById('t-act'),
  coffee:  document.getElementById('t-coffee'),
  pause:   document.getElementById('t-pause'),
  quit:    document.getElementById('t-quit'),
};

// ---------------------------------------------------------------------------
// Switching between the two versions
// ---------------------------------------------------------------------------
// `remember` is false for the automatic guess we make on the first load: only
// an actual click on the Desktop/Mobile buttons should overwrite the saved
// preference, or the guess would pin itself in place forever.
function setMobile(on, remember) {
  MOBILE = on;
  mEl.body.classList.toggle('mobile', on);

  // Don't leave him walking into a wall after a mode change.
  input.left = input.right = input.up = input.down = false;
  input.jumpPressed = false;
  g.autoStopHouse = null;

  if (mEl.modeDesktop) mEl.modeDesktop.classList.toggle('on', !on);
  if (mEl.modeMobile)  mEl.modeMobile.classList.toggle('on', on);

  // Private browsing throws on localStorage, and a saved preference is not
  // worth breaking the game over.
  if (remember) {
    try { localStorage.setItem(STORE_KEY, on ? '1' : '0'); } catch (err) { /* ignore */ }
  }

  fitToWindow();       // recomputes VIEW_H for the new layout
  checkOrientation();
}

// A phone on its side gives a wide, short view: almost no street left to see.
// Ask for it the tall way round instead.
//
// Only an actual touch device gets told this. A wide window on a desktop is
// someone having a look at the mobile version, and fitToWindow already gives
// them a phone-shaped box — telling them to rotate their monitor would just
// cover the menu with a message they can't act on.
function checkOrientation() {
  if (!mEl.rotate) return;
  const onPhone = window.matchMedia('(pointer: coarse)').matches;
  const sideways = MOBILE && onPhone && window.innerWidth > window.innerHeight;
  mEl.rotate.classList.toggle('hidden', !sideways);
  if (sideways && g.state === 'PLAYING') setState('PAUSED');
}

// ---------------------------------------------------------------------------
// Steering
// ---------------------------------------------------------------------------

// Exactly one direction at a time. updatePostman normalises whatever it's
// given, so a single flag is full walking speed — and because nothing ever
// clears these again, this is what makes him walk non-stop.
function setDirection(dir) {
  input.left = input.right = input.up = input.down = false;
  input[dir] = true;
  // A swipe is you overruling the automatic stop, so let him leave the zone he
  // was parked in without being caught by it again on the next step.
  g.autoStopHouse = g.promptHouse;
}

// ---------------------------------------------------------------------------
// Reading the finger
// ---------------------------------------------------------------------------
let touchX = 0, touchY = 0, touchT = 0;
let touchId = null;      // only ever follow the first finger down
let swiped = false;      // this gesture has already been spent as a swipe
let lastTapT = 0;

function onTouchStart(e) {
  if (e.cancelable) e.preventDefault();
  // If there's only one finger on the glass then this gesture is the one to
  // follow, even if we think we're still tracking an older one. A touchend can
  // genuinely go missing — the browser hands the gesture off to the OS, a call
  // comes in, the tab goes to the background — and without this reset that
  // would leave steering dead for the rest of the shift.
  if (e.touches.length <= 1) touchId = null;
  if (touchId !== null) return;      // a second finger; ignore it
  const t = e.changedTouches[0];
  touchId = t.identifier;
  touchX = t.clientX;
  touchY = t.clientY;
  touchT = performance.now();
  swiped = false;
}

function onTouchMove(e) {
  if (e.cancelable) e.preventDefault();
  if (touchId === null || swiped) return;
  const t = findTouch(e.changedTouches);
  if (!t) return;

  const dx = t.clientX - touchX;
  const dy = t.clientY - touchY;
  if (Math.hypot(dx, dy) < SWIPE_MIN) return;

  // Turn the moment the swipe is long enough, rather than waiting for the
  // finger to lift — waiting adds a very noticeable lag to every turn.
  swiped = true;
  if (g.state !== 'PLAYING') return;
  if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? 'right' : 'left');
  else setDirection(dy > 0 ? 'down' : 'up');
}

function onTouchEnd(e) {
  if (touchId === null) return;
  const t = findTouch(e.changedTouches);
  if (!t) {
    // Not the finger we were following. If nothing is left on the glass at
    // all, ours has gone missing — forget it rather than latch on it.
    if (e.touches.length === 0) touchId = null;
    return;
  }
  touchId = null;
  if (swiped) return;

  const moved = Math.hypot(t.clientX - touchX, t.clientY - touchY);
  const held = performance.now() - touchT;
  if (moved > TAP_MAX_MOVE || held > TAP_MAX_MS) return;

  const now = performance.now();
  if (now - lastTapT < DOUBLE_TAP_MS) {
    lastTapT = 0;                       // so a third tap starts a fresh pair
    if (g.state === 'PLAYING') useE();
  } else {
    lastTapT = now;
  }
}

function findTouch(list) {
  for (const t of list) if (t.identifier === touchId) return t;
  return null;
}

// passive:false is what lets preventDefault work here, which is what stops iOS
// scrolling the page, bouncing it, or zooming on a double-tap.
const TOUCH_OPTS = { passive: false };
mEl.screen.addEventListener('touchstart', onTouchStart, TOUCH_OPTS);
mEl.screen.addEventListener('touchmove', onTouchMove, TOUCH_OPTS);
mEl.screen.addEventListener('touchend', onTouchEnd, TOUCH_OPTS);
mEl.screen.addEventListener('touchcancel', () => { touchId = null; }, TOUCH_OPTS);

// ---------------------------------------------------------------------------
// The buttons along the top
// ---------------------------------------------------------------------------
if (mEl.act)    mEl.act.addEventListener('click', () => { if (g.state === 'PLAYING') useE(); });
if (mEl.coffee) mEl.coffee.addEventListener('click', () => { if (g.state === 'PLAYING') drinkCoffee(); });
if (mEl.quit)   mEl.quit.addEventListener('click', () => { if (g.state !== 'MENU') setState('MENU'); });
if (mEl.pause)  mEl.pause.addEventListener('click', () => {
  if (g.state === 'PLAYING') setState('PAUSED');
  else if (g.state === 'PAUSED') setState('PLAYING');
});

// The way out of the rotate message, for anything that reports a touch screen
// but can't actually be turned — a touchscreen laptop, a kiosk. Without this
// the message is a dead end, because it covers the menu underneath it.
const rotateOut = document.getElementById('rotate-out');
if (rotateOut) rotateOut.addEventListener('click', () => setMobile(false, true));

if (mEl.modeDesktop) mEl.modeDesktop.addEventListener('click', () => setMobile(false, true));
if (mEl.modeMobile)  mEl.modeMobile.addEventListener('click', () => setMobile(true, true));

// Send him off walking as soon as a shift starts, so "he never stops" is true
// from the first frame rather than after your first swipe. This runs after
// game.js's own handler on the same buttons, so the shift is already set up.
for (const btn of document.querySelectorAll('.shift[data-minutes]')) {
  btn.addEventListener('click', () => { if (MOBILE) setDirection('down'); });
}

window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);

// ---------------------------------------------------------------------------
// Which version to open with
// ---------------------------------------------------------------------------
let startMobile = false;
try {
  const saved = localStorage.getItem(STORE_KEY);
  if (saved !== null) startMobile = saved === '1';
  // Nothing saved: guess from the device. A coarse pointer means a finger, but
  // that alone catches touchscreen laptops too — so also ask for a portrait
  // window, which a phone has and a laptop doesn't. Either way the toggle is
  // right there on the menu if the guess is wrong.
  else startMobile = window.matchMedia('(pointer: coarse)').matches
                  && window.innerHeight >= window.innerWidth;
} catch (err) {
  startMobile = false;
}
setMobile(startMobile, false);

// Handy from the console, the same way __game and __input are.
window.__mobile = { setMobile, setDirection, checkOrientation };
