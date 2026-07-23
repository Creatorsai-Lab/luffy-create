# 'Luffy Create' Editor Overview

**Luffy Create** is a **_free_** and **_open source_** AI _video editing, video creation, image editing_ and _graphic designing_ web **app**.

Luffy Create has been built with the principle of providing a lightweight and fast editing experience. **Goal:** Our aim is to make 'Luffy Create' the best editing app for **_animations, transitions, and effects_**.

Luffy Create specially built for technical and educational content — ML diagrams, code walkthroughs, system design animations, and more. Think PowerPoint, but with frame-accurate animation and direct MP4 export.


### Table of Contents

| Guide | What's covered |
|---|---|
| [Elements](./elements.md) | Text, shapes, arrows, code blocks, images, video, audio, charts, tables, icons |
| [Animations](./animations.md) | Enter / loop / exit animations, easing, timing |
| [Adjustments](./adjustments.md) | Image & video filters — brightness, color, blur, crop |
| [Video](./video.md) | Video timing, crop, trim, styling, and canvas workflow |
| [Audio](./audio.md) | Voiceover, music, fades, effects, markers, and timeline workflow |
| [Export](./export.md) | MP4, PNG, WebP — settings, quality, workflow |
| [Shortcuts](./shortcuts.md) | Keyboard reference |
| [AI Agent](./ai_agent.md) | Better prompts, plan review, and safer AI edits |
| [Python Sandbox](./python_sandbox.md) | Matplotlib/Manim asset generation workflow |

---

## Interface Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  logo · project switcher                                window controls │
├──────────────┬──────────────────────────────┬──────────────┬────────────┤
│              │                              │              │ AI Edits   │ 
│  Left        │        Canvas                │  Right       │ Panel      │
│  Sidebar     │   (slide editing area)       │  Sidebar     │            │
│  (Tools)     │                              │  (Properties)│            │
│              │                              │              │            │
├──────────────┴──────────────────────────────┴───────────────────────────┤
│            Timeline: scenes · playhead · playback controls              │            
└─────────────────────────────────────────────────────────────────────────┘
```

### Left Sidebar — Tools
All creation tools live here. Click a tool to select it and open its property panel on the right. Tools include: Text, Shapes, Arrow, Code, Table, Charts, Icons, Images, Video, Audio, Background, Transitions, Layers, Perspective.

### Canvas
The main editing surface. Elements are placed and manipulated here.
- **Click** to select an element
- **Drag** to move
- **Drag corner / edge handles** to resize
- **Rotate handle** (top center) to rotate
- **Double-click** a code block or image/video to open its editor
- **Right-click** for the context menu

### Right Sidebar — Properties
Shows controls for whichever tool or element is active. Changes apply in real time. This is where most polish happens: text styling, gradients, shadows, border controls, crop, perspective, audio fades, video adjustments, and animation timing all live in the property panels.

### AI Edits Panel (Right to Properties Sidebar)
Chat with AI to edit the video

### Timeline
- **Scenes** appear as labeled segments across the bottom
- Click a scene to make it active
- **Playhead** shows current time; drag to scrub
- **Play / Pause** previews the animation in the canvas
- Audio and video clips can be trimmed, moved, split, and aligned to narration or visual beats

---

## Projects

### Creating a project
Click the project name in the header → **New Project**. Projects are saved automatically every few seconds when changes are made (the `•` indicator in the header signals unsaved state).

### Opening a project
Click the project name → select any project from the dropdown list.

### Renaming a project
Click the project name text in the left sidebar → type a new name → press **Enter** or click elsewhere.

### Canvas size
Click the size label in the left sidebar to open the preset picker:

| Preset | Dimensions |
|---|---|
| 16:9 Landscape HD | 1920 × 1080 |
| 9:16 Vertical HD | 1080 × 1920 |
| 1:1 Square HD | 1080 × 1080 |
| 4:5 Portrait HD | 1080 × 1350 |
| 16:9 Landscape 4K | 3840 × 2160 |
| 9:16 Vertical 4K | 2160 × 3840 |

---

## Scenes

A project is a sequence of scenes. Each scene has its own duration, background, and set of elements.

**Add a scene** — click **+** in the timeline.  
**Rename** — double-click a scene tab.  
**Reorder** — drag scenes in the timeline.  
**Set duration** — select the scene, edit the Duration field in its property panel.  
**Transition between scenes** — select a scene and open the **Transitions** tool to choose how it enters.

---

## Quick Start

1. **New project** → pick a canvas size
2. **Add a background** — open Background tool, choose Solid / Gradient / Grid
3. **Add elements** — click Text, Shape, or any tool in the left sidebar
4. **Refine properties** — play with font, color, crop, border, shadow, opacity, and position controls
5. **Animate** — select an element, open its Animation section, click **Add**
6. **Add media timing** — place audio/video clips on the timeline and line them up with scene duration
7. **Preview** — click **Preview** in the sidebar or press the Play button in the timeline
8. **Export** — click **Export** → choose MP4 or image format → Save
