# Video

Video elements let you bring screen recordings, product demos, stock clips, generated animations, and motion backgrounds into a scene. A video behaves like a visual layer on the canvas, so you can resize, crop, style, animate, and arrange it with text, shapes, charts, and images.

---

## Adding Video

1. Open **Video** from the left sidebar
2. Upload an MP4, WebM, or MOV file
3. Click the asset to place it on the canvas
4. Resize and position it
5. Select it to edit properties in the right sidebar

Uploaded video is scaled to fit the canvas automatically. You can then use exact width/height controls or drag handles on the canvas.

---

## Clip Timing

Video timing has two layers: where the video appears in the scene, and where playback begins inside the source file.

| Control | What it does |
|---|---|
| **Timeline Start** | When the video starts inside the scene |
| **Start Time** | Trim point inside the original source video |
| **Duration** | How long the clip plays in the scene |
| **Playback Speed** | Slow down or speed up the clip |
| **Speed ramp** | Change the speed during the clip (slow-mo start, montage, hero, bullet time…) |
| **Freeze frame** | Hold one frame for a moment, then carry on |
| **Loop** | Repeat a short video for the scene duration |
| **Volume / Muted** | Keep, lower, or remove the original audio |

Use Timeline Start when a clip should appear after narration begins. Use Start Time when the useful part of the source video begins later than the file itself.

---

## Layout and Crop

| Property | Use |
|---|---|
| **Width / Height** | Set exact size or resize on canvas |
| **Lock Ratio** | Preserve the original aspect ratio |
| **Corner Radius** | Round the clip like a card, phone frame, or UI panel |
| **Crop** | Focus on the important part of a recording |
| **Perspective** | Place the video on an angled surface or mockup |

Crop first, then style. This keeps the important content visible while removing browser bars, empty margins, or unwanted background areas.

---

## Styling and Adjustments

Video supports many of the same visual controls as images:

| Feature | Why it helps |
|---|---|
| **Brightness / Contrast / Saturation** | Match the clip to the scene mood |
| **Temperature / Tint / Vibrance** | Create warm, cool, or branded looks |
| **Blur** | Push background video behind text |
| **Border** | Frame a clip as a card or device screen |
| **Gradient Border** | Add a polished highlight frame |
| **Animated Border** | Draw attention to a featured video layer |
| **Box Shadow** | Lift the clip off the background |
| **Inner Shadow** | Add depth inside the frame |
| **Corner Radius** | Make videos feel like modern UI panels |

For screen recordings, a border, small corner radius, and soft shadow often make the clip feel intentionally designed instead of pasted into the scene.

---

## Speed Ramps and Freeze Frames

The **Speed ramp** section of the Video panel changes speed during the clip — the "velocity" edit:

| Preset | What it does |
|---|---|
| **Slow-mo start** | Starts in slow motion, then plays normally |
| **Montage** | Fast, a slow moment, fast again |
| **Hero** | Normal, a dramatic slow-motion middle, normal |
| **Bullet** | Very fast into an almost-frozen moment and out |
| **Flash in** / **Flash out** | Rushes in and settles / plays normally, then rushes out |
| **Jump** | Steps between normal and fast |

Shape the curve by dragging points (0.1× to 10×); double-click adds a point, right-click removes one. The clip keeps the same footage, so its length changes — and a clip that ended with its scene takes the scene with it. The sound follows the speed and keeps its pitch, in the editor and in export.

**Freeze frame**: put the playhead on a moment, click **Freeze at the playhead** and set **Hold**. The picture holds (silently), then the clip continues.

Splitting a ramped clip keeps each part's piece of the curve; jump cuts and transcript edits on a ramped clip cut at the right words.

---

## Remove Background

**Edit BG** (left menu) or the clip's **Remove background** section: **Green screen** removes a colour; **AI cut-out** keeps the subject and removes the rest — no green screen needed — then removes, blurs or colours the background.

The AI cut-out runs on your computer, on the CPU, so it works on low-end machines too. A quick person cut-out works straight away. **Download** the **precise cut-out** once (44 MB) for clean edges on people, cars, products and groups: a photo takes about a second; a video is processed in the background (the panel shows how far it is), smoothed so edges don't flicker, and remembered so it is only done once. Until it is ready, the quick cut-out is shown, and export waits for the precise one.

**Choose what stays**: **Keep**, then click a person or object on the canvas, keeps only what you click; **Remove** takes one out. The first time needs a one-time 45 MB download. On a video, click on any frame — the subject is followed through the clip. **Clear** starts again.

---

## Effects

Select the clip and click **Open Effects** (or use the **Effects** tool). 43 GPU effects in nine groups — Body (AI): neon outline, aura, spotlight and echo trail around the person; Retro & Texture; Glitch; Warp; Light; Energy (phonk, strobe, zoom pulse, shake, flash); Motion; Weather; and Colour looks. Hover to preview on your clip, click to add, stack as many as you like. Each effect has a strength, its own settings and a speed; ♪ effects can hit on the music's beat; and each can run for the whole clip or from/to a time with fades (shown as bars under the clip in the timeline). Everything appears the same in Preview and export.

---

## Animation Ideas

| Goal | Suggested setup |
|---|---|
| Introduce a demo clip | Fade In or Scale In with Ease Out |
| Show a product preview | Subtle shadow, rounded corners, slow Scale In |
| Create a moving background | Loop video, lower opacity, add blur |
| Focus attention | Add animated border or a short pulse loop |
| Show before/after | Use two clips and reveal one with Wipe In |

Keep video animations clean. A clip already contains motion, so extra animation should support the scene rather than distract from it.

---

## Practical Workflow

1. Trim the clip to the useful moment.
2. Crop to the important visual area.
3. Set size, position, and corner radius.
4. Adjust color and brightness so text remains readable.
5. Add border or shadow if the clip needs separation from the background.
6. Add a short enter animation only if it improves the scene rhythm.
