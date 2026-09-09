# Mail Route

A cute, blocky arcade game: you're a postman on a suburban round, racing to
empty your mailbag before your shift ends.

### ▶ [Play it in your browser](https://felixmto.github.io/mail-route/)

No download, no install, nothing to sign up for — it runs entirely in the page.

## Running it locally

No build step and no dependencies. Either double-click `index.html`, or serve
the folder:

    git clone https://github.com/felixmto/mail-route.git
    cd mail-route
    python3 -m http.server 8124

then open http://localhost:8124

## How you play

| Key | Does |
| --- | --- |
| Arrow keys / WASD | Walk |
| Space | Hop — a burst of speed, and dogs can't touch you mid-air |
| E (or Enter) | Deliver a letter, or give a dog a treat |
| C | Drink your coffee |
| P | Pause |
| R | Quit to the menu |

The controls sit in a legend across the top of the play area. The **E** lights up
when there's something to do where you're standing, and says which: gold for
*deliver*, pink for *treat*. So you never have to guess whether you're close
enough.

**Treats.** When a dog charges you, you can stand your ground and press E to hand
it a biscuit instead of running. It's friends for the rest of the shift after
that — it stops chasing and pootles about its garden with a little heart over it.
Treating is worth 50 points, but you have to let the dog get right up to you,
which is the same range at which it would bite.

**Coffee.** One cup a shift. Press C and you walk half again as fast for a
minute. The cup sits alongside the key legend at the top of the screen; while
it's working the C chip counts the seconds down, and the cup greys out once
it's gone.

The game is silent by design — there is no audio code in it at all.

The street runs up and down the screen and the houses are off to your left and
right, so you spend the round working your way up the road and crossing it.
Pick a 5, 10 or 15 minute shift. Each house needs one letter:

- **Curbside mailboxes** are easy — walk to the box on the pavement and press E.
  The red flag drops once it's delivered.
- **Porch houses** sit behind a picket fence. You have to go in through the
  garden gate to the front door, and a dog usually lives there.

**Traffic** runs in both directions, and you can't hop over a car. Getting
clipped costs 6 seconds. You can only see about half a screen up the road, so
look before you step off the kerb — on average there's a gap within a second or
so, but roughly one crossing in ten will keep you waiting several seconds.

**Dogs** guard the fenced gardens. They're a bit slower than you walk, so you
can always get away by leaving — the danger is dawdling at the door while one
closes in. A bite costs 8 seconds.

## Changing how hard it is

Everything worth tuning lives at the top of a file, with a comment.

- **`world.js`, the `SHIFTS` table (~line 42)** — houses per shift, what
  fraction need a walk to the front door, and how many dogs are on the route.
  This is the main dial.
- **`world.js`, `HOUSE_PITCH` (~line 48)** — how far apart houses are, and so
  how much walking the route involves.
- **`world.js`, `generateTraffic` / `makeCar` (~line 218)** — the gap between
  cars and how fast they go. Cars much faster than this stop being fair,
  because you can't see far enough up the road to react.
- **`entities.js`, the constants at the top** — walking speed, hop height and
  duration, dog speed and eyesight (`DOG_AGGRO`), how close a dog has to be
  before you can treat it (`TREAT_RANGE`), how long and how strong the coffee is
  (`COFFEE_DURATION`, `COFFEE_BOOST`), and what a dog bite or a car costs you
  (`BITE_PENALTY`, `CAR_PENALTY`).

A rough guide to the pacing: on a clear road the round takes about 2.8 seconds
per house. Traffic roughly doubles that once you count waiting at the kerb, so
reckon on about 5 seconds a house in practice. That puts 38 houses at a bit over
three minutes of a five-minute shift, leaving the rest as your margin for dogs
and near misses. If you raise the house counts, check a shift is still
finishable before you keep the change.

## The files

| File | What's in it |
| --- | --- |
| `index.html` | The page: canvas, menu, HUD, end-of-shift screens |
| `styles.css` | Menu and HUD styling (the game world is all canvas) |
| `art.js` | The colour palette and the shape helpers everything is drawn from |
| `world.js` | Street layout, route generation, traffic |
| `entities.js` | Postman movement, the hop, dog AI, cars |
| `render.js` | Camera and all the drawing |
| `game.js` | Game loop, timer, collisions, delivering, scoring |

## Poking at it while it runs

Open the browser console and you have `__game` (all the state) and `__input`
(the held keys), for example:

    __game.timeLeft = 10          // rush to the end of a shift
    __game.player.y = 2000        // teleport up the street
    __game.world.cars.length = 0  // clear the road

You can also drive the simulation by hand, which is how the difficulty was
tuned — `update(1/60)` advances exactly one frame:

    for (let i = 0; i < 600; i++) update(1/60)   // ten seconds, instantly

## How the art works

Everything is drawn as shapes rather than images — rounded rectangles, circles
and curves — so there is nothing to load and nothing to go blurry.

The trick is that the game draws in **world units** rather than screen pixels.
The visible stretch of street is always 200 x 150 of them, and `game.js` works
out how many real screen pixels that should be and applies it as a single
transform before each frame. So every coordinate in `render.js` is a world
unit, the same numbers the game logic uses, and the picture comes out sharp at
any window size and on any display, including retina screens.

That means if you want to change how something looks, you edit the shapes in
`render.js` and the colours in `art.js`, and you never have to think about
resolution. `art.js` holds the palette in one place — change `C.grass` and every
blade of grass changes with it.
