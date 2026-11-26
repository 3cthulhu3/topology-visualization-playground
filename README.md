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
| **Surfaces** | Wave graph (the original demo), saddle, sphere, torus, Möbius strip, Klein bottle (figure-8 immersion), catenoid ↔ helicoid Bonnet family, genus-g surfaces (0–4 handles) |
| **Curvature colouring** | Gaussian curvature *K* or mean curvature *H* on a diverging blue–white–red scale, with a legend |
| **Topology panel** | Euler characteristic χ, orientability, genus (or crosscap number), boundary components — and χ = V − E + F **counted on the rendered mesh**, as an independent check |
| **Gauss–Bonnet check** | Live ∫K dA / 2π, compared against χ for closed surfaces |
| **Local invariants** | Metric (E, F, G), K, H and second fundamental form (L, M, N) at a probe point, grouped into intrinsic and extrinsic |
| **Geodesics** | A fan of geodesics from any start point, traced intrinsically with Christoffel symbols; continues across glued seams (torus, Möbius, Klein) |
| **Parallel transport** | A vector carried around a loop, with its holonomy compared live against the enclosed curvature |
| **Shareable links** | Surface, parameters, colour mode, wireframe and the active tool live in the URL hash |
| **Robustness** | Clear messages for missing WebGL, blocked CDN or opening from `file://`; invalid links fall back to defaults |
| **Accessibility** | Labelled controls, live values in `<output>`, focus styles, auto-rotate off under `prefers-reduced-motion` |

## Quick start

There is no build step and no dependencies to install. three.js is loaded from a CDN
through an import map.

```bash
git clone https://github.com/3cthulhu3/topology-visualization-playground
cd topology-visualization-playground
npm start            # zero-dependency static server → http://localhost:8000
# or: python3 -m http.server 8000   (always uses the CDN)
```

> Opening `index.html` directly (`file://…`) does **not** work: browsers refuse to
> load ES modules from the file system. The page tells you this if you try.

Requirements: a browser with WebGL and import-map support (current Chrome, Firefox,
Safari or Edge). You need Node ≥ 20 only for `npm start` and the tests.

### Working offline

three.js is loaded from a CDN by default. To use the playground without internet
access, download the pinned version once while you are online:

```bash
npm run vendor       # saves three.js into vendor/ (not committed)
npm start            # now serves three.js from vendor/ — no network needed
```

`npm start` tells you which mode it is in. The version and the list of add-ons are read
from the import map in `index.html` and from the app's own imports, so there is nothing
to keep in sync by hand. GitHub Pages and other static hosts keep using the CDN.

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
6. **Same metric, same H, different shape.** Choose *Catenoid ↔ helicoid* and drag *t*.
   In the local-invariants panel, E, F, G, K and H do not move, but L, M and N rotate
   from (−1, 0, 1) to (0, 1, 0). That means the metric and the mean curvature alone do
   not determine the surface.
7. **Adding handles.** Choose *Genus-g surface* and step *g* from 0 to 4. The mesh
   count V − E + F drops by 2 each time (2, 0, −2, −4, −6), and ∫K dA / 2π follows it.
   The extra negative curvature sits in the blue necks where the handles join.
8. **Curvature bends straight lines.** Under *Geodesics & parallel transport*, choose
   *Geodesic fan*. On the sphere, seven geodesics leave one point and meet again at the
   antipode (K > 0 focuses them). On the saddle they fan out (K < 0). On the flat wave
   graph (amplitude 0) they stay straight.
9. **Holonomy measures curvature.** Choose *Parallel transport around a loop* on the
   sphere or the torus and move the loop. After one lap, the transported vector (cyan
   → magenta) has turned by exactly the curvature enclosed between this loop and the
   reference loop (mod 360°).

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
    mesh.js             Surface → typed-array mesh buffers; total curvature      [pure]
    implicit.js         Marching tetrahedra, curvature of level sets F = 0       [pure]
    topology.js         χ = V − E + F on a mesh, with seam/pole welding          [pure]
    geodesics.js        Geodesics, parallel transport, holonomy (RK4)            [pure]
    colormap.js         Diverging colour map with robust limits                  [pure]
  render/
    viewer.js           Thin three.js wrapper (in-place buffer updates, resize, framing)
  ui/
    format.js           Text for panels                                          [pure]
