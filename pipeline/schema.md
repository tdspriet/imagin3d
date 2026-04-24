# Moodboard Dataset Schema

Each moodboard lives in its own subdirectory under `pipeline/datasets/<name>/` as a `moodboard.json` file. Image, video, and 3D-model assets are referenced by **relative file path** from the moodboard directory (no base64 encoding required — the pipeline reads them at runtime).

## Top-level fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Unique identifier, matches the directory name |
| `prompt` | string | The Imagin3D generation prompt (natural language description of the desired object) |
| `multiview` | bool | If `true`, Imagin3D generates front + back master images (better geometry, slower) |
| `adapt_subject` | `null` \| object | Optional. If set, switches Imagin3D to adaptation mode. See below. |
| `elements` | array | Moodboard elements. See below. |
| `clusters` | array | Logical groups of element IDs. See below. |

## `adapt_subject` (optional)

```json
{
  "type": "image",
  "path": "assets/base_object.jpg",
  "text": "a plain wooden chair"
}
```

- `type` — `"image"` or `"model"` 
- `path` — relative path from the moodboard directory
- `text` — optional textual description of the base subject

## Element types

All elements share:

| Field | Type | Description |
|---|---|---|
| `id` | int | Unique within this moodboard (1-indexed) |
| `type` | string | One of `image`, `video`, `model`, `text`, `palette` |
| `position` | `{x, y}` | Canvas position in pixels |
| `size` | `{x, y}` | Scale multiplier relative to the default size for this type (1.0 = default). Larger = more visually dominant = higher intent-router weight. |

Additional per-type fields:

### `image`
```json
{"id": 1, "type": "image", "path": "assets/ref.jpg", "position": {"x": 100, "y": 200}, "size": {"x": 1.4, "y": 1.4}}
```

### `video`
```json
{"id": 2, "type": "video", "path": "assets/ref.mp4", "position": {"x": 400, "y": 200}, "size": {"x": 1.0, "y": 1.0}}
```

### `model` (3D GLB)
```json
{"id": 3, "type": "model", "path": "assets/ref.glb", "fileName": "ref.glb", "position": {"x": 200, "y": 400}, "size": {"x": 1.0, "y": 1.0}}
```
`fileName` defaults to the basename of `path` if omitted.

### `text`
```json
{"id": 4, "type": "text", "text": "organic, flowing, ceramic", "position": {"x": 300, "y": 500}, "size": {"x": 0.8, "y": 0.8}}
```

### `palette`
```json
{"id": 5, "type": "palette", "colors": ["#F8F4EE", "#E6C9C4", "#BDA49F"], "position": {"x": 600, "y": 350}, "size": {"x": 1.0, "y": 1.0}}
```

## Clusters

Groups of element IDs that belong to a shared theme:

```json
{"id": 1, "title": "Surface motifs", "elements": [1, 3, 5]}
```

Elements not in any cluster are placed into an implicit default cluster by the pipeline.

## Example

See `pipeline/datasets/example_chair/moodboard.json` for a minimal working example.
