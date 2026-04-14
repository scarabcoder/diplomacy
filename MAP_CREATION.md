# Map Creation Requirements

This document summarizes the requirements and constraints from the godip variant generator docs and script, with direct source links.

## Source Links

- Generator README:
  - https://github.com/zond/godip/blob/master/variants/generator/README.md
- Generator script:
  - https://github.com/zond/godip/blob/master/variants/generator/generate.py
- Main godip README, map format section:
  - https://github.com/zond/godip/blob/master/README.md#map-format
- Client map manipulation script referenced by godip:
  - https://github.com/zond/diplicity/blob/master/app/js/dippymap.js

## What The Generator Is For

- The generator is meant to automate most of the work for a map-only Diplomacy variant, but it is not fully automatic.
- The generated output is expected to be tweaked by hand afterward.

Source:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md

## Known Generator Limitations

The current generator does not handle these cases cleanly:

- Provinces with multiple coasts, for example Spain in Classical.
- Build-anywhere variants.
- Victory conditions other than "more than half".
- Non-planar maps; extra edges must be added manually after generation.

Implication:
- You can still use the generator as a starting point, but any of the above must be finished manually in the output map and variant code.

Source:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md

## Tooling Requirements

- Python 2 is required by the original generator.
- The script header is `#!/usr/bin/env python2`.
- PyYAML is required because the script imports `yaml`.
- Inkscape is assumed for authoring the SVG and layer structure.
- A text editor is required for final SVG cleanup and config edits.

Practical note:
- Python 2 is obsolete, so if you actually intend to use this generator today, expect environment friction or a small porting effort.

Sources:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md
- Script: https://github.com/zond/godip/blob/master/variants/generator/generate.py

## High-Level Workflow

The documented workflow is:

1. Create a source image of the map you want.
2. Trace it into an SVG.
3. Run the generator and fix generator mistakes.
4. Manually finish the variant.
5. Add variant tests.

Source:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md

## Input File Naming Requirements

The generator script derives input filenames from the `VARIANT` constant.

- `VARIANT` is a human-readable variant name in `generate.py`.
- The SVG input filename must be:
  - `toLowerAlphaNumeric(VARIANT) + "_input.svg"`
- The YAML config filename must be:
  - `toLowerAlphaNumeric(VARIANT) + ".yml"`

Example:
- If `VARIANT = "GatewayWest"`, the script expects:
  - `gatewaywest_input.svg`
  - `gatewaywest.yml`

Source:
- Script: https://github.com/zond/godip/blob/master/variants/generator/generate.py

## Required YAML Config Keys

The script expects these keys in the YAML config file:

- `START_YEAR`
- `START_UNITS`
- `ABBREVIATIONS`
- `CENTER_OVERRIDES`
- `REGION_OVERRIDES`

Expected roles:

- `START_YEAR`: the first year of the game.
- `START_UNITS`: the starting units by nation.
- `ABBREVIATIONS`: explicit abbreviation overrides when the script cannot infer unique short IDs.
- `CENTER_OVERRIDES`: swaps for center assignment mistakes.
- `REGION_OVERRIDES`: swaps for region-name assignment mistakes.

Recommended first pass from the README:

- Leave `ABBREVIATIONS`, `CENTER_OVERRIDES`, and `REGION_OVERRIDES` blank on the first run, then fill them in only when the generator tells you it needs help.

Sources:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md
- Script: https://github.com/zond/godip/blob/master/variants/generator/generate.py

## SVG Authoring Requirements

The README’s generator workflow requires an SVG traced over a base image. The generator script adds stricter requirements that are easy to miss.

### Important: The Generator Uses Inkscape Layer Labels

The script does not discover layers by plain SVG `id`.

- It looks for `<g>` layers using the Inkscape label attribute:
  - `inkscape:label="points"`
  - `inkscape:label="edges"`
  - `inkscape:label="supply-centers"`
  - etc.

This means:

- Your SVG must be authored as an Inkscape-style layered file.
- The visible layer names in Inkscape must match exactly.
- Setting only an `id` is not sufficient for the generator.

Source:
- Script: https://github.com/zond/godip/blob/master/variants/generator/generate.py

### Required Generator Input Layers

The generator README expects these layers, in this approximate order:

- `points`
- `edges`
- `supply-centers`
- `province-centers`
- `sea`
- `impassable`
- `names`

What each one must contain:

- `points`
  - Small circles at junctions where three or more regions meet.
  - Also circles where two regions touch the edge of the map.
  - Regions touching fewer than three circles need extra circles added around their perimeter.
- `edges`
  - Path segments approximating region borders between junctions.
  - Straight-edged Bezier/path approximations are fine.
- `supply-centers`
  - Supply center marker symbols for every supply center, including home centers.
- `province-centers`
  - Marker symbols for non-supply-center land provinces where armies should be placed.
- `sea`
  - Marker symbols for sea regions where fleets should be placed.
  - Coastal provinces should not also get a sea marker; they should use province/supply-center placement only.
- `impassable`
  - Marker symbols in impassable regions.
- `names`
  - One text element per region.
  - Each region name must live inside a single text box.

Invariant:

- After `supply-centers`, `province-centers`, `sea`, and `impassable` are placed, there should be exactly one center marker for each region of the map.

Source:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md

### Element-Type Requirements Inside Layers

The script assumes specific SVG element types:

- `points` layer:
  - uses `<circle>` and `<ellipse>`
- `edges` layer:
  - uses `<path>`
- `supply-centers` layer:
  - uses `<path>`