scripts/
  serve.js              `npm start`: local static server (uses vendor/ when present)
  vendor-three.js       `npm run vendor`: downloads three.js for offline use
  lib/                  Server, import-map and download helpers (tested)
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

Surfaces that are easier to describe as the boundary of a solid can use
`kind: "implicit"` instead. Provide `field(x, y, z, p)` (negative inside),
`bounds(p)` and `featureSize(p)`; see the genus-g entry for an example.

If the domain is glued (u wraps around, or wraps with a flip like a Möbius strip), add
`seams: { u: "periodic" | "flip", v: "periodic" }` so geodesics continue across the
edge and parallel transport is offered.

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
at several parameter values. Every surface's mesh is counted (V − E + F) and compared
with its topology metadata at default and extreme parameters; genus-g surfaces are
checked for g = 0…4, including convergence of ∫K dA under grid refinement. Geodesics
are checked against great circles (sphere), straight lines (flat graph) and the torus's
outer equator. The fan is checked for refocusing at the antipode, and seam crossing on
the Möbius strip. Holonomy is checked against 2π(1 − cos v₀) on the sphere and against
the enclosed curvature on sphere and torus. The dev server and the vendor script are
tested too: import-map rewriting, CDN vs local mode, path-traversal protection, mirror
fallback and rejection of HTML error pages. They also check mesh buffer integrity, colour mapping,
and URL round-tripping, including malformed links. CI runs the same tests on every
push (`.github/workflows/test.yml`).

## Known limitations

- Curvature uses central finite differences, which are accurate to about 1e-4. The
  colour scale clips at the 98th percentile of |value|, so a few extreme points cannot
  wash out the rest of the surface.
- The Klein bottle is an immersion, so its self-intersections are expected. The mesh χ
  count tells sheets apart by their tangent planes, so it does not merge them.
- For implicit (genus-g) surfaces, ∫K dA is integrated over the triangle mesh. The error
  is about 1 % of |χ| at the default grid and shrinks as the grid is refined; the panel
  allows for it. The V − E + F count itself is exact.
- Mean curvature depends on the sign of the normal. On non-orientable surfaces, a jump
  in the H colouring is real, not a bug.
- Geodesics stop at real boundaries and at coordinate singularities (the sphere's
  poles); the readout says how many stopped early. Parallel transport is offered on
  surfaces whose u-direction is periodic (sphere, torus).
- three.js comes from `cdn.jsdelivr.net` unless you have run `npm run vendor` (see
  *Working offline*).

## Roadmap

- [x] Curvature comparison (K / H colouring, ranges)
- [x] Topological invariants and a live Gauss–Bonnet check
- [x] Bonnet problem: the catenoid ↔ helicoid family, where the metric and mean
      curvature stay fixed but the shape changes (see the note below)
- [x] Genus-g surfaces and connected sums: χ counted on the mesh drops by 2 per handle
- [x] Geodesics and parallel transport (holonomy ↔ enclosed curvature)
- [x] Optional offline mode with vendored three.js (`npm run vendor`)

### A note on Bonnet pairs

For a generic surface, the metric and the mean curvature function determine it up to
rigid motion. Bonnet showed there are three exceptions: surfaces of constant mean
curvature, Bonnet families, and Bonnet pairs. The catenoid ↔ helicoid demo is the
simplest member of the first class (H ≡ 0).

Whether a *compact* Bonnet pair exists stayed open for a long time. The first examples,
a pair of real-analytic immersed tori, were constructed by Bobenko, Hoffmann and
Sageman-Furnas in *Compact Bonnet pairs: isometric tori with the same curvatures*,
Publ. Math. IHÉS 142 (2025) 241–293
([arXiv:2110.06335](https://arxiv.org/abs/2110.06335)). Visualising those tori is a
possible future addition.

## License

[MIT](LICENSE)
