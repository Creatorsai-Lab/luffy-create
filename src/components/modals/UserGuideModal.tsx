import { useState } from 'react'
import { X, BookOpen, LayoutGrid, Sparkles, Image as ImageIcon, Shuffle, Keyboard, Download, Clapperboard, BrainCircuit, Terminal } from 'lucide-react'
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
  return <kbd className="px-1.5 py-0.5 text-[11px] rounded bg-editor-elevated border border-editor-border text-editor-text font-mono">{children}</kbd>
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
      <thead><tr className="bg-editor-elevated">
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
        <P>Luffy Create is a scene-based animated video editor for technical and educational content. A project is a sequence of <strong>scenes</strong>; each scene has its own background, elements, duration, and entry transition.</P>
        <H>The interface</H>
        <ul className="list-disc pl-5">
          <LI><strong>Left sidebar (Menu):</strong> project name, canvas size, undo/redo, preview/export, and all creation tools.</LI>
          <LI><strong>Canvas (center):</strong> the editing surface. Click to select, drag to move, handles to resize/rotate, double-click code/image/video to edit/crop.</LI>
          <LI><strong>Right sidebar (Options):</strong> properties for the active tool or selected element.</LI>
          <LI><strong>Timeline (bottom):</strong> scenes, playhead, playback, audio tracks. Drag its top edge to resize.</LI>
          <LI><strong>AI Agents (far right):</strong> prepare validated editor commands from natural-language requests.</LI>
        </ul>
        <H>Quick start</H>
        <ul className="list-disc pl-5">
          <LI>Pick a canvas size, set a background.</LI>
          <LI>Add elements (text, shapes, code, images, video…).</LI>
          <LI>Select an element and add enter / loop / exit animations.</LI>
          <LI>Preview, then Export to MP4 or an image.</LI>
        </ul>
      </>
    ),
  },
  {
    id: 'tools', title: 'Tools & Elements', icon: <LayoutGrid size={15} />,
    content: (
      <>
        <H>Creation tools</H>
        <Table head={['Tool', 'What it does']} rows={[
          ['Text', 'Add text. Font, size, weight, color, alignment, stretch, stroke, shadow, background box, effects.'],
          ['Shapes', 'Rect, circle, polygons, star, diamond, speech bubbles, 3D cube/cone, hand-drawn + sketch box, heart.'],
          ['Arrow', 'Lines/arrows with heads, dashes, curve. Drag endpoints on canvas.'],
          ['Code', 'Monaco editor; 15 languages, syntax highlighting, line numbers.'],
          ['LaTeX', 'Render equations as vector graphics; color + size; full animations.'],
          ['Table', 'Editable grid; rows/cols, colors, borders, header.'],
          ['Charts', 'Bar, line, area, pie, doughnut; editable data + styling.'],
          ['Icons', 'Searchable Lucide icon library; color + stroke width.'],
          ['Images', 'Upload PNG/JPG/WebP; adjustments, crop, perspective.'],
          ['Video', 'Upload MP4/WebM; volume, speed, loop, crop, adjustments.'],
          ['Audio', 'Background / voiceover tracks; trim, fade, speed, markers.'],
          ['Perspective', 'Warp an image/shape into any quadrilateral.'],
        ]} />
        <H>Editing an element</H>
        <P>Select it, then use the right Options panel. Move with the mouse or arrow keys: <Kbd>Arrow</Kbd> nudges, <Kbd>Shift</Kbd> faster, <Kbd>Ctrl</Kbd> fastest. Right-click for Copy, Duplicate, Center Horizontally/Vertically, and Delete.</P>
      </>
    ),
  },
  {
    id: 'animations', title: 'Animations', icon: <Sparkles size={15} />,
    content: (
      <>
        <P>Every element has three animation slots. Add as many as you like per slot; configure type, start, duration, delay, easing, and (where relevant) direction/distance.</P>
        <H>1 · On Enter</H>
        <P>Plays once when the element appears: Fade In, Slide In, Scale In, Wipe In, Spin, plus text-only Typewriter (chars/words).</P>
        <H>2 · Loop</H>
        <P>Repeats continuously while the element is visible: Pulse, Bounce, Rotate, Fade Loop, and Flow (marching-dash border on shapes/arrows).</P>
        <H>3 · On Exit</H>
        <P>Plays once as the element leaves: Fade Out, Slide Out, Scale Out, Wipe Out (and Draw Off for arrows).</P>
        <H>Easing</H>
        <P>Linear, Ease In, Ease Out, Ease In-Out, Bounce — controls the acceleration of the motion.</P>
        <P>Tip: clear every animation on the current slide with the eraser button on the canvas toolbar (top-right).</P>
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
          ['Gradient', 'Linear / radial / conic, from–via–to colors, angle, stops.'],
          ['Grid', 'Background + line color, cell size.'],
          ['Dots', 'Background + dot color, spacing, radius.'],
          ['Animated', 'Gradient Flow, Gradient Shift, Conic Rotate, Aurora, Wave — two colors + speed.'],
          ['Transparent', 'Checkerboard in the editor; real alpha in PNG/WebP export (MP4 has no alpha).'],
          ['Image', 'Right-click an image element → Set Background (cover/fill).'],
        ]} />
      </>
    ),
  },
  {
    id: 'transitions', title: 'Transitions', icon: <Shuffle size={15} />,
    content: (
      <>
        <P>A transition plays at the <strong>start</strong> of a scene (from the previous scene into it). Set it in the Transitions tool, or right-click a scene in the timeline → Edit Transition.</P>
        <Table head={['Transition', 'Effect']} rows={[
          ['Fade', 'Cross-fade from the previous scene.'],
          ['Slide', 'New scene slides in from an edge (direction).'],
          ['Push', 'New scene pushes the old one out (direction).'],
          ['Zoom', 'Zoom in from center.'],
          ['Wipe', 'Curtain reveal (direction).'],
          ['Morph', 'Smooth scale + drift blend (direction).'],
        ]} />
        <P>Each transition type has a fixed color shown on its timeline block for quick recognition.</P>
      </>
    ),
  },
  {
    id: 'shortcuts', title: 'Shortcuts', icon: <Keyboard size={15} />,
    content: (
      <>
        <H>Editing</H>
        <Table head={['Action', 'Keys']} rows={[
          ['Undo / Redo', 'Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y)'],
          ['Copy / Paste', 'Ctrl+C / Ctrl+V'],
          ['Delete element', 'Delete / Backspace'],
          ['Deselect / cancel', 'Escape'],
          ['Move element', 'Arrow keys (Shift = fast, Ctrl = fastest)'],
        ]} />
        <H>Timeline & playback</H>
        <Table head={['Action', 'Keys']} rows={[
          ['Play / Pause', 'Space'],
          ['Step frame', '← / → (when nothing is selected)'],
          ['Jump to start / end', 'Home / End'],
          ['Zoom timeline', 'Ctrl + / Ctrl − / Ctrl 0'],
          ['Reorder scene', 'Shift + drag the scene block'],
          ['Change audio lane', 'Shift + click an audio clip'],
          ['Crop apply / cancel', 'Enter / Escape'],
        ]} />
      </>
    ),
  },
  {
    id: 'export', title: 'Export & Download', icon: <Download size={15} />,
    content: (
      <>
        <H>Video (MP4)</H>
        <P>Export → Video. Choose 720p or 1080p. Frames are rendered locally with FFmpeg and saved as an MP4. A progress bar shows status; do not interact with the canvas while it renders.</P>
        <H>Image (PNG / WebP)</H>
        <P>Export → Image. Pick a scene; the snapshot is taken after enter animations finish. PNG/WebP keep transparency when the scene background is Transparent.</P>
        <H>Notes</H>
        <ul className="list-disc pl-5">
          <LI>Everything runs offline — no account, no upload.</LI>
          <LI>MP4 can't store transparency (H.264 has no alpha). Use PNG/WebP for transparent stills.</LI>
        </ul>
      </>
    ),
  },
  {
    id: 'ai-agent', title: 'AI Agent', icon: <BrainCircuit size={15} />,
    content: (
      <>
        <P>The AI Agent prepares scene edits as structured commands. It is best for focused changes such as adding elements, styling selected items, changing backgrounds, applying move animations, and setting transitions.</P>
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
