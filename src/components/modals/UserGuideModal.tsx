import { useState } from 'react'
import { X, BookOpen, LayoutGrid, Sparkles, Image as ImageIcon, Shuffle, Keyboard, Download, Clapperboard, BrainCircuit, Terminal, Volume2, Video, Rocket, Wand2, Film, Captions } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'

interface Section {
  id: string
  title: string
  icon: React.ReactNode
  content: React.ReactNode
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-editor-text mt-5 mb-2 first:mt-0">{children}</h3>
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-base text-[#c9c4dd] leading-relaxed mb-3">{children}</p>
}
function LI({ children }: { children: React.ReactNode }) {
  return <li className="text-base text-[#c9c4dd] leading-relaxed mb-1.5">{children}</li>
}
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="px-1.5 py-0.5 text-[11px] rounded bg-editor-elevated-highlight border border-editor-border text-editor-text font-mono">{children}</kbd>
}
function DocLink({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <button
      onClick={() => window.api.shell.openPath(path)}
      className="text-editor-accent hover:text-white underline underline-offset-2"
    >
      {children}
    </button>
  )
}
function Table({ rows, head }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <table className="w-full text-base mb-4 border border-editor-border rounded overflow-hidden">
      <thead><tr className="bg-editor-elevated-highlight">
        <th className="text-left px-3 py-1.5 text-editor-text font-medium">{head[0]}</th>
        <th className="text-left px-3 py-1.5 text-editor-text font-medium">{head[1]}</th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-editor-border">
            <td className="px-3 py-1.5 text-editor-text">{r[0]}</td>
            <td className="px-3 py-1.5 text-[#c9c4dd]">{r[1]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const SECTIONS: Section[] = [
  {
    id: 'overview', title: 'Overview', icon: <BookOpen size={15} />,
    content: (
      <>
        <H>Welcome to Luffy Create</H>
        <P>Luffy Create is a scene-based animated video editor for technical, educational and creator content. A project is a sequence of <strong>scenes</strong>; each scene has its own background, elements, duration, and the transition that leads into it. Audio lives on the project timeline, independent of scenes.</P>
        <H>The interface</H>
        <ul className="list-disc pl-5">
          <LI><strong>Left sidebar (Menu):</strong> project name, canvas size, undo/redo, Preview/Export, and every tool. <strong>Free Cursor</strong> is always first; all other tools are listed alphabetically.</LI>
          <LI><strong>Canvas (center):</strong> the editing surface. Click to select, drag to move, drag handles to resize, drag the round rotate icon above a selection to rotate, double-click code to edit it or an image/video to crop it.</LI>
          <LI><strong>Canvas toolbar (top-right):</strong> toggle the grid, toggle the safe area, and clear every animation on the current scene.</LI>
          <LI><strong>Right sidebar (Options):</strong> properties for the active tool or the selected element.</LI>
          <LI><strong>Timeline (bottom):</strong> video clips, scenes, transitions, audio clips and the playhead. Drag its top edge to make it taller.</LI>
          <LI><strong>AI Agents (far right):</strong> turn natural-language requests into validated editor commands.</LI>
        </ul>
        <H>Quick start</H>
        <ul className="list-disc pl-5">
          <LI>Pick a canvas size and set a background.</LI>
          <LI>Click Text, Arrow or Table in the menu — the element appears on the scene immediately with its properties open. Use the other tools to add shapes, code, images, video and more.</LI>
          <LI>Select an element and add enter / loop / exit animations, motion or media effects.</LI>
          <LI>Add scenes, set transitions, place audio, then Preview and Export to MP4 or an image.</LI>
        </ul>
        <H>How to think while editing</H>
        <P>Build each scene in layers: background first, then media, then shapes and charts, then text and icons. After the layout feels right, refine every selected item in the right Options panel — size, color, opacity, shadows, borders, crop, perspective, timing and animation all live there.</P>
        <P>The timeline is not just for playback. It is where you control scene duration, clip placement, audio timing, transitions and the order of the story. Preview often, make small adjustments, then export when the rhythm feels clean.</P>
      </>
    ),
  },
  {
    id: 'whats-new', title: "What's New in 1.4", icon: <Rocket size={15} />,
    content: (
      <>
        <ul className="list-disc pl-5">
          <LI><strong>Real Morph transition</strong> — objects that exist in both scenes glide, resize and change color into their new place. See Transitions.</LI>
          <LI><strong>Effects</strong> for images and video — 43 stackable GPU effects (neon outline on a person, VHS, glitch, warp, light leaks, phonk on the beat, colour looks…), timed on the clip, plus <strong>speed ramps</strong> and <strong>freeze frames</strong>. See Effects and Video.</LI>
          <LI><strong>Flash Blur and Flicker Shake</strong> transitions with direction, speed and hardness.</LI>
          <LI><strong>Bilingual, offline captions</strong> — Hindi transcription, optional offline English↔Hindi translation and bilingual SRT export. See Captions.</LI>
          <LI><strong>Perspective on every element</strong> except arrows, with true perspective and no seam lines.</LI>
          <LI><strong>One-click inserts</strong> for Text, Arrow and Table, plus a <strong>Draw Arrow</strong> mode.</LI>
          <LI><strong>New animations:</strong> Outline Reveal and Bounce Words for text, Color Pulse, and character / line / block typing for code.</LI>
          <LI><strong>Audio stays put</strong> when you split, resize, reorder, duplicate or delete scenes, and the waveform now shows true peaks.</LI>
          <LI><strong>Smooth cuts</strong> on split or trimmed video in the editor, Preview and export.</LI>
          <LI>Layer ordering shortcuts and right-click commands, a redesigned rotate handle, and alphabetical menu tools.</LI>
        </ul>
      </>
    ),
  },
  {
    id: 'tools', title: 'Tools & Elements', icon: <LayoutGrid size={15} />,
    content: (
      <>
        <H>Tools</H>
        <Table head={['Tool', 'What it does']} rows={[
          ['Free Cursor', 'Back to plain selection: clears the active tool, deselects and closes the Options panel.'],
          ['Add-ons', 'Ready-made smart pieces — Title card, Lower third, Hook / CTA, Neural network, Flowchart, Equation reveal, Code walkthrough. Add one, then change its settings; it rebuilds in place and fits 16:9 or 9:16. In the AI Agent, name one with a slash command such as /neural-network.'],
          ['Arrow', 'Click to add an arrow in the scene center. In its panel, “+ Add Arrow” adds another; “Draw Arrow” lets you drag one on the canvas (crosshair cursor, Esc cancels). Heads (triangle, open, dot, ring, diamond, square or bar, at either or both ends), dashes, curve, bends, colors. Under Connections, attach either end to an item so the arrow follows it.'],
          ['Audio', 'Upload music, voiceover and sound effects; add them to the timeline or drag them onto the audio track.'],
          ['Background', 'Solid, gradient, grid, dots, animated, transparent or image background for the current scene.'],
          ['Charts', 'Bar, line, area, points, pie and doughnut charts with editable data, axes and styling.'],
          ['Code', 'Monaco code editor with syntax highlighting, line numbers and typing animations.'],
          ['Counter', 'Animated counter that counts as numbers, English words or Hindi words, with range, speed, loop and text styling.'],
          ['Edit BG', 'Remove, blur or replace the background of a video or image in one click (AI cut-out on this computer), or remove a green screen. Applies to every part of a clip that was cut into parts.'],
          ['Effects', 'Stackable effects for the selected image or video: body (AI), retro, glitch, warp, light, energy, motion, weather and colour looks — timed, and on the beat.'],
          ['Hand Draw', 'Freehand drawing with Pen, Paint, Spray and Eraser.'],
          ['Icons', 'Searchable icon library; color and stroke width.'],
          ['Images', 'Upload PNG/JPG/WebP/GIF; crop, adjustments, borders, shadows, perspective, effects.'],
          ['LaTeX', 'Equations rendered as crisp graphics; color, size, animations.'],
          ['Layers', 'All elements of the scene: show/hide, lock, bring forward/back, delete, Shift+drag to reorder.'],
          ['Motion', 'Move an element along a direction or to coordinates, or Zoom In / Zoom Out toward a corner or the center.'],
          ['Group Effects', 'For several selected items: Animate them one after another (stagger, waves, repeat) or Connect them with arrows that stay attached (chain, column to column, hub).'],
          ['Perspective', 'Tilt, skew and corner-warp any visual element except arrows — or a whole group or add-on as one plane.'],
          ['Python Sandbox', 'Generate charts and math animations with Python (Matplotlib, Manim).'],
          ['Shapes', 'Rectangle, circle, oval, polygons, star, diamond, heart, speech bubbles, 3D cube/cone, hand-drawn and sketch boxes.'],
          ['Subtitle', 'Automatic captions, caption styles and translation.'],
          ['Table', 'Click to add a table in the scene center; edit rows, columns, cells, colors, borders, header.'],
          ['Text', 'Click to add a text box in the scene center; “+ Add Text” in its panel adds more. Fonts, gradient fill, stroke, shadow, background box, Glow and Hollow effects.'],
          ['Transitions', 'Choose how the current scene enters from the previous one.'],
          ['User Guide', 'This guide — available even before a project is open.'],
          ['Video', 'Upload MP4/WebM/MOV; trim, speed ramps, freeze frames, volume, loop, crop, effects.'],
        ]} />
        <H>Editing an element</H>
        <P>Select it, then use the right Options panel. Nudge with the arrow keys: <Kbd>Arrow</Kbd> moves 12 px, <Kbd>Shift</Kbd> 40 px, <Kbd>Alt</Kbd> 100 px; a group moves as one, <Kbd>Ctrl</Kbd>+arrow moves only the item you clicked. Rotate with the round rotate icon above the selection; it snaps to 45° angles when you get close.</P>
        <P>Right-click an element for Copy, Duplicate, Bring Forward, Send Backward, Bring to Front, Send to Back, Center Horizontally, Center Vertically and Delete. Images also offer Set Background (Cover / Fill).</P>
        <P>Pasting into the same scene offsets the copy by 20 px. Pasting into a different scene keeps the exact position and links the copy to the original, so a Morph transition between those scenes moves it.</P>
        <H>Perspective</H>
        <P>Open Perspective with an element selected. Use X-Axis Tilt, Y-Axis Tilt, Skew X, Skew Y and Depth for quick results, or drag the orange corner handles and red edge handles on the canvas for full control. Corner fields set exact positions in the element's own pixels. Reset removes the warp. Perspective is true perspective: straight lines stay straight, text keeps all its styling, and the click area follows the warped shape.</P>
        <P>Select a <strong>whole group or add-on</strong> (click one of its parts) and the same sliders and handles tilt it as <strong>one plane</strong> — a neural network or a flowchart leans back like a single panel, and its animations keep playing on the tilted plane. Drag the tilted picture to move the group; arrow keys move it too. The tilt follows the group when it is rebuilt with new settings or copied. Reset makes it flat again.</P>
        <H>Property panels are the power layer</H>
        <P>Every element has its own controls. Text can use fonts, gradient fills, text backgrounds, shadows, outlines, effects and several animations. Shapes can use solid or gradient fills, borders, shadows, inner shadows, perspective and animated borders. Images and videos can be cropped, rounded, color-adjusted, bordered, shadowed, warped and given media effects. Small property changes often make the difference between a rough slide and a polished frame.</P>
        <P>When a scene feels crowded, use the Layers panel to hide experiments, lock finished objects and reorder what appears above or below.</P>
      </>
    ),
  },
  {
    id: 'animations', title: 'Animations', icon: <Sparkles size={15} />,
    content: (
      <>
        <P>Every element has three animation slots. Add as many as you like per slot and set type, duration, delay (when it starts), easing and, where relevant, direction and distance. Click a slider's value to type an exact number.</P>
        <H>1 · On Enter</H>
        <P>Plays once when the element appears: Fade In, Slide In, Scale In, Wipe In. Text adds Typewriter (chars / words), Bounce Words and Outline Reveal In. Shapes add Spin In. Arrows use Draw On, Direction Slide and Zoom In. Code adds Character typing, Line typing and Block reveal.</P>
        <H>2 · Loop</H>
        <P>Repeats while the element is visible, after its enter animations finish: Pulse, Bounce, Rotate, Fade Loop, Color Pulse (a colour flash — text, shapes and arrows). Shapes and arrows add Flow (marching dashes). Set <strong>Repeat every</strong> to play a loop once every few seconds instead of non-stop (for example a 0.4 s pulse every 3 s).</P>
        <H>3 · On Exit</H>
        <P>Plays once as the element leaves: Fade Out, Slide Out, Scale Out, Wipe Out. Text adds Outline Reveal Out; arrows use Draw Off and Zoom Out.</P>
        <H>Motion</H>
        <P>The Motion tool adds movement that is not an entrance or exit: <strong>Move</strong> slides an element by direction or to exact center coordinates (it can travel outside the scene), and <strong>Zoom In / Zoom Out</strong> scale toward the center or a corner.</P>
        <H>Stagger (many items, one after another)</H>
        <P>Shift-click several items and open <strong>Group Effects</strong>. It applies one animation to all of them, each a step later than the last: choose the order (left → right, top → bottom, …), the step, and <strong>Rows / columns together</strong> to animate a whole column at once — like one layer of a neural network. Loop animations can <strong>repeat the wave</strong>. <strong>After last</strong> starts the new wave when the scene's other animations end, so you can chain waves (a forward pass, then a backward pass).</P>
        <H>Groups and locking</H>
        <P>Select several items and press <Kbd>Ctrl+G</Kbd> (or right-click → Group). Clicking any member then selects the whole group, so it moves (drag or arrow keys), resizes and copies as one; <Kbd>Ctrl</Kbd>+click or <Kbd>Ctrl</Kbd>+drag picks a single member, and the Layers panel always selects single items (members show a coloured group tag). Right-click → Ungroup (<Kbd>Ctrl+Shift+G</Kbd>), Select whole group, or Lock — locking one member locks the group. A locked item can't be moved, resized or deleted; clicking it shows a lock badge, and right-click still works (Unlock, copy, layer order). Copies of a group become a new group, with connectors wired to the copies.</P>
        <P>Some groups are <strong>smart groups</strong> (✦), built by an add-on from the <strong>Add-ons</strong> menu: they remember their settings and rebuild in place when a setting changes, keeping where you moved them.</P>
        <H>Add-ons</H>
        <P>Open <strong>Add-ons</strong> and click <strong>Add</strong> on a <strong>Title card</strong> (chapter or section break), <strong>Lower third</strong> (name and role of the speaker) or <strong>Hook / CTA</strong> (bold text that pops in word by word, with highlighted words). Selecting a placed add-on shows its settings — text, style, colours, font, size and timing; every change rebuilds it in place and it always fits the frame, landscape or vertical. Move it anywhere: the rebuild keeps your position. <strong>Detach</strong> turns it into ordinary items you can edit one by one.</P>
        <P>For explainers: <strong>Neural network</strong> — type the neurons per layer ("3, 4, 4, 2"), any number of layers; big layers are drawn compactly with "⋮" and their size in the label; choose full or sparse connections and a forward or forward-and-backward pass that pulses through the layers. <strong>Flowchart / pipeline</strong> — type the steps ("Collect → Clean → Train"); a step ending in "?" becomes a decision; extra links such as "4&gt;2 retry" add branches and loops (drawn as arcs); steps reveal one by one and can carry a pulse. <strong>Equation reveal</strong> — one LaTeX step per line, stacked as a derivation or replacing the last, with the newest step marked. <strong>Code walkthrough</strong> — paste code, then list steps as "1-3: Load the data"; the lines are highlighted in turn with the note beside (16:9) or below (9:16) the code, optionally after the code types itself in.</P>
        <H>Connectors</H>
        <P>In <strong>Group Effects → Connect</strong>, link the selected items with arrows whose ends stay attached: <strong>Chain</strong> (each to the next, in the order you selected them), <strong>Columns</strong> (every item to every item in the next column — a network layer in one click) or <strong>Hub</strong> (the first to all others). <strong>Select all similar</strong> picks, say, every circle on the scene at once. Attached arrows follow their items when you move or resize them; dragging an arrow itself releases it. A single arrow's ends can be attached or released in its own panel.</P>
        <H>Easing</H>
        <P>Linear, Ease In, Ease Out, Ease In-Out and Bounce control the acceleration of the motion.</P>
        <H>Combining animations</H>
        <P>Use On Enter for how an element arrives, Loop for what it does while visible, and On Exit for how it leaves. Fade In plus a gentle Pulse works well for emphasis; Outline Reveal suits titles; code typing suits walkthroughs. Keep durations short for UI-like motion and longer for educational reveals.</P>
        <P>Tip: clear every animation on the current scene with the eraser button on the canvas toolbar.</P>
      </>
    ),
  },
  {
    id: 'effects', title: 'Effects', icon: <Wand2 size={15} />,
    content: (
      <>
        <P>Select an image or video and open <strong>Effects</strong> (or <strong>Open Effects</strong> in its panel). Pick a group, <strong>hover</strong> an effect to watch it on your own clip in the preview box, and click to add it. Effects stack — they play top to bottom, and the same effect can be added twice. They run on the GPU, in the editor, Preview and export alike.</P>
        <Table head={['Group', 'Effects']} rows={[
          ['Body (AI)', 'Neon outline, Aura glow, Spotlight, Echo trail — they find the person in the picture (on this computer, the same AI as background removal) and draw around or behind them.'],
          ['Retro & Texture', 'VHS, 8mm film, Old film, Dust & scratches, Paper texture, Halftone comic, Film grain.'],
          ['Glitch', 'Digital glitch, RGB split, CRT screen, Signal loss.'],
          ['Warp', 'Wave, Swirl, Bulge, Ripple, Kaleidoscope, Heat haze.'],
          ['Light', 'Glow, Halation, Light leaks, Light sweep, God rays, Lens flare, Defocus, Vignette.'],
          ['Energy', 'Phonk, Strobe, Zoom pulse, Handheld shake, Flash, Light flicker — punchy effects for edits to music.'],
          ['Motion', 'Float, Wiggle, Drift, Ken Burns in / out — move the picture or the whole item.'],
          ['Weather', 'Rain, Snow.'],
          ['Colour look', 'One grade per clip: Cinematic, Teal & orange, Warm, Cool, Vintage, Faded film, Bleach bypass, Vivid, Cyberpunk, Sunset, Monochrome, Noir.'],
        ]} />
        <P>Open a card under <strong>On this clip</strong> to set its <strong>Strength</strong>, its own settings (colour, size, direction…) and <strong>Speed</strong>. The eye hides an effect without removing it; × removes it. <strong>Surprise me</strong> swaps the clip's effects for a random colour look plus two effects from different groups — click again for another.</P>
        <H>On the beat</H>
        <P>Effects marked ♪ can <strong>Sync to the music's beat</strong>: the flash, punch, glitch or glow hits on every beat of the project's background music (found automatically; 120 BPM when there is no music). Phonk is always on the beat.</P>
        <H>Timing</H>
        <P>An effect runs for <strong>the whole clip</strong>, or untick it and set <strong>From</strong> / <strong>To</strong> (seconds into the clip) with optional <strong>Fade in</strong> / <strong>Fade out</strong>. Timed effects show as coloured bars under the clip in the timeline — drag a bar to move it, drag an end to resize it. Splitting a clip keeps each effect where it was in the footage.</P>
        <H>Clips cut into parts</H>
        <P>When a clip was cut into parts (by jump cuts or splits), <strong>All parts of this clip</strong> applies effects to every part at once; untick it to change just this part.</P>
        <H>Speed ramps and freeze frames</H>
        <P>Speed ramps live in the Video panel — see Video → Speed ramp.</P>
      </>
    ),
  },
  {
    id: 'backgrounds', title: 'Backgrounds', icon: <ImageIcon size={15} />,
    content: (
      <>
        <P>Set per scene from the Background tool.</P>
        <Table head={['Type', 'Controls']} rows={[
          ['Solid', 'Single color.'],
          ['Gradient', 'Linear / radial / conic, from–middle–to colors, angle, start and end stops.'],
          ['Grid', 'Background and line color, cell size.'],
          ['Dots', 'Background and dot color, spacing, radius.'],
          ['Animated', 'Gradient Flow, Gradient Shift, Three Color Drift, Grainy Sand Gradient, Conic Rotate, Aurora, Wave — colors and speed.'],
          ['Transparent', 'Checkerboard in the editor; real transparency in PNG/WebP export (MP4 has no alpha).'],
          ['Image', 'Right-click an image → Set Background (Cover / Fill), then adjust fit, opacity, blur, glass and color.'],
        ]} />
        <H>Design tips</H>
        <P>Use quiet backgrounds when the scene contains important text, code, charts or screenshots. Strong gradients and animated backgrounds work best behind short titles or simple hero scenes. If the foreground is busy, lower the background contrast or add blur.</P>
      </>
    ),
  },
  {
    id: 'transitions', title: 'Transitions', icon: <Shuffle size={15} />,
    content: (
      <>
        <P>A transition plays over the <strong>start</strong> of a scene, leading in from the scene before. On the <strong>first scene</strong> it is an intro from black, and the last scene has an <strong>Ending</strong> section to fade the video out to black. Open the Transitions tool (or click the coloured bar over a scene in the timeline). Hover a transition to see it in the preview box; pick it to use it. Length is 0.1–3 seconds.</P>
        <Table head={['Group', 'Transitions']} rows={[
          ['Basic', 'Dissolve, Dip to black, Dip to white, Push, Slide, Wipe, Zoom in, Zoom out, Iris.'],
          ['Cinematic', 'Whip pan, Zoom blur, Spin, Blur dissolve, Light leak, Film burn, Luma fade, Flash.'],
          ['Energy', 'Glitch, Pixelate, Stretch, Slices, Flash Blur, Flicker Shake.'],
          ['3D', 'Cube.'],
          ['Smart', 'Morph — matching objects move, resize and recolour into their new place.'],
        ]} />
        <P>Each transition shows only the settings it has: <strong>New scene comes in</strong> (from the left, right, top or bottom), <strong>Strength</strong> (blur, zoom, glitch, light), <strong>Edge softness</strong> (wipe, iris, luma fade), <strong>Colour</strong> (dips and flash) and <strong>Motion</strong> — Smooth eases in and out, Snappy rushes through the middle (good for whips and glitches), Linear is even. <strong>Play here</strong> plays the transition on the canvas; <strong>Apply to all cuts</strong> uses it between every pair of scenes.</P>
        <P>During a transition the outgoing scene keeps playing — a video carries on into the footage after its trim point (or holds its last frame) — and its sound fades out as the new scene's fades in. Transitions look the same on the canvas (also while paused or scrubbing), in Preview and in the exported video; captions stay on top, untouched.</P>
        <H>Using Morph</H>
        <P>Morph works like PowerPoint Morph. Duplicate a scene (or copy elements into the next scene), then move, resize or recolor things in the copy and give the copy a Morph transition. Objects are matched across the two scenes — copies are linked automatically, and otherwise elements of the same type with the same content (same text, image or shape type) are paired. Unmatched objects fade out or in. If matched text changes its wording, the old and new text cross-fade while the box moves.</P>
        <P>Morph plays in timeline playback, Preview and export. While paused, the editor shows the real scene so it stays editable.</P>
        <H>When to use transitions</H>
        <P>Use transitions to separate ideas, not to decorate every cut. Dissolve and dips suit calm narration, Push and Slide suit step-by-step movement, Wipe and Luma fade reveal before/after comparisons, Morph explains change, Whip pan, Zoom blur and Glitch give energetic social-style cuts, and Light leak or Film burn add a filmic mood. Each transition has a fixed colour on its timeline bar.</P>
      </>
    ),
  },
  {
    id: 'timeline', title: 'Timeline & Scenes', icon: <Film size={15} />,
    content: (
      <>
        <H>Scenes</H>
        <ul className="list-disc pl-5">
          <LI><strong>+ Scene</strong> adds a scene at the end. Click a scene block to make it active.</LI>
          <LI>Drag a scene's left or right edge to change its duration. <Kbd>Shift</Kbd> + drag a scene to reorder it.</LI>
          <LI>Right-click a scene: Edit Transition, Split at the clicked time, Add scene after, Duplicate, Delete.</LI>
          <LI><strong>Split</strong> cuts the scene in two: video clips are split at that point and the second half continues smoothly as a hard cut. Audio is not cut.</LI>
          <LI><strong>Duplicate</strong> copies the scene's visual elements (not its audio) and links them for Morph.</LI>
        </ul>
        <H>Audio is independent of scenes</H>
        <P>Audio clips keep their place on the project timeline when you split, resize, reorder, duplicate or delete scenes. To cut audio, use the clip's own Split.</P>
        <H>Audio clips</H>
        <ul className="list-disc pl-5">
          <LI>Drag a clip to move it, or drag its edges to trim. Drag an audio file from the Audio panel onto the audio track to place it at that time.</LI>
          <LI>Right-click a clip: Duplicate, Trim after, Trim before, Split here, Add mark, Delete. Click a green marker dot to remove it.</LI>
          <LI><Kbd>Shift</Kbd> + click a clip to move it to another lane.</LI>
          <LI>The waveform shows true peaks: a flat line is real silence, and any bump is sound.</LI>
        </ul>
        <H>Video clips</H>
        <ul className="list-disc pl-5">
          <LI>Video clips sit on the track above the scenes. Drag to move within the scene, drag edges to trim.</LI>
          <LI>Right-click: Duplicate, Trim after, Trim before, Split here, Delete. With a clip selected, the timeline bar shows volume, speed, Trim (cut at the playhead) and Split at the playhead.</LI>
        </ul>
        <H>Navigating</H>
        <P>Click or drag on the ruler to move the playhead; right-click empty timeline space → Set playhead. Positions snap to 0.1 s. Zoom with the zoom buttons or <Kbd>Ctrl</Kbd> + <Kbd>+</Kbd> / <Kbd>−</Kbd>.</P>
      </>
    ),
  },
  {
    id: 'audio', title: 'Audio', icon: <Volume2 size={15} />,
    content: (
      <>
        <H>Adding audio</H>
        <P>Open the Audio tool, upload MP3, WAV, OGG, AAC or M4A files, then add them to the timeline or drag them onto the audio track. Use separate lanes for music and narration so the timeline stays readable.</P>
        <H>Core controls</H>
        <Table head={['Control', 'How to use it']} rows={[
          ['Volume', 'Base loudness, including boosted values for quiet clips.'],
          ['Start Time', 'Trim from the beginning of the source file without changing the file.'],
          ['Duration', 'How long the clip plays on the timeline.'],
          ['Playback Speed', 'Speed audio up or down to match the scene.'],
          ['Fade In / Fade Out', 'Smoothly enter or leave music, ambience and voice.'],
          ['Fade Volume', 'Target fade level at the start or end of the clip.'],
          ['Duck under voice', 'Music dips while the video or a voiceover talks and comes back up in the pauses. Pick the volume while talking and the fade, then click Duck under voice; the curve shows on the clip in the timeline.'],
          ['Markers', 'Timing marks for beats, voice cues and edit points.'],
        ]} />
        <H>Ducking</H>
        <P>Select the music clip and use <strong>Duck under voice</strong> in its panel (or ask the AI Agent: "duck the music"). The editor listens to every unmuted video clip and voiceover, finds where someone talks, and lowers the music there — it stays down through short pauses so it doesn't pump. Run it again after you change the edit; <strong>Remove</strong> takes it off. The preview and the exported MP4 sound the same.</P>
        <H>Audio effects</H>
        <P>Voice, pitch, bass and saturation. Pitch changes the tone without changing timing, so pitched clips stay in sync with the timeline. The editor preview of pitch is an approximation; the exported MP4 uses the full-quality version.</P>
        <H>Timeline workflow</H>
        <P>Scrub the playhead while watching the canvas. Align key visual moments to audio markers, scene starts or pauses in the narration. Because audio stays put when scenes change, you can rearrange scenes freely and then nudge clips only where needed.</P>
      </>
    ),
  },
  {
    id: 'video', title: 'Video', icon: <Video size={15} />,
    content: (
      <>
        <H>Adding video</H>
        <P>Open the Video tool, upload MP4, WebM or MOV files, then place the clip on the canvas. A video element behaves like a visual layer: move, resize, crop, round its corners, add borders and shadows, adjust colors, apply effects, and animate it.</P>
        <H>Core controls</H>
        <Table head={['Control', 'How to use it']} rows={[
          ['Width / Height', 'Exact size, or resize on the canvas. Lock ratio to keep the source aspect.'],
          ['Timeline Start', 'Where the clip starts inside the scene.'],
          ['Start Time', 'Trim into the source video without changing the file.'],
          ['Duration', 'How much of the clip plays in the scene.'],
          ['Volume / Muted', 'Keep, lower or mute the original audio.'],
          ['Playback Speed', 'Slow motion for detail or faster playback for context.'],
          ['Loop', 'Repeat short clips and background motion.'],
          ['Crop', 'Double-click the video, adjust the frame, press Enter to apply or Escape to cancel.'],
        ]} />
        <H>Speed ramp (velocity)</H>
        <P>The <strong>Speed ramp</strong> section changes the speed during the clip: <strong>Slow-mo start</strong>, <strong>Montage</strong> (fast, a slow moment, fast again), <strong>Hero</strong> (a dramatic slow-motion middle), <strong>Bullet</strong>, <strong>Flash in</strong>, <strong>Flash out</strong> and <strong>Jump</strong>. Then shape it on the curve: drag a point up or down (0.1× to 10×), double-click to add one, right-click to remove one. The clip plays the same footage, so it gets longer or shorter — and when it ended with its scene, the scene follows. The sound follows the speed and keeps its pitch. The timeline shows the ramp's name on the clip.</P>
        <H>Freeze frame</H>
        <P>Put the playhead on a moment and click <strong>Freeze at the playhead</strong>: the picture holds there for the <strong>Hold</strong> time (silent), then the clip carries on. One freeze per clip; split the clip for more.</P>
        <H>Split screen and placing clips</H>
        <P>Select two or more clips and open <strong>Group Effects → Layout</strong> for <strong>Side by side</strong>, <strong>Stacked</strong> (best for 9:16) or <strong>Grid</strong>. To put clips anywhere else, tell the AI Agent where: "make video 1 full screen and video 2 bottom right at 400x300", "put this video in the upper half and this one in the lower half", "fit the whole video in the top third". It works out the exact pixels from the scene size (the upper half of 1080×1920 is 1080×960). Clips are cropped to fill their area, centred on what they showed — never stretched unless you say "stretch"; say "fit" or "without cropping" to see the whole clip.</P>
        <H>Auto reframe (follow the face)</H>
        <P>Select a video and use <strong>Auto reframe</strong> at the top of its panel. <strong>Fill frame</strong> makes the clip cover the whole frame — e.g. landscape footage in a 9:16 video — and moves the crop to keep the speaker's face in shot; <strong>In place</strong> keeps the clip's size and position and only moves the crop (useful in a split screen). <strong>Steady</strong> holds one framing per shot, <strong>Auto</strong> stays still while the speaker sits still and pans smoothly when they move, <strong>Follow</strong> always follows. Shot changes cut instead of panning. Faces are found on your computer — nothing is uploaded. <strong>Stop following</strong> or a new hand-made crop turns it off.</P>
        <H>Jump cuts</H>
        <P>Select a talking clip and open <strong>Jump cuts</strong> at the top of its panel. Turn on what to cut — <strong>Pauses</strong>, <strong>Filler words</strong> ("um", "uh") and <strong>Retakes</strong> (a sentence you started again: the earlier tries go, the last take stays) — and every cut shows on the timeline as a striped block before anything changes: red pauses, amber fillers, violet retakes. <strong>Shortest pause to cut</strong> and <strong>Breath kept by each cut</strong> set how tight it gets; <strong>Silence level</strong> is worked out from the clip (Auto) or set by hand for noisy rooms. <strong>Punch-in zoom</strong> zooms every other part in a little (10% by default) so the cuts look intentional. <strong>Apply</strong> cuts the clip into scenes as one numbered AI edit — undo it with Ctrl+Z or /undo #N. If the clip was already cut, every part of it is included. Fillers and retakes need a transcript from local Whisper (once per clip, then remembered); pauses don't.</P>
        <H>Edit by transcript</H>
        <P><strong>Jump cuts → Edit by transcript</strong> shows the clip's words in the properties panel. Click a word to jump the playhead there (the word being spoken is highlighted). Drag or Shift+click to select words, then <Kbd>Delete</Kbd> to cut them — they stay visible, struck through, and <Kbd>Delete</Kbd> again brings them back. Filler words are coloured and pauses show as chips you can cut the same way; <strong>Cut N fillers</strong> / <strong>Cut N pauses</strong> do them all at once. Cuts show on the timeline until you <strong>Apply</strong>.</P>
        <H>Remove background</H>
        <P><strong>Edit BG</strong> in the left menu gives one-click <strong>Remove background</strong>, <strong>Blur background</strong>, <strong>Colour background</strong>, <strong>Green screen</strong> and <strong>Original</strong> for the selected video or image (or lists the scene's videos and images to pick from), then the fine-tune settings. When a clip was cut into parts (e.g. by jump cuts), the change goes to <strong>all parts</strong> unless you untick it. Videos and images also have <strong>Remove background</strong> in their panel. <strong>Green screen</strong> removes a colour: the colour is found from the picture's edges when you turn it on, or use <strong>Pick</strong> and click the screen anywhere on the canvas. <strong>Strength</strong> sets how many shades of the screen go, <strong>Edge softness</strong> softens the outline and <strong>Spill removal</strong> takes the green cast off hair and edges. <strong>AI cut-out</strong> keeps the person and removes the rest without a green screen (on this computer); <strong>Edge feather</strong> softens the outline, and the background can be removed, <strong>blurred</strong> (portrait look) or replaced with a <strong>colour</strong>. Whatever is behind the clip shows through; <strong>Put behind</strong> places a project image or video right behind it, filling its box. It shows in Preview and export.</P>
        <H>Cutting video</H>
        <P>To remove a middle section, split the scene (or the clip) at the start of the unwanted part, split again at its end, and delete the middle. Playback continues smoothly from the new trim point in the editor, Preview and export.</P>
        <H>Styling</H>
        <P>Brightness, contrast, saturation, blur, temperature, tint, vibrance, frame shapes, perspective, corner radius, borders (including gradient and animated), box shadow, inner shadow — and everything in Effects (colour looks, grain, vignette, glitch…) via <strong>Open Effects</strong>.</P>
      </>
    ),
  },
  {
    id: 'captions', title: 'Captions', icon: <Captions size={15} />,
    content: (
      <>
        <P>Open <strong>Subtitle</strong> from the menu. Captions are generated on your computer — nothing is uploaded. Word captions and translation need the Python runtime; the first time, click <strong>Download</strong> (one time, about 200 MB).</P>
        <H>Automatic captions</H>
        <ul className="list-disc pl-5">
          <LI>Choose the audio sources to transcribe and the spoken language, or Auto-detect. More than 25 languages are listed, including Hindi.</LI>
          <LI>Optionally paste the script; it is distributed across the detected speech timings for accurate wording.</LI>
        </ul>
        <H>Caption style</H>
        <P>Start from a <strong>preset</strong> — <strong>Bold</strong> (big capitals, black outline, the spoken word in yellow), <strong>Karaoke</strong> (words light up as they are spoken), <strong>Boxed</strong> (text on a dark box), <strong>Minimal</strong> or <strong>Pop</strong> — then fine-tune: font, size, weight, solid or gradient color, capitals, outline, spoken-word colour, box, width and position. Animations: None, Word Pop, Word Rise, Karaoke Pulse (spread over each caption), Smooth Reveal. Looks: Normal, Bulge Warp, Inflate Warp. Presets size themselves to the frame, so they suit 16:9 and 9:16.</P>
        <H>Translation (English ↔ Hindi)</H>
        <ul className="list-disc pl-5">
          <LI>Install the translation model once (Install Model); after that it works fully offline. Remove Model frees the space.</LI>
          <LI>Show translation adds a second caption line in the other language; style it separately or inherit the main font.</LI>
          <LI>Add glossary terms so names and technical words are translated the way you want.</LI>
        </ul>
        <H>Export</H>
        <P>Export SRT files: Source, Translated, or Bilingual.</P>
      </>
    ),
  },
  {
    id: 'shortcuts', title: 'Shortcuts', icon: <Keyboard size={15} />,
    content: (
      <>
        <P>On macOS use <Kbd>Cmd</Kbd> wherever <Kbd>Ctrl</Kbd> is shown. Shortcuts are ignored while you are typing in a text field.</P>
        <H>Editing</H>
        <Table head={['Action', 'Keys']} rows={[
          ['Undo / Redo', 'Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y)'],
          ['Copy / Cut / Paste', 'Ctrl+C / Ctrl+X / Ctrl+V (same scene: 20 px offset; other scene: same position)'],
          ['Select all on the scene', 'Ctrl+A'],
          ['Duplicate selection', 'Ctrl+D (connected items stay connected)'],
          ['Group / Ungroup', 'Ctrl+G / Ctrl+Shift+G'],
          ['One item inside a group', 'Ctrl+click / Ctrl+drag / Ctrl+arrow keys'],
          ['Delete selected element', 'Delete / Backspace'],
          ['Deselect, cancel the active tool or Draw Arrow', 'Escape'],
          ['Move element', 'Arrow keys — 12 px; Shift 40 px; Alt 100 px (groups move as one)'],
        ]} />
        <H>Layer order</H>
        <Table head={['Action', 'Keys']} rows={[
          ['Bring forward', 'Ctrl+Shift+]'],
          ['Send backward', 'Ctrl+Shift+['],
          ['Bring to front', 'Ctrl+]'],
          ['Send to back', 'Ctrl+['],
        ]} />
        <H>Timeline & playback</H>
        <Table head={['Action', 'Keys']} rows={[
          ['Play / Pause', 'Space'],
          ['Step one frame', '← / → (when nothing is selected)'],
          ['Jump to start / end', 'Home / End'],
          ['Zoom timeline in / out / reset', 'Ctrl+= (or Ctrl++) / Ctrl+− / Ctrl+0'],
          ['Delete selected audio or video clip', 'Delete / Backspace'],
          ['Delete the current scene', 'Delete / Backspace with nothing selected'],
          ['Reorder a scene', 'Shift + drag the scene block'],
          ['Change an audio clip’s lane', 'Shift + click the clip'],
        ]} />
        <H>Crop, fields and code</H>
        <Table head={['Action', 'Keys']} rows={[
          ['Apply / cancel crop', 'Enter / Escape'],
          ['Type an exact slider value', 'Click the value, then Enter to apply or Escape to cancel'],
          ['Rename project', 'Click the name, then Enter to save or Escape to cancel'],
          ['Code editor', 'Standard editor keys: Ctrl+/ comment, Ctrl+F find, Shift+Alt+F format, Alt+↑/↓ move line'],
          ['AI prompt: / or @ list', '↑ / ↓ to move, Enter or Tab to pick, Escape to close'],
          ['Transcript: select words', 'Drag, or click then Shift+click'],
          ['Transcript: cut / restore the selection', 'Delete / Backspace (again to restore); Escape clears the selection'],
        ]} />
        <P>Tip: Space, the arrow keys and Home/End make repeated review fast. Combine arrow nudging with the right-click Center commands and the layer shortcuts for clean alignment.</P>
      </>
    ),
  },
  {
    id: 'export', title: 'Export & Download', icon: <Download size={15} />,
    content: (
      <>
        <H>Video (MP4)</H>
        <P>Export → Video. Choose 720p or 1080p. Frames are rendered locally with FFmpeg, including transitions, effects, captions and all audio, and saved as an MP4. A progress bar shows status; do not interact with the canvas while it renders.</P>
        <P>Before the final export, preview the whole project once. Check that video clips start on the intended scene, audio fades feel natural, captions are readable, and transitions do not cut off important words or visuals.</P>
        <H>Image (PNG / WebP)</H>
        <P>Export → Image. Pick a scene; the snapshot is taken after enter animations finish. PNG/WebP keep transparency when the scene background is Transparent.</P>
        <H>Notes</H>
        <ul className="list-disc pl-5">
          <LI>Everything runs offline — no account, no upload.</LI>
          <LI>MP4 cannot store transparency. Use PNG/WebP for transparent stills.</LI>
        </ul>
      </>
    ),
  },
  {
    id: 'ai-agent', title: 'AI Agent', icon: <BrainCircuit size={15} />,
    content: (
      <>
        <P>The AI Agent turns plain-English requests into editor commands. It runs entirely on your computer — no account or internet needed — and always shows the plan before anything changes.</P>
        <P>One request can hold several steps ("add a title 'Intro' at the top and make it fade in, then split scene 2 at 3s"). Refer to items by kind ("the title", "the red circle", "the music"), by name, by their text in quotes, or as "it" for what the previous step created.</P>
        <H>Add-ons and media in a prompt</H>
        <P>Type <strong>/</strong> to pick an add-on (/title-card, /lower-third, /hook, /neural-network, /flowchart, /equation, /code-walkthrough) and <strong>@</strong> to pick a media file. A short list opens as you type: <Kbd>↑</Kbd> <Kbd>↓</Kbd> move through it, <Kbd>Enter</Kbd> or <Kbd>Tab</Kbd> picks, <Kbd>Esc</Kbd> closes it. Commands and mentions show in colour so you can see they were understood — e.g. "add /neural-network in scene 4 with 4 seconds delay", "add a step 'Test' to /flowchart". Every prompt you sent has a copy button under it.</P>
        <H>Planner</H>
        <P>The <strong>Planner</strong> button in the title bar, next to the project name, opens your notes and ideas — video ideas, scripts, shot lists, to-dos. They belong to the app, not to a project, so every project sees the same Planner. Each plan is a card with its title and the start of its note; click a card to open it in full, or <strong>New plan</strong> to start one. Pin a plan to keep it first, give it a colour, search by any words. Everything saves as you type (on this computer, with a backup of the last version).</P>
        <H>Better prompts</H>
        <ul className="list-disc pl-5">
          <LI>Mention the scene number when the edit belongs to a specific scene.</LI>
          <LI>Select an item first when using words like "this" or "selected".</LI>
          <LI>Give exact values for size, color, speed, delay, or duration when they matter.</LI>
          <LI>Review the pending plan before clicking Apply. <strong>Preview</strong> (between Apply and Cancel) shows each scene the plan changes, before and after, without applying anything.</LI>
          <LI>Every applied plan gets a number (<strong>#1</strong>, <strong>#2</strong>, …) with an <strong>Undo</strong> button. Type <strong>/history</strong> to list this project's AI edits (the start of each prompt, its time and its number), then <strong>/undo #2</strong> to undo one — after "/undo " the list offers your edits. "undo #2" and "undo the last AI edit" work too. Undoing an older edit keeps everything done after it — anything you changed since stays as it is, and the agent tells you. Ctrl+Z brings an undone edit back.</LI>
        </ul>
        <H>Examples</H>
        <Table head={['Request', 'What it should do']} rows={[
          ['Split scene 2 at 3s / split here / split scene 3 into 3 parts', 'Cut scenes at a time, at the playhead, or into equal parts.'],
          ['Delete scenes 2-4 / duplicate scene 1 / swap scene 1 and 3', 'Remove, copy and reorder scenes.'],
          ['Make all scenes 3s long / extend scene 1 by 2s', 'Change scene durations.'],
          ['Use wipe transitions between all scenes', 'Set the transition on every scene after the first.'],
          ['Add whip pan transitions between all scenes / add a strong zoom blur transition to scene 2', 'Any of the transitions by name, with strength, direction and length.'],
          ['Fade in from black at the start / fade out to black at the end', 'An intro on the first scene and a fade-out after the last one.'],
          ['Make the background dark blue', 'Solid, gradient ("from purple to pink") or transparent backgrounds.'],
          ["Add a title 'Intro' at the top and make it fade in", 'Add text, place it, then animate it.'],
          ['Add a red circle with a white border in the bottom right', 'Add shapes with fill, border and position.'],
          ['Make the title bigger / make the red circle blue / center it', 'Resize, recolor and place existing items.'],
          ['Mute the video / set the music volume to 30% / speed up the video 2x', 'Change clip sound and speed.'],
          ['Trim the first 2 seconds of the video / fade in the music over 2s', 'Trim clips and fade audio.'],
          ['Move the selected item to the right with speed 400', 'Add a move animation.'],
          ['Remove silences / tighten the pauses', 'Listen to each video clip and cut out the quiet parts.'],
          ['Remove filler words', 'Cut "um", "uh" and "hmm" found by local Whisper. Play it back — word timings are approximate.'],
          ['Remove the retakes / cut out the false starts', 'Cut sentences you started again, keeping the last take.'],
          ['Add jump cuts with punch-in zooms / zoom in 15% on every other cut', 'Cut the pauses and zoom every other part in.'],
          ['Remove the green screen / key out the blue screen on the video', 'Make the screen colour transparent.'],
          ['Remove the background from my video / blur my background / bring the background back', 'AI cut-out of the person, a blurred or coloured background, or the original again.'],
          ['Cut to the beat', 'Move scene ends onto the beat of the background music.'],
          ['Split the video into shots', 'Make a new scene at every camera cut.'],
          ["Add a lower third for 'Adya' 'ML engineer' on the right", 'Add an add-on; then "make the lower third red" or "change its role to \'Founder\'".'],
          ["Add a hook 'Stop scrolling, this changes everything' highlighting 'everything'", 'Word-by-word hook text with the highlighted word in colour.'],
          ['Duck the music to 20% / lower the music when I talk', 'Lower the music wherever someone talks.'],
          ['Split screen / put the videos side by side', 'Tile videos and images, cropped to fill.'],
          ['Make video 1 full screen and video 2 bottom right at 400x300', 'Put each clip in an exact area of the frame.'],
          ['Reframe the video for vertical / follow the speaker\'s face', 'Crop the clip to keep the face in frame as it moves.'],
          ['Add a neural network with layers 3, 5, 5, 2 and a forward and backward pass', 'Then "make the network seven layers with 12 neurons in the middle" or "add a hidden layer to the network".'],
          ["Add a flowchart: collect data -> clean -> train -> deploy", 'Then "add a step \'Test\' after \'Train\' in the flowchart" or "make the flowchart vertical".'],
          ['Put this video in the upper half and this one in the lower half', 'Areas from the scene size: halves, thirds, quarters, corners, "top 60%", "at x 100 y 200".'],
          ['Hormozi style captions / make the captions yellow with a black outline', 'Apply a caption preset or change the caption look.'],
        ]} />
        <P>Full guide: <DocLink path="docs/ai_agent.md">docs/ai_agent.md</DocLink></P>
      </>
    ),
  },
  {
    id: 'python-sandbox', title: 'Python Sandbox', icon: <Terminal size={15} />,
    content: (
      <>
        <P>Python Sandbox creates graph images and math animation outputs with preloaded Python tools, then saves or inserts the generated file into the editor.</P>
        <P>Use it when a chart, mathematical explanation, or generated visual would be faster to create with code than by hand. It is especially useful for technical videos because the output becomes a normal editor asset that you can resize, animate, crop, and combine with text or narration.</P>
        <H>Workflow</H>
        <ul className="list-disc pl-5">
          <LI>Open Menu Sidebar → Python Sandbox.</LI>
          <LI>First time only: click <strong>Download</strong> to fetch the Python runtime (about 200 MB). It stays installed; you can remove it from the sandbox header. Local Whisper captions and translation use the same download.</LI>
          <LI>Choose Python Script for Matplotlib outputs or Manim Scene for animation.</LI>
          <LI>Write only the working code. Do not add import lines; supported libraries are already preloaded.</LI>
          <LI>Save outputs inside <Kbd>out</Kbd>, then use Save to Assets or Insert.</LI>
        </ul>
        <H>Preloaded names</H>
        <P><Kbd>np</Kbd>, <Kbd>plt</Kbd>, <Kbd>animation</Kbd>, <Kbd>math</Kbd>, <Kbd>random</Kbd>, <Kbd>statistics</Kbd>, <Kbd>Path</Kbd>, <Kbd>out</Kbd>, <Kbd>WIDTH</Kbd>, <Kbd>HEIGHT</Kbd>, and <Kbd>FPS</Kbd>.</P>
        <P>Full guide: <DocLink path="docs/python_sandbox.md">docs/python_sandbox.md</DocLink></P>
      </>
    ),
  },
]

export default function UserGuideModal() {
  const setUserGuideOpen = useEditorStore(s => s.setUserGuideOpen)
  const [active, setActive] = useState('overview')
  const section = SECTIONS.find(s => s.id === active) ?? SECTIONS[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) setUserGuideOpen(false) }}>
      <div className="bg-editor-panel border border-editor-border rounded-3xl shadow-xl flex flex-col overflow-hidden w-[80vw] h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-editor-border flex-none">
          <div className="flex items-center gap-2">
            <Clapperboard size={16} className="text-editor-accent" />
            <span className="text-base font-medium text-editor-text">User Guide</span>
          </div>
          <button onClick={() => setUserGuideOpen(false)} className="text-[#c9c4dd] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar nav */}
          <nav className="w-56 flex-none border-r border-editor-border overflow-y-auto py-2">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={[
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-base text-left transition-colors',
                  active === s.id
                    ? 'bg-editor-accent-dim text-editor-accent border-r-2 border-editor-accent'
                    : 'text-[#c9c4dd] hover:bg-editor-hover hover:text-editor-text',
                ].join(' ')}
              >
                {s.icon}{s.title}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold text-editor-text mb-4 flex items-center gap-2">{section.icon}{section.title}</h2>
              {section.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
