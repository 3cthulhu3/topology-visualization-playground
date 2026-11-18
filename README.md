# Topology Visualization Playground

An interactive browser playground for building intuition about **surfaces**. You can
see how their **geometry** (shape, curvature) changes as you drag a slider, and
which **topological** quantities stay fixed whatever you do to the shape.

The core idea is the Gauss–Bonnet theorem. On a closed surface, curvature can be
moved around freely, but its total is always the same:

$$\iint_S K \, dA = 2\pi\chi(S)$$

The playground computes the left-hand side numerically, live, while you reshape the
surface.

## Who it is for

- Students in a first course on differential geometry or topology who want to
  *see* Gaussian/mean curvature, orientability and the Euler characteristic.
- Teachers who want a link they can drop into slides or a problem sheet. Every view
  is encoded in the URL.
- Anyone curious why a doughnut and a coffee mug are "the same" but a sphere is not.

## Features

| | |
|---|---|
| **Surfaces** | Wave graph (the original demo), saddle, sphere, torus, Möbius strip, Klein bottle (figure-8 immersion) |
| **Curvature colouring** | Gaussian curvature *K* or mean curvature *H* on a diverging blue–white–red scale, with a legend |
| **Topology panel** | Euler characteristic χ, orientability, genus (or crosscap number), boundary components |
| **Gauss–Bonnet check** | Live ∫K dA / 2π, compared against χ for closed surfaces |
| **Shareable links** | Surface, parameters, colour mode and wireframe live in the URL hash |
| **Robustness** | Clear messages for missing WebGL, blocked CDN or opening from `file://`; invalid links fall back to defaults |
| **Accessibility** | Labelled controls, live values in `<output>`, focus styles, auto-rotate off under `prefers-reduced-motion` |

## Quick start

There is no build step and no dependencies to install. three.js is loaded from a CDN
through an import map.

```bash
git clone https://github.com/3cthulhu3/topology-visualization-playground
cd topology-visualization-playground
npm start            # zero-dependency static server → http://localhost:8000
# or: python3 -m http.server 8000
```

> Opening `index.html` directly (`file://…`) does **not** work: browsers refuse to
> load ES modules from the file system. The page tells you this if you try.

Requirements: a browser with WebGL and import-map support (current Chrome, Firefox,
Safari or Edge). You need Node ≥ 20 only for `npm start` and the tests.

## Things to try

1. **Geometry ≠ topology.** Choose *Torus* and drag *R* and *r*. The red (K > 0) and
   blue (K < 0) regions grow and shrink, but ∫K dA / 2π stays at **0 = χ(torus)**.
2. **Scaling.** On the *Sphere*, change *R*. K = 1/R² changes, the area 4πR² changes,
   but their product does not: the readout stays at **2**.
3. **Boundary matters.** On the *Wave graph*, change the amplitude and watch ∫K dA
   move. A surface with boundary needs an extra boundary term in Gauss–Bonnet, so this
   number is not topological.
4. **Orientability.** Choose *Möbius strip* and colour by *Mean curvature H*. The sign
   of H depends on which way the normal points, and it flips across the seam because
   no consistent normal exists. Now try *Gaussian curvature*: K does not depend on the
   normal, so it stays smooth.
5. **Non-orientable but closed.** The *Klein bottle* has to pass through itself in 3D.
   Gauss–Bonnet still gives **0 = χ**.

Example link: `http://localhost:8000/#surface=torus&R=2.4&r=0.2&color=gaussian`

## Project structure

```
index.html              UI skeleton + import map (three.js version pinned here only)
style.css
src/
  main.js               Bootstrap: WebGL check, loads app, shows readable errors
  app.js                Wires state ↔ UI ↔ viewer
  state.js              State validation and URL-hash (de)serialisation   [pure]
  math/
    surfaces.js         Surface registry: parametrisations, parameters, topology [pure]
    curvature.js        Finite-difference K, H, normals; Gauss–Bonnet integral   [pure]
    mesh.js             Surface → typed-array mesh buffers                       [pure]
    colormap.js         Diverging colour map with robust limits                  [pure]
  render/
    viewer.js           Thin three.js wrapper (in-place buffer updates, resize, framing)
  ui/
    format.js           Text for panels                                          [pure]
scripts/serve.js        Local static server
tests/                  node:test unit tests for every [pure] module
```

**Data flow** (one-directional):

```
input event → state (validated) ─┬→ URL hash
                                 ├→ buildMesh() → viewer.setMesh / setColors
                                 └→ integrateCurvature() → Gauss–Bonnet panel (debounced)
```

All the mathematics is free of three.js and the DOM, so it is unit-tested in Node.
The renderer only receives typed arrays.

## Adding a surface

Add an entry to `SURFACES` in `src/math/surfaces.js`:

```js
{
  id: "cylinder",
  name: "Cylinder",
  description: "Flat (K = 0) but curved in space (H ≠ 0).",
  kind: "parametric",
  params: [{ id: "R", label: "Radius R", min: 0.5, max: 2, step: 0.01, default: 1 }],
  uRange: [0, 2 * Math.PI],
  vRange: [-1.5, 1.5],
  evaluate: (u, v, p) => [p.R * Math.cos(u), p.R * Math.sin(u), v],
  topology: { closed: false, orientable: true, eulerChar: 0, genus: 0, boundaryComponents: 2,
              note: "An annulus: χ = 0 with two boundary circles." }
}
```

You do not need to write any curvature formulas, because they are computed
numerically. The UI controls are generated from `params`, and the tests check every
registry entry automatically: parameter ranges, finite values over the domain, and
χ = 2 − 2g − b (or 2 − k − b for non-orientable surfaces).

## Tests

```bash
npm test
```

The unit tests check the numerical curvature against closed-form results: the sphere
(K = 1/R², |H| = 1/R), the torus (K = cos v / (r(R + r cos v))) and graph surfaces. They
check Gauss–Bonnet (∫K dA / 2π = χ within 0.01) for the sphere, torus and Klein bottle
at several parameter values. They also check mesh buffer integrity, colour mapping,
and URL round-tripping, including malformed links. CI runs the same tests on every
push (`.github/workflows/test.yml`).

## Known limitations

- Curvature uses central finite differences, which are accurate to about 1e-4. The
  colour scale clips at the 98th percentile of |value|, so a few extreme points cannot
  wash out the rest of the surface.
- The Klein bottle is an immersion, so its self-intersections are expected.
- Mean curvature depends on the sign of the normal. On non-orientable surfaces, a jump
  in the H colouring is real, not a bug.
- three.js comes from `cdn.jsdelivr.net`, so the page needs network access the first
  time it loads.

## Roadmap

- [x] Curvature comparison (K / H colouring, ranges)
- [x] Topological invariants and a live Gauss–Bonnet check
- [ ] Bonnet-pair demonstration: two isometric surfaces with the same mean curvature
      that are not congruent
- [ ] Genus-g surfaces and connected sums, to show how χ changes when you add a handle
- [ ] Geodesics and parallel transport (holonomy ↔ enclosed curvature)
- [ ] Optional offline mode with vendored three.js

## License

[MIT](LICENSE)
