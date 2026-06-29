import { useState } from 'react'
import { X, BookOpen, LayoutGrid, Sparkles, Image as ImageIcon, Shuffle, Keyboard, Download, Clapperboard } from 'lucide-react'
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
          <LI><strong>AI Agents (far right):</strong> upcoming assistant (placeholder).</LI>
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
]

export default function UserGuideModal() {
  const setUserGuideOpen = useEditorStore(s => s.setUserGuideOpen)
  const [active, setActive] = useState('overview')
  const section = SECTIONS.find(s => s.id === active) ?? SECTIONS[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) setUserGuideOpen(false) }}>
      <div className="bg-editor-panel border border-editor-border rounded-3xl shadow-xl flex flex-col overflow-hidden"
        style={{ width: '90vw', height: '90vh' }}>
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
