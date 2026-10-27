# Found on the Oval

A location-based AR scene containing a pine marten on the left, a macaw on the right, and three pine beetles arranged vertically at the back. All three models appear together and share a 30-second animation timeline.

## Try It

- [Live experience](https://hexishere.github.io/Project-2/)
- [Test without walking](https://hexishere.github.io/Project-2/?fake)

1. Open the page in Safari on iPhone or Chrome on a supported Android phone.
2. Tap **Start**. For the live experience, allow location and walk within 15 meters of the target. The test link simulates approaching the spot in approximately 10 seconds.
3. Tap **View all three in AR**.
4. Scan the ground and place the entire scene. Move or scale the scene as a whole.

The animals have fixed relative positions. The beetles stand vertically behind the other animals; they do not independently attach to a detected real wall.

## Files

- `index.html`: GPS unlock and AR viewer.
- `oval_three_animals.glb`: combined scene with a single animation clip, `All_Animals_Loop`, for web and supported Android viewers.
- `oval_three_animals.usdz`: separately exported animated scene for iPhone AR Quick Look, supplied through `ios-src`.
- Original GLB files: source models retained for editing.

## Target

```js
const TARGET = { lat: 40.000213, lon: -83.013804 };
const RADIUS = 15;
```

GPS unlocks the scene. AR placement is performed by the viewer and is not fixed precisely to the GPS coordinate.

## Scout Mode

Add `?scout` to record candidate locations with **Mark this spot**. Records are stored in the current browser. Copy a chosen coordinate into `TARGET` manually.

## Deployment

Commit and push `index.html`, both combined scene files, and this README to `main`. Wait for the GitHub Pages deployment to complete before testing.

## Validation

The combined GLB contains three skeletons and one animation driving all three groups. The USDZ contains three skeletons and three skeletal animation sources with 721 time samples each. Animation data and layout were checked locally; actual AR playback must still be tested on the target phone.

Built with HTML, CSS, JavaScript, Geolocation, and Google `<model-viewer>`.