- center extraction in layers such as `supply-centers`, `province-centers`, `sea`, `impassable`:
  - reads marker start positions from the `d` attribute of `<path>` elements

Implication:

- If your center markers are not paths, the script will not read them correctly.
- The `supply-centers` layer must contain at least one `<path>` marker because the script copies its path shape as the template for generated center markers.

Source:
- Script: https://github.com/zond/godip/blob/master/variants/generator/generate.py

### SVG Geometry and Cleanup Requirements

- The input SVG should be saved in the `generator` directory.
- Near the top of the file, set the root `<svg>` `width` and `height` attributes to `100%`.
- The script snaps junctions near the page edge to the page boundary using a gutter threshold.

Source:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md
- Script: https://github.com/zond/godip/blob/master/variants/generator/generate.py

## Region Naming And Abbreviations

- Each region needs a unique name.
- Duplicate region names are not allowed.
- The generator tries to infer abbreviations from names.
- If it cannot infer unique abbreviations, add them to `ABBREVIATIONS` in the YAML config.

Examples from the README:

- Similar names like `Java` and `Java Sea` may require explicit abbreviation overrides.

Source:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md

## Common First-Run Errors And Fixes

The README calls out these common generator failures:

- `Warning: Duplicate edges: ...`
  - Usually means a region has only two junctions around it and needs another junction plus edges.
- `XXX appears twice as a region name`
  - Two regions share a name and must be distinguished.
- `Could not determine abbreviation for these names: ...`
  - Add explicit entries to `ABBREVIATIONS`.

Recommended debugging pattern:

- Re-run the generator multiple times and use the generated multicolored debug map to spot merged or bleeding regions.

Source:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md

## ID Verification And Override Pass

Once the generator successfully emits an output map:

- Open the output in Inkscape.
- Use Object Properties to inspect generated IDs.
- Expect some supply centers, province centers, or provinces to be swapped.
- Fix these with:
  - `CENTER_OVERRIDES`
  - `REGION_OVERRIDES`

Why this matters:

- Using the override config is preferable to manual SVG renaming because the generator can also fix the derived connections consistently.

Source:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md

## Manual Finishing Requirements

After generation, the README expects manual finishing work:

- Move the generated map and Go file into the target variant directory.
- Put the SVG map in a `svg` subdirectory.
- Update `variants.go` with a new import and register the variant in the list.
- Add manual map tweaks such as:
  - canals
  - coasts
  - special connections
  - other map details not handled by the generator

Source:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md

## Packaging Requirements For godip

To package the SVG for Go, the main README recommends:

- Use `go-bindata`
- Example:
  - `go-bindata -pkg variants ./svg`

This converts the SVG assets in the `svg` directory into Go source.

Source:
- Main README: https://github.com/zond/godip/blob/master/README.md#map-format

## Validation Requirements

The README recommends validating the generated variant by:

- running:
  - `env DRAW_MAPS=true go test -v ./...`
- from the `variants` directory
- then inspecting the `test_output_maps` directory

Specifically check for:

- incorrect region geometry
- region bleed/merging
- bad center placement
- erroneous sea connections between coastal provinces

Source:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md

## Variant Test Requirements

The docs explicitly recommend adding variant tests after map creation.

Examples:

- sample games
- tests for special rules
- tests for special connectivity

Source:
- README: https://github.com/zond/godip/blob/master/variants/generator/README.md

## Extra Requirements From godip's Main Map Format

The generator README is not the whole story. The main godip README adds client/runtime SVG requirements for map files.

Required runtime SVG layers:

- background bottom layer
- `id="provinces"`
- `id="supply-centers"`
- `id="province-centers"`
- `id="highlights"`
- `id="names"`
- `id="units"`
- `id="orders"`

Additional runtime rules:

- `provinces` should be hidden by default.
- Each province shape should use the region abbreviation as its `id`.
- Multi-coast provinces should include extra transparent coast shapes such as `stp/nc` and `stp/sc`.
- Supply-center markers should use IDs like `lonCenter`.
- Province-center markers for non-SC regions and subprovinces should follow the same `...Center` naming pattern.
- Province-center markers should include `fill:none;stroke:none;` so they are not displayed.
- The SVG should contain a pattern with `id="stripes"` for client-side highlighting.

Transform warning:

- The client map manipulation script does not cope well with SVG `transform` attributes.
- Remove transforms before final use.

Sources:
- Main README: https://github.com/zond/godip/blob/master/README.md#map-format
- Client script: https://github.com/zond/diplicity/blob/master/app/js/dippymap.js

## Minimal Practical Checklist

Before running the generator:

- Install Python 2 and PyYAML.
- Set `VARIANT` in `generate.py`.
- Create `<variant>_input.svg`.
- Create `<variant>.yml`.
- Make sure the SVG uses Inkscape layer labels, not just IDs.
- Add the required layers: `points`, `edges`, `supply-centers`, `province-centers`, `sea`, `impassable`, `names`.
- Ensure `points` uses circles/ellipses.
- Ensure center markers are paths.
- Set root SVG `width="100%"` and `height="100%"`.

Before calling the map finished:

- Fix abbreviation issues with `ABBREVIATIONS`.
- Fix swapped IDs with `CENTER_OVERRIDES` and `REGION_OVERRIDES`.
- Manually add coasts, canals, non-planar links, and any unsupported rules.
- Convert assets with `go-bindata`.
- Run `env DRAW_MAPS=true go test -v ./...`.
- Add variant tests.
