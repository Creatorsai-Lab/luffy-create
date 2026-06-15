import { v4 as uuid } from 'uuid'
import type {
  Project, Scene, Background, TextElement, ShapeElement,
  ArrowElement, CodeElement, ImageElement, TableElement, ChartElement, VideoElement, AudioElement,
  IconElement, LatexElement, CounterElement, ElementAnimation, SceneTransition, ShapeType
} from '../types/editor'

export const DEFAULT_BG: Background = { type: 'solid', color: '#fffaf7' }

export const DEFAULT_TRANSITION: SceneTransition = { type: 'none', duration: 0.5 }

export function makeScene(index = 1): Scene {
  return {
    id: uuid(),
    name: `Scene ${index}`,
    duration: 5,
    background: { ...DEFAULT_BG },
    elements: [],
    transition: { ...DEFAULT_TRANSITION }
  }
}

export function makeProject(id: string, name: string): Project {
  return {
    id, name,
    width: 1920, height: 1080, fps: 30,
    scenes: [makeScene(1)],
    assets: [],
    timeMarkers: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

export function makeText(x: number, y: number): TextElement {
  return {
    id: uuid(), type: 'text', name: 'Text',
    x, y, width: 500, height: 60,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    content: 'Double-click to edit',
    fontSize: 50, fontFamily: 'Segoe UI', fontWeight: 'normal',
    italic: false, color: '#333333', align: 'left',
    lineHeight: 1.4, letterSpacing: 0, underline: false,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    textStroke: '',
    textStrokeWidth: 0,
    stretchX: 1,
    stretchY: 1,
  }
}

export function makeLatex(x: number, y: number, latex: string, width: number, height: number): LatexElement {
  return {
    id: uuid(), type: 'latex', name: 'LaTeX',
    x, y, width, height,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    latex,
    color: '#222222',
    fontSize: 48,
  }
}

export function makeShape(type: ShapeType, x: number, y: number): ShapeElement {
  const is3D = type === 'cube' || type === 'cone'
  const size = type === 'cube' ? 300 : 280
  // Hand-drawn whiteboard box: transparent fill + visible dark stroke
  const isSketch = type === 'rect-sketch'
  return {
    id: uuid(), type: 'shape', name: type.charAt(0).toUpperCase() + type.slice(1),
    x, y,
    width:  size,
    height: size,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    shapeType: type,
    fill: isSketch ? 'transparent' : '#6366f1',
    stroke: isSketch ? '#202020' : 'transparent',
    strokeWidth: isSketch ? 3 : 0,
    cornerRadius: 8,
    ...(is3D ? { depth: 55, faceColor: '' } : {}),
  }
}

export function makeArrow(x1: number, y1: number, x2: number, y2: number): ArrowElement {
  return {
    id: uuid(), type: 'arrow', name: 'Arrow',
    x: Math.min(x1, x2), y: Math.min(y1, y2),
    width: Math.abs(x2 - x1) || 100, height: Math.abs(y2 - y1) || 4,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    x1, y1, x2, y2,
    stroke: '#202020', strokeWidth: 5, arrowHead: 'end', dashed: false,
    dotted: false,
    pointerLength: 12,
    pointerWidth: 13,
    arrowHeadColor: '#202020',
    curve: 0,
  }
}

export function makeCode(x: number, y: number): CodeElement {
  return {
    id: uuid(), type: 'code', name: 'Code Block',
    x, y, width: 480, height: 240,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    code: '// Enter your code here\nconst hello = "world"\nconsole.log(hello)',
    language: 'javascript',
    fontSize: 14, showLineNumbers: true
  }
}

export function makeImage(x: number, y: number, src: string, assetId: string): ImageElement {
  return {
    id: uuid(), type: 'image', name: 'Image',
    x, y, width: 320, height: 240,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    src, assetId, cornerRadius: 0
  }
}

export function makeTable(x: number, y: number): TableElement {
  const rows = 3, cols = 3
  return {
    id: uuid(), type: 'table', name: 'Table',
    x, y, width: cols * 150, height: rows * 110,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    rows, cols,
    cells: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => r === 0 ? `Header ${c + 1}` : '')
    ),
    cellWidth: 250, cellHeight: 150,
    borderColor: '#aaaaaa', borderWidth: 1,
    headerBg: '#383838', cellBg: '#6e6e6e',
    textColor: '#f2f4fd', fontSize: 36, showHeader: true
  }
}

export function makeIcon(iconName: string, x: number, y: number): IconElement {
  return {
    id: uuid(), type: 'icon', name: iconName,
    x, y, width: 120, height: 120,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    iconName,
    color: '#202020',
    strokeWidth: 2,
  }
}

export function makeAnimation(): ElementAnimation {
  return {
    id: uuid(),
    type: 'fadeIn',
    timing: 'onEnter',
    startTime: 0,
    duration: 0.8,
    delay: 0,
    easing: 'easeOut'
  }
}

export function makeChart(x: number, y: number): ChartElement {
  return {
    id: uuid(), type: 'chart', name: 'Chart',
    x, y, width: 400, height: 300,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    chartType: 'bar',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
      datasets: [{
        label: 'Dataset 1',
        data: [12, 19, 3, 5, 2],
        color: '#623af5'
      }]
    },
    showLegend: true,
    showGrid: true,
    backgroundColor: '#59595e'
  }
}

export function makeVideo(
  x: number, y: number, src: string, assetId: string,
  width = 640, height = 360, sourceDuration = 10,
): VideoElement {
  return {
    id: uuid(), type: 'video', name: 'Video',
    x, y, width, height,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    src, assetId, cornerRadius: 0,
    volume: 1,
    playbackRate: 1,
    loop: false,
    muted: false,
    startTime: 0,
    duration: sourceDuration,
    timelineX: 0,
    sourceDuration,
  }
}

export function makeAudio(src: string, assetId: string, duration: number): AudioElement {
  return {
    id: uuid(), type: 'audio', name: 'Audio',
    x: 0, y: 0, width: 100, height: 40,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    src, assetId,
    volume: 1,
    speed: 1,
    fadeIn: 0,
    fadeOut: 0,
    startTime: 0,
    duration,
    loop: false,
    track: 'background'
  }
}

export function makeCounter(x: number, y: number): CounterElement {
  return {
    id: uuid(), type: 'counter', name: 'Counter',
    x, y, width: 300, height: 100,
    rotation: 0, opacity: 1, zIndex: 0, locked: false, visible: true,
    animations: [],
    mode: 'number',
    start: 1,
    end: 50,
    speedMs: 100,
    fontSize: 60,
    fontFamily: 'Inter',
    fontWeight: 'bold',
    italic: false,
    color: '#333333',
    lineHeight: 1.2,
    shadowBlur: 0,
    shadowColor: 'transparent',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  }
}
