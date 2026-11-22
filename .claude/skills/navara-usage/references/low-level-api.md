# Low-level API — Feature evaluation, picking, geodetic math

Use these when declarative layer config isn't enough: data-driven styling per feature, spatial queries, or custom geometry placement.

## FeatureEvaluator — data-driven styling

Obtained from layer `featureCreated`/`featureUpdated` events. `evaluate()` runs per batch and returns only the properties you want to override (all optional: `color`, `show`, `height`, `extrudedHeight`, `text`, `width`, `size`, `opacity`, `declutterPriority`):

```typescript
import { Color } from "@navaramap/three";

const updatedFeatures = new Set<bigint>();
layer.on("featureUpdated", ({ evaluator }) => {
  if (updatedFeatures.has(evaluator.id)) return;   // evaluator.id is a bigint
  updatedFeatures.add(evaluator.id);
  evaluator.evaluate(
    ({ properties }) => ({
      extrudedHeight: (properties?.["height"] as number) ?? 0,
      color: new Color().setStyle((properties?.["color"] as string) ?? "#ffffff"),
      show: ((properties?.["height"] as number) ?? 0) >= 30,
    }),
    { filters: ["height", "color"] },   // read only these attributes — important for perf on large data
  );
});
```

- Prefer `filters` (or `readFilteredFeatureProperties`) over reading all properties on large datasets.
- `readFeatureProperties(cb)` reads attributes without styling (e.g. build a legend).
- **Label decluttering:** `text`/`point`/`billboard` materials declutter by default (`declutter: true`) — screen-overlapping labels hide the lower-priority one (with a fade). Set `declutter: false` on the material to draw every label unconditionally. Placement priority: layer-level `declutterPriority` on the material, overridable per feature by returning `declutterPriority` from `evaluate()` — higher wins; among equal priorities currently-shown labels are sticky (hysteresis), then ties resolve deterministically by anchor position. The placement math itself is a Rust kernel (`declutterPlace` in `navara_wasm_api`); the TS `DeclutterManager` only orchestrates. Reference: `example/pages/styling/mvt-text`.
- To restyle interactively (click-to-highlight), change your evaluation state and call `layer.forceUpdate()`.
- Full API: https://navara.world/docs/three/api/feature-evaluator/ — runnable references in the Navara repo: `example/pages/styling/*` (one per geometry × source type).

## Picking & spatial queries

```typescript
view.on("featureClick", (info) => info?.properties?.["gml:name"]); // requires picking: true (default); null on empty space
view.on("featureHover", (info) => { /* hovered feature or null */ }); // also featureEnter / featureLeave
const ecef = view.pickTerrainPosition(x, y);                  // terrain only
const ecef2 = view.pickDepthPosition(x, y);                   // anything in the depth buffer
const h = view.sampleTerrainHeight({ lat, lng });             // DEGREES in; undefined if not loaded yet
const unobserve = view.observeTerrainHeightAt({ lat, lng }, (height) => { ... }); // DEGREES in
```

`featureClick`/`featureHover` receive a `FeatureInfo` (`{ batchId, properties, layerId, meshGeomType? }`) or `null`. Pointer events (`click`, `pointerdown`, `pointermove`, `pointerup`, `pointerenter`, `pointerleave`) deliver a `MapPointerEvent` — a DOM `PointerEvent` plus `.map` (ECEF coords on the globe). `click` fires only for a real click/tap gesture, never for camera drags. The `idle` event fires after `idleThreshold` ms without tile/data activity.

## Geodetic / ECEF math (exported from `@navaramap/three`; standalone in `@navaramap/three-api`)

Positions in the scene are **ECEF meters**. Geodetic helpers take lng/lat in **degrees** (`geodeticToVector3`, `vector3ToGeodetic`, `EllipsoidGeodesic`, …).

### Placing a mesh at a lng/lat — use `geodetic`

```typescript
import { Color } from "@navaramap/three";
import type { BoxMeshDesc } from "@navaramap/three-default-descs";

// geodetic builds a West-Up-North (Y-up) frame at the point: +Y is up, +Z is north.
const pillar = view.addMesh<BoxMeshDesc>({
  box: { width: 1, height: 1, depth: 1, color: new Color().setStyle("#3366cc") },
  geodetic: { lng: 139.767125, lat: 35.681236, height: 0 }, // degrees / metres
  scale: { x: 5_000, y: 80_000, z: 5_000 },  // offsets WITHIN the frame: y = up
  position: { x: 0, y: 40_000, z: 0 },       // box is centered — lift by half its height
  lit: false,                                // flat color, no light needed
});

// Cheap per-frame update: only the matrix is recomposed.
pillar.update({ scale: { x: 5_000, y: 120_000, z: 5_000 }, position: { x: 0, y: 60_000, z: 0 } });
pillar.update({ geodetic: { lat: 34.69 } });  // partial: keeps lng/height/heading
```

`geodetic` is mutually exclusive with `matrix` and `matrixWorld`. `heading`/`pitch`/`roll` are degrees (heading = compass bearing of the mesh's +Z, same convention as `setCamera`). `heightReference: "terrain"` makes `height` relative to the terrain under the point.

### Tangent-frame matrices (for other axis conventions)

```typescript
import {
  geodeticToVector3, vector3ToGeodetic,
  eastNorthUpToFixedFrame, geodeticSurfaceNormal,
  getPickRay, getPlaneFromPointNormal, getRayPlaneIntersection,
  convertWorldToScreen, EllipsoidGeodesic,
} from "@navaramap/three";

// Build a tangent frame at the origin and pass it as matrixWorld; then
// position/rotation/scale are offsets WITHIN that frame, in meters:
const origin = geodeticToVector3({ lat: 35.681236, lng: 139.767125, height: 0 }); // degrees
const enuFrame = eastNorthUpToFixedFrame(origin);
view.addMesh<BoxMeshDesc>({
  box: { width: 50, height: 100, depth: 50 },  // note: box height is local Y = North in ENU
  matrixWorld: enuFrame,
  position: { x: 200, y: 50, z: 0 },   // offsets WITHIN the ENU frame, in meters (z = up)
});

// Geodesic distance / interpolation on the ellipsoid (lat/lng in degrees):
const geodesic = new EllipsoidGeodesic(startLLE, endLLE);
geodesic.distance; geodesic.interpolatePoints(64);
```

Pick the tangent-frame function by the axis orientation your mesh expects — all take an ECEF origin `Vector3` and return a `Matrix4`, all exported from `@navaramap/three`:

| Function | Local axes (x, y, z) |
|---|---|
| `eastNorthUpToFixedFrame` | East, North, Up |
| `northEastDownToFixedFrame` | North, East, Down |
| `northUpEastToFixedFrame` | North, Up, East |
| `northWestUpToFixedFrame` | North, West, Up |

Mesh transform modes: standard `position`/`rotation`/`scale` (Cartesian ECEF — the default), `geodetic` (lng/lat placement in a Y-up West-Up-North frame — the usual choice for geographic placement), `matrix` (local frame), `matrixWorld` (world frame — for a custom tangent frame, as above). Only one of `geodetic`/`matrix`/`matrixWorld` may be set.

Full math API reference: https://navara.world/docs/three/api/navara_three_api — the most complete runnable reference for picking + geometry math is `example/pages/debug/mesh-picking/main.ts` in the Navara repo.
