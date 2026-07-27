import { useEditorStore } from '../../store/editorStore'
import TextPanel from '../panels/TextPanel'
import ShapePanel from '../panels/ShapePanel'
import ArrowPanel from '../panels/ArrowPanel'
import CodePanel from '../panels/CodePanel'
import TablePanel from '../panels/TablePanel'
import ChartPanel from '../panels/ChartPanel'
import BackgroundPanel from '../panels/BackgroundPanel'
import LayersPanel from '../panels/LayersPanel'
import TransitionPanel from '../panels/TransitionPanel'
import ImageUploadPanel from '../panels/ImageUploadPanel'
import AudioPanel from '../panels/AudioPanel'
import AudioPropertiesPanel from '../panels/AudioPropertiesPanel'
import ImagePanel from '../panels/ImagePanel'
import IconCollectionPanel from '../panels/IconCollectionPanel'
import IconEditPanel from '../panels/IconEditPanel'
import PerspectivePanel from '../panels/PerspectivePanel'
import VideoUploadPanel from '../panels/VideoUploadPanel'
import VideoPanel from '../panels/VideoPanel'
import LatexPanel from '../panels/LatexPanel'
import CounterPanel from '../panels/CounterPanel'
import MovePanel from '../panels/MovePanel'
import HandDrawPanel from '../panels/HandDrawPanel'
import MediaEffectsPanel from '../panels/MediaEffectsPanel'
import type { ActivePanel } from '../../types/editor'

// When an element is selected and the sidebar panel matches the element's "home" panel,
// show the element's property panel instead of the generic tool panel.
const ELEMENT_PANEL: Record<string, ActivePanel> = {
  text:  'text',
  shape: 'shapes',
  arrow: 'arrows',
  code:  'code',
  table: 'table',
  chart: 'charts',
  image: 'upload',
  video: 'video',
  icon:  'icons',
  audio: 'audio',
  latex: 'latex',
  counter: 'counter',
  handDraw: 'handDraw',
}

export default function OptionsSidebar() {
  const { project, activePanel, getSelectedEls } = useEditorStore()

  const selected = project ? getSelectedEls() : []
  const firstEl  = selected[0]

  function renderPanel() {
    if (!project) {
      return <HintPanel text="Open or create a project to start editing." />
    }

    // Auto-show element panel when element selected and no panel active, OR when
    // the active panel is the element's natural home panel (e.g. image selected + upload open).
    if (firstEl) {
      if (activePanel === 'effects') {
        return <MediaEffectsPanel />
      }

      const home = ELEMENT_PANEL[firstEl.type]
      if (!activePanel || activePanel === home) {
        if (firstEl.type === 'text')   return <TextPanel />
        if (firstEl.type === 'shape')  return <ShapePanel />
        if (firstEl.type === 'arrow')  return <ArrowPanel />
        if (firstEl.type === 'code')   return <CodePanel />
        if (firstEl.type === 'table')  return <TablePanel />
        if (firstEl.type === 'chart')  return <ChartPanel />
        if (firstEl.type === 'image')  return <ImagePanel />
        if (firstEl.type === 'video')  return <VideoPanel />
        if (firstEl.type === 'icon')   return <IconEditPanel />
        if (firstEl.type === 'latex')  return <LatexPanel />
        if (firstEl.type === 'counter') return <CounterPanel />
        if (firstEl.type === 'audio')  return <AudioPropertiesPanel element={firstEl} />
      }
    }

    switch (activePanel) {
      case 'text':       return <TextPanel />
      case 'shapes':     return <ShapePanel />
      case 'arrows':     return <ArrowPanel />
      case 'code':       return <CodePanel />
      case 'table':      return <TablePanel />
      case 'charts':     return <ChartPanel />
      case 'upload':     return <ImageUploadPanel />
      case 'video':      return <VideoUploadPanel />
      case 'audio':      return <AudioPanel />
      case 'icons':      return <IconCollectionPanel />
      case 'latex':      return <LatexPanel />
      case 'counter':    return <CounterPanel />
      case 'handDraw':   return <HandDrawPanel />
      case 'background': return <BackgroundPanel />
      case 'layers':     return <LayersPanel />
      case 'transitions':  return <TransitionPanel />
      case 'perspective':  return <PerspectivePanel />
      case 'move':         return <MovePanel />
      case 'effects':      return <MediaEffectsPanel />
      default:
        return <HintPanel text="Menu Options Panel (select to see)" />
    }
  }

  return (
    <aside className="w-full flex-none bg-[#171717] flex flex-col overflow-hidden h-full">
      {renderPanel()}
    </aside>
  )
}

function HintPanel({ text }: { text: string }) {
  return (
    <div className="flex-1 flex mx-5 my-2 items-center text-center text-[#f2f2f2] justify-center">{text}</div>
  )
}
