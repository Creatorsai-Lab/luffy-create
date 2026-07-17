# Elements

Every object placed on the canvas is an element. Select one to edit its properties in the right sidebar.

**Common controls on every element:**
- **Opacity** — 0–100%
- **Rotation** — degrees
- **Lock** — prevents accidental edits
- **Visibility** — hide without deleting (Layers panel)
- **Name** — shown in the Layers panel

---

## Text

Click **Text** in the left sidebar, then click anywhere on the canvas to place a text block.

| Property | Range | Notes |
|---|---|---|
| Font Family | 30+ fonts | Inter, Roboto, Poppins, Montserrat, Bebas Neue, and more |
| Font Size | 8–400 px | |
| Font Weight | Thin / Normal / Semibold / Bold | Thin is useful for light Inter headings and minimal UI-style typography |
| Italic / Underline | toggle | |
| Color | hex picker | |
| Alignment | Left / Center / Right | |
| Line Height | numeric | |
| Letter Spacing | numeric | |
| Stretch X / Y | numeric | non-uniform scaling |
| Shadow | color, blur, offset X/Y | |
| Text Stroke | color, width | |

### Text Effects
Six visual effects, each toggled independently:

| Effect | Description |
|---|---|
| Shadow | Deep drop shadow |
| Glow | Soft glow around glyphs |
| Outline | Crisp stroke outline |
| Hollow | Transparent fill, outline only |
| Glitch | Chromatic displacement |
| Bubble | Inflated bubble text |

Multiple effects can be active at the same time.

---

## Shapes

Click **Shapes**, choose a shape from the picker, then click-drag on the canvas to place it.

**Available shapes:** Rectangle, Circle, Triangle, Star (5-point), Pentagon, Hexagon, Octagon, Diamond, Oval, Speech Bubble, Rounded Speech Bubble, 3D Cone, 3D Cube, plus sketchy hand-drawn variants (Rect-Hand, Circle-Hand, Square-Hand).

| Property | Notes |
|---|---|
| Fill Color | hex picker; "No Fill" for transparent |
| Stroke Color | border color |
| Stroke Width | 0–20 px |
| Corner Radius | rectangle only (0–100 px) |
| Depth | 3D shapes only (10–300 px extrusion) |
| Face Color | 3D shapes — override side/top face color |

### Flow Animation on Shapes
Add a **Flow** loop animation to any shape to get a marching-dashes border effect. If the shape has no stroke, a 3 px grey default stroke is used automatically. Changing stroke color or width in the properties panel updates the flow border in real time.

---

## Arrows & Lines

Click **Arrow**, then click-drag on the canvas to draw a line. Drag either endpoint handle to reposition.

| Property | Notes |
|---|---|
| Arrowhead | None / End (→) / Start (←) / Both (↔) |
| Arrowhead Length | 4–60 px |
| Arrowhead Width | 4–60 px |
| Line Color | |
| Arrowhead Color | can differ from line |
| Line Width | 1–20 px |
| Style | Solid / Dashed / Dotted |
| Curve | adds arc to the line |
| Current Angle | read-only display |

---

## Code Blocks

Click **Code** in the sidebar — the editor modal opens immediately.

- Write or paste code into the Monaco editor (full syntax highlighting)
- Choose language from the dropdown (15 languages supported)
- Click **Save** to place the block on the canvas
- **Double-click** a code block on the canvas to reopen the editor

**Supported languages:** JavaScript, TypeScript, Python, Rust, Go, Java, C++, C, Bash, SQL, JSON, YAML, HTML, CSS, Markdown

**In the right sidebar (after placing):**

| Property | |
|---|---|
| Font Size | 8–32 px |
| Background Color | code block background |
| Show Line Numbers | toggle |

---

## Images

Click **Images** → **Upload** to select a file. Supported formats: PNG, JPG, JPEG, WebP, GIF, SVG.

