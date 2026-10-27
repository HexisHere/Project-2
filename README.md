# Found on the Oval

A location-based AR experience featuring a pine marten, a macaw, and three pine beetles.

Walk to the marked location on the Oval to unlock the models. Choose a model on the webpage, then tap **View in AR** to place it in your surroundings.

## Try It

- [Live experience](https://hexishere.github.io/Project-2/)
- [Test without walking](https://hexishere.github.io/Project-2/?fake)

Open the page in Safari on iPhone or Chrome on a supported Android phone.

1. Tap **Start**.
2. Allow location access for the live experience.
3. Walk within 15 meters of the target.
4. Select a model.
5. Tap **View in AR** and follow the placement instructions.

The test link simulates approaching the target and unlocks the models after approximately 10 seconds.

## Models

| Model | AR Placement |
|---|---|
| Pine marten | Ground |
| Macaw | Ground |
| Three pine beetles | Wall |

Models are selected on the same webpage and viewed one at a time. Exit AR to select another model.

## Target Location

```js
const TARGET = { lat: 40.000213, lon: -83.013804 };
const RADIUS = 15;
```

GPS controls when the models unlock. Their placement in AR is adjusted by the viewer rather than automatically fixed to the GPS coordinates.

## Project Files

Keep these files together in the repository root:

```text
index.html
marten_back_fixed.glb
parrot_macaw_animated.glb
three_pinebeetles_rigged_animated.glb
README.md
```

## Scout Mode

Add `?scout` to the webpage URL to record candidate locations.

Tap **Mark this spot** to save the current coordinates with a note. Saved spots remain in that browser. To change the target, manually copy the chosen coordinates into `TARGET` in `index.html`.

## Publishing

The project is hosted with GitHub Pages. After editing files, commit and push the changes to the `main` branch, then wait for deployment to finish.

## Technology

Built with HTML, CSS, JavaScript, the browser Geolocation API, and Google's `<model-viewer>`.

AR availability and wall placement behavior depend on the device and browser. GPS accuracy varies with surroundings.
