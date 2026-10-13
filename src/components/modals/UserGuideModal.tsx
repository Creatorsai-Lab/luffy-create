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
          <LI><strong>Media effects</strong> for images and video — stackable, timed effects such as zoom, light sweep, glitch, rain and snow, plus grain and vignette. See Effects.</LI>
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
          ['Arrow', 'Click to add an arrow in the scene center. In its panel, “+ Add Arrow” adds another; “Draw Arrow” lets you drag one on the canvas (crosshair cursor, Esc cancels). Heads, dashes, curve, bends, colors.'],
          ['Audio', 'Upload music, voiceover and sound effects; add them to the timeline or drag them onto the audio track.'],
          ['Background', 'Solid, gradient, grid, dots, animated, transparent or image background for the current scene.'],
          ['Charts', 'Bar, line, area, points, pie and doughnut charts with editable data, axes and styling.'],
          ['Code', 'Monaco code editor with syntax highlighting, line numbers and typing animations.'],
          ['Counter', 'Animated counter that counts as numbers, English words or Hindi words, with range, speed, loop and text styling.'],
          ['Effects', 'Timed media effects, grain and vignette for the selected image or video.'],
          ['Hand Draw', 'Freehand drawing with Pen, Paint, Spray and Eraser.'],
          ['Icons', 'Searchable icon library; color and stroke width.'],
          ['Images', 'Upload PNG/JPG/WebP/GIF; crop, adjustments, borders, shadows, perspective, effects.'],
          ['LaTeX', 'Equations rendered as crisp graphics; color, size, animations.'],
          ['Layers', 'All elements of the scene: show/hide, lock, bring forward/back, delete, Shift+drag to reorder.'],
          ['Motion', 'Move an element along a direction or to coordinates, or Zoom In / Zoom Out toward a corner or the center.'],
          ['Perspective', 'Tilt, skew and corner-warp any visual element except arrows.'],
          ['Python Sandbox', 'Generate charts and math animations with Python (Matplotlib, Manim).'],
          ['Shapes', 'Rectangle, circle, oval, polygons, star, diamond, heart, speech bubbles, 3D cube/cone, hand-drawn and sketch boxes.'],
          ['Subtitle', 'Automatic captions, caption styles and translation.'],
          ['Table', 'Click to add a table in the scene center; edit rows, columns, cells, colors, borders, header.'],
          ['Text', 'Click to add a text box in the scene center; “+ Add Text” in its panel adds more. Fonts, gradient fill, stroke, shadow, background box, Glow and Hollow effects.'],
          ['Transitions', 'Choose how the current scene enters from the previous one.'],
          ['User Guide', 'This guide — available even before a project is open.'],
          ['Video', 'Upload MP4/WebM/MOV; trim, speed, volume, loop, crop, color grading, effects.'],
        ]} />
        <H>Editing an element</H>
        <P>Select it, then use the right Options panel. Nudge with the arrow keys: <Kbd>Arrow</Kbd> moves 12 px, <Kbd>Shift</Kbd> 40 px, <Kbd>Ctrl</Kbd> 100 px. Rotate with the round rotate icon above the selection; it snaps to 45° angles when you get close.</P>
        <P>Right-click an element for Copy, Duplicate, Bring Forward, Send Backward, Bring to Front, Send to Back, Center Horizontally, Center Vertically and Delete. Images also offer Set Background (Cover / Fill).</P>
        <P>Pasting into the same scene offsets the copy by 20 px. Pasting into a different scene keeps the exact position and links the copy to the original, so a Morph transition between those scenes moves it.</P>
        <H>Perspective</H>
        <P>Open Perspective with an element selected. Use X-Axis Tilt, Y-Axis Tilt, Skew X, Skew Y and Depth for quick results, or drag the orange corner handles and red edge handles on the canvas for full control. Corner fields set exact positions in the element's own pixels. Reset removes the warp. Perspective is true perspective: straight lines stay straight, text keeps all its styling, and the click area follows the warped shape.</P>
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
        <P>Every element has three animation slots. Add as many as you like per slot and set type, start, duration, delay, easing and, where relevant, direction and distance. Click a slider's value to type an exact number.</P>
        <H>1 · On Enter</H>
        <P>Plays once when the element appears: Fade In, Slide In, Scale In, Wipe In. Text adds Typewriter (chars / words), Bounce Words and Outline Reveal In. Shapes add Spin In. Arrows use Draw On, Direction Slide and Zoom In. Code adds Character typing, Line typing and Block reveal.</P>
        <H>2 · Loop</H>
        <P>Repeats while the element is visible, after its enter animations finish: Pulse, Bounce, Rotate, Fade Loop. Text adds Color Pulse; shapes and arrows add Flow (marching dashes).</P>
        <H>3 · On Exit</H>
        <P>Plays once as the element leaves: Fade Out, Slide Out, Scale Out, Wipe Out. Text adds Outline Reveal Out; arrows use Draw Off and Zoom Out.</P>
        <H>Motion</H>
        <P>The Motion tool adds movement that is not an entrance or exit: <strong>Move</strong> slides an element by direction or to exact center coordinates (it can travel outside the scene), and <strong>Zoom In / Zoom Out</strong> scale toward the center or a corner.</P>
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
        <P>Select an image or video and open <strong>Effects</strong>. Effects are cards you can stack; each one runs between its own <strong>Start At</strong> and <strong>End At</strong> times (in seconds from the scene start).</P>
        <Table head={['Effect', 'What it does']} rows={[
          ['Subtle Hover / Wiggle / Doodle Drift', 'Gentle floating or hand-made movement.'],
          ['Shake / Vibration Distort', 'Camera shake and vibrating distortion.'],
          ['Zoom In / Zoom Out', 'Slow zoom toward the center or a chosen corner.'],
          ['God Rays / Light Sweep / Light Flicker', 'Light beams, a sweeping highlight, or flickering light.'],
          ['Glitch', 'Digital glitch bursts.'],
          ['Rain / Snow', 'Weather particles over the media.'],
        ]} />
        <P>Depending on the effect, a card offers Intensity, Speed, Direction, Color and Color Opacity, Zoom Position, and a Target: Whole Media, Center Subject, or Manual Focus with Focus X / Focus Y.</P>
        <H>Grain and vignette</H>
        <P>Grain adds film texture (color, size, hardness). Vignette darkens or tints the edges (color, size, fade, hardness). Both work on images and videos.</P>
        <H>Video-only looks</H>
        <P>The Video panel also has color grading presets, legacy video effects and frame shapes (circle, triangle).</P>
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
        <P>A transition plays at the <strong>start</strong> of a scene, leading in from the previous scene. Set it in the Transitions tool, or right-click a scene in the timeline → Edit Transition. Duration is 0.1–2 seconds.</P>
        <Table head={['Transition', 'Effect']} rows={[
          ['None', 'Hard cut.'],
          ['Fade', 'Cross-fade from the previous scene.'],
          ['Push', 'The new scene pushes the old one out (direction).'],
          ['Zoom', 'The new scene eases in with a gentle zoom.'],
          ['Wipe', 'A soft-edged reveal (direction).'],
          ['Morph', 'Matching objects move, resize and recolor into their new place.'],
          ['Flash Blur', 'A directional blur through a white flash (direction, speed, hardness).'],
          ['Flicker Shake', 'Rapid flicker between the scenes with a shake (direction, speed, hardness).'],
        ]} />
        <H>Using Morph</H>
        <P>Morph works like PowerPoint Morph. Duplicate a scene (or copy elements into the next scene), then move, resize or recolor things in the copy and give the copy a Morph transition. Objects are matched across the two scenes — copies are linked automatically, and otherwise elements of the same type with the same content (same text, image or shape type) are paired. Unmatched objects fade out or in. If matched text changes its wording, the old and new text cross-fade while the box moves.</P>
        <P>Morph plays in timeline playback, Preview and export. While paused, the editor shows the real scene so it stays editable.</P>
        <H>When to use transitions</H>
        <P>Use transitions to separate ideas, not to decorate every cut. Fade suits calm narration, Push suits step-by-step movement, Wipe reveals before/after comparisons, Morph explains change, and Flash Blur / Flicker Shake give energetic social-style cuts. Each transition has a fixed color on its timeline marker.</P>
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
          ['Fade Volume', 'Target fade level — useful for ducking music under speech.'],
          ['Markers', 'Timing marks for beats, voice cues and edit points.'],
        ]} />
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
        <H>Cutting video</H>
        <P>To remove a middle section, split the scene (or the clip) at the start of the unwanted part, split again at its end, and delete the middle. Playback continues smoothly from the new trim point in the editor, Preview and export.</P>
        <H>Styling</H>
        <P>Brightness, contrast, saturation, blur, temperature, tint, vibrance, color grading presets, frame shapes, perspective, corner radius, borders (including gradient and animated), box shadow, inner shadow, grain, vignette and timed media effects.</P>
      </>
    ),
  },
  {
    id: 'captions', title: 'Captions', icon: <Captions size={15} />,
    content: (
      <>
        <P>Open <strong>Subtitle</strong> from the menu. Captions are generated on your computer — nothing is uploaded.</P>
        <H>Automatic captions</H>
        <ul className="list-disc pl-5">
          <LI>Choose the audio sources to transcribe and the spoken language, or Auto-detect. More than 25 languages are listed, including Hindi.</LI>
          <LI>Optionally paste the script; it is distributed across the detected speech timings for accurate wording.</LI>
        </ul>
        <H>Caption style</H>
        <P>Font, size, weight, solid or gradient color, width and position. Animations: None, Word Pop, Word Rise, Karaoke Pulse, Smooth Reveal. Looks: Normal, Bulge Warp, Inflate Warp.</P>
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
          ['Copy / Paste', 'Ctrl+C / Ctrl+V (same scene: 20 px offset; other scene: same position)'],
          ['Delete selected element', 'Delete / Backspace'],
          ['Deselect, cancel the active tool or Draw Arrow', 'Escape'],
          ['Move element', 'Arrow keys — 12 px; Shift 40 px; Ctrl 100 px'],
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
        <P>The AI Agent prepares scene edits as structured commands. It is best for focused changes such as adding elements, styling selected items, changing backgrounds, applying move animations, and setting transitions.</P>
        <P>The local planner handles common edits instantly, while a configured model planner can understand richer creative instructions. Use the agent for repetitive setup, fast scene building, and precise edits where you can describe the target scene, element, size, color, and timing.</P>
        <H>Better prompts</H>
        <ul className="list-disc pl-5">
          <LI>Mention the scene number when the edit belongs to a specific scene.</LI>
          <LI>Select an item first when using words like "this" or "selected".</LI>
          <LI>Give exact values for size, color, speed, delay, or duration when they matter.</LI>
          <LI>Review the pending plan before clicking Apply. Use Undo to roll back an applied AI plan.</LI>
        </ul>
        <H>Examples</H>
        <Table head={['Request', 'What it should do']} rows={[
          ['Add a 500x500 purple square on scene 2', 'Create a square on Scene 2 and clamp values if needed.'],
          ['Set scene 3 background to black', 'Apply a solid black background to Scene 3.'],
          ['Move the selected item to the right with speed 400 and delay 1.2 seconds', 'Add a move animation to the selected element.'],
          ['Set a fade transition on scene 4 with duration 0.8 seconds', 'Update Scene 4 transition settings.'],
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