| Property | |
|---|---|
| Width / Height | px, with optional aspect-ratio lock |
| Lock Ratio | keeps proportions when resizing from the panel |
| Corner Radius | 0–200 px (rounded corners) |
| Crop | see [Crop](#crop) below |
| Border / Gradient Border | frame an image as a polished card |
| Animated Border | moving border highlight around the image |
| Box Shadow / Inner Shadow | add depth or inset styling |
| Perspective | warp an image onto an angled surface |

For brightness, contrast, color, and blur adjustments see the [Adjustments](./adjustments.md) guide.

Images are often the main visual anchor of a scene. After placing one, try corner radius, shadow, crop, and a subtle border before animating it. A screenshot with a small radius and soft shadow usually reads more professionally than a raw rectangular image.

### Crop
Click **Edit Crop** in the panel, or **double-click** the image on the canvas.

- **Drag the center** to pan the crop window
- **Drag any of the 8 edge/corner handles** to resize the crop region
- **✓ (Enter)** to apply — the element resizes to match the cropped area
- **✗ (Escape)** to cancel without changes
- **Reset** removes the crop entirely

---

## Video

Click **Video** → **Upload** to select an MP4, WebM, or MOV file. The file is scaled to fit the canvas automatically.

| Property | |
|---|---|
| Width / Height | with optional aspect-ratio lock |
| Lock Ratio | toggle |
| Corner Radius | 0–200 px |
| Crop | same visual crop tool as images |
| Volume | 0–100% |
| Playback Speed | 0.25× · 0.5× · 0.75× · 1× · 1.25× · 1.5× · 2× |
| Loop | loops video when playback reaches the end |
| Muted | suppresses audio |
| Timeline Start | position the clip inside the scene |
| Start Time | trim into the source video |
| Duration | control how long the clip plays |
| Border / Shadow | style the video like a card or device frame |

Video elements support the full set of image adjustments (brightness, contrast, color, crop, blur, etc.) — see [Adjustments](./adjustments.md).

A **Play / Pause** button appears over the video on the canvas. Use it to preview playback without starting the full scene preview.

For a full walkthrough, see the dedicated [Video](./video.md) guide.

---

## Audio

Click **Audio** → **Upload** to add a sound file. Supported formats: MP3, WAV, OGG, AAC, M4A.

| Property | |
|---|---|
| Volume | 0–100% |
| Playback Speed | 0.25×–4× |
| Start Time | trim start (seconds into the source file) |
| Duration | trim length |
| Fade In | 0–5 s |
| Fade Out | 0–5 s |
| Fade Volume | target volume multiplier for fade control |
| Loop | loop to fill scene duration |
| Track | Background or Voiceover |
| Markers | timing marks for narration, beats, and edit cues |

Click the **▶ Play** button in the asset list to preview a clip before placing it.
Drag an audio item from the asset list directly onto the timeline audio area under the scene where it should start. The clip is created in that scene at the exact drop time, which avoids adding it to the first scene and dragging it across the timeline.

Audio is edited from the timeline and properties panel. Balance voiceover first, then add music and sound effects around it. For a full workflow, see the dedicated [Audio](./audio.md) guide.

---

## Charts

Click **Charts**, choose a chart type, then click the canvas to place it.

**Chart types:** Bar, Line, Area, Pie, Doughnut (Ring)

| Property | |
|---|---|
| Labels | add / remove / rename data labels |
| Datasets | add / remove series; each has a label, color, and data array |
| Background Color | chart area fill |
| Label Color | axis and legend text color |
| Font Size | 6–40 px |
| Font Family | 30+ fonts |
| Corner Radius | rounded chart background |
| Show Legend | toggle |
| Show Grid | toggle |
| Bar Width | 0.3–1.0 (fraction of slot width) |
| Bar Spacing | 0.0–0.5 (gap between groups) |
| Line Weight | stroke width for line/area charts |

**Built-in chart animations** (add via the Loop section):
- Bar → *Bars Rise* — bars grow up from the baseline
- Line → *Line Draw* — line traces point-to-point
- Area → *Area Flow* — fill sweeps left to right
- Pie / Doughnut → *Pie Spin* — slices open sequentially

---

## Tables

Click **Table** to insert a default grid.

| Property | |
|---|---|
| Rows / Columns | 1–20 each |
| Cell Width | 40–400 px |
| Cell Height | 24–200 px |
| Header Background | |
| Cell Background | |
| Border Color / Width | |
| Text Color | |
| Font Size | 8–32 px |
| Show Header | toggle top row styling |

Click any cell on the canvas to edit its text.

---

## Icons

Click **Icons** to open the searchable Lucide icon library.

- **Search** by name (e.g. "arrow", "database", "cpu")
- Click any icon to place it on the canvas

| Property | |
|---|---|
| Color | hex picker |
| Size | 8–1000 px, keeps the icon square and resizes from its center |
| Stroke Width | 0.5–4 (step 0.5) |
| Canvas Handles | resize directly on the scene when preferred |

---

## Layers Panel

Open **Layers** from the sidebar to see a stacked list of every element in the scene.

- **Click** a row to select that element
- **Eye icon** — toggle visibility
- **Lock icon** — toggle edit lock
- **↑ / ↓ arrows** — change stacking order (z-index)
- **Trash icon** — delete element
- **Element name** — click to rename inline
