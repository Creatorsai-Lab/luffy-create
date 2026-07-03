import { useCallback } from 'react'
import { Shape, Group } from 'react-konva'
import type Konva from 'konva'
import type { CodeElement } from '../../../types/editor'

interface Props {
  el: CodeElement
  konvaProps: Record<string, unknown>
}

// ─── Token colors (GitHub dark theme) ─────────────────────────────────────────

const C = {
  keyword:  '#ff7b72',
  string:   '#a5d6ff',
  comment:  '#8b949e',
  number:   '#79c0ff',
  func:     '#d2a8ff',
  type:     '#ffa657',
  plain:    '#e6edf3',
  lineNum:  '#484f58',
}

const KW: Record<string, Set<string>> = {
  javascript: new Set(['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','class','import','export','from','of','in','new','this','typeof','instanceof','async','await','try','catch','finally','throw','true','false','null','undefined','default','delete','void','yield','static','get','set']),
  typescript: new Set(['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','class','import','export','from','of','in','new','this','typeof','instanceof','async','await','try','catch','finally','throw','true','false','null','undefined','default','delete','void','yield','static','get','set','interface','type','extends','implements','enum','namespace','readonly','private','public','protected','abstract','declare','as','is','keyof','infer','never','any','unknown']),
  python:     new Set(['def','class','import','from','return','if','elif','else','for','while','in','not','and','or','is','True','False','None','try','except','finally','raise','with','as','lambda','yield','pass','break','continue','global','nonlocal','del','assert','print','self']),
  rust:       new Set(['fn','let','mut','pub','use','struct','enum','impl','trait','where','if','else','for','while','loop','match','return','true','false','None','Some','Ok','Err','self','Self','super','mod','const','static','type','async','await','move','ref','as','in','dyn','extern','unsafe']),
  go:         new Set(['func','var','const','type','package','import','return','if','else','for','switch','case','default','break','continue','defer','go','chan','select','struct','interface','map','range','make','new','nil','true','false','len','cap','append']),
  java:       new Set(['public','private','protected','static','final','abstract','class','interface','extends','implements','return','if','else','for','while','do','switch','case','break','continue','new','null','true','false','void','int','long','double','float','boolean','char','byte','short','String','this','super','import','package','try','catch','finally','throw','throws','instanceof','enum']),
  cpp:        new Set(['int','long','short','char','bool','float','double','void','auto','class','struct','enum','namespace','using','return','if','else','for','while','do','switch','case','break','continue','new','delete','this','public','private','protected','virtual','override','const','static','inline','template','typename','true','false','nullptr','include']),
  bash:       new Set(['if','then','else','elif','fi','for','do','done','while','until','case','esac','function','return','exit','echo','read','local','export','source']),
}

type Token = { text: string; color: string }

function tokenizeLine(line: string, lang: string): Token[] {
  const tokens: Token[] = []
  const kws = KW[lang] ?? KW['javascript']
  let rest = line

  while (rest.length > 0) {
    // Single-line comments
    if (rest.startsWith('//') || rest.startsWith('#') || rest.startsWith('--')) {
      tokens.push({ text: rest, color: C.comment })
      break
    }

    // Strings: double, single, backtick
    const strM = rest.match(/^(["'`])((?:\\.|[^\\])*?)\1/)
    if (strM) {
      tokens.push({ text: strM[0], color: C.string })
      rest = rest.slice(strM[0].length)
      continue
    }

    // Numbers
    const numM = rest.match(/^(\b\d+\.?\d*\b)/)
    if (numM) {
      tokens.push({ text: numM[0], color: C.number })
      rest = rest.slice(numM[0].length)
      continue
    }

    // Words
    const wordM = rest.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/)
    if (wordM) {
      const w = wordM[0]
      const after = rest.slice(w.length).trimStart()
      let color = C.plain
      if (kws.has(w)) {
        color = C.keyword
      } else if (after.startsWith('(')) {
        color = C.func
      } else if (/^[A-Z]/.test(w)) {
        color = C.type
      }
      tokens.push({ text: w, color })
      rest = rest.slice(w.length)
      continue
    }

    // Everything else (operators, spaces, punctuation) — one char at a time
    tokens.push({ text: rest[0], color: C.plain })
    rest = rest.slice(1)
  }

  return tokens
}

const PADDING     = 12
const LINE_NUM_W  = 28
const HEADER_H    = 35

export default function CodeKonva({ el, konvaProps }: Props) {
  const lines = el.code.split('\n')
  const lineH = el.fontSize * 1.65
  const numW  = el.showLineNumbers ? LINE_NUM_W : 0
  const bgColor = (el as CodeElement & { bgColor?: string }).bgColor ?? '#0d1117'

  const sceneFunc = useCallback((ctx: Konva.Context, shape: Konva.Shape) => {
    const raw = (ctx as unknown as { _context: CanvasRenderingContext2D })._context
    const w = el.width, h = el.height

    raw.save()

    // ── Background ────────────────────────────────────────────────────────
    raw.fillStyle = bgColor
    if (raw.roundRect) {
      raw.beginPath()
      raw.roundRect(0, 0, w, h, 6)
      raw.fill()
    } else {
      raw.fillRect(0, 0, w, h)
    }

    // ── Header ───────────────────────────────────────────────────────────
    raw.fillStyle = 'rgba(0, 5, 14, 0.35)'
    raw.fillRect(0, 0, w, HEADER_H)

    // Traffic-light dots
    const dots = ['#ff5f57', '#febc2e', '#28c840']
    dots.forEach((color, i) => {
      raw.fillStyle = color
      raw.beginPath()
      raw.arc(20 + i * 16, HEADER_H / 2, 4.5, 0, Math.PI * 2)
      raw.fill()
    })

    // Language label (right side)
    raw.font = `15px Consolas, monospace`
    raw.fillStyle = '#ffffff'
    raw.textAlign = 'right'
    raw.fillText(el.language.toUpperCase(), w - PADDING, HEADER_H / 2 + 4)
    raw.textAlign = 'left'

    // ── Separator line ───────────────────────────────────────────────────
    raw.strokeStyle = 'rgba(255,255,255,0.08)'
    raw.lineWidth = 1
    raw.beginPath()
    raw.moveTo(0, HEADER_H)
    raw.lineTo(w, HEADER_H)
    raw.stroke()

    // ── Line number gutter ───────────────────────────────────────────────
    if (el.showLineNumbers) {
      raw.fillStyle = 'rgba(0,0,0,0.2)'
      raw.fillRect(PADDING, HEADER_H, numW + 6, h - HEADER_H)
      raw.strokeStyle = 'rgba(255,255,255,0.06)'
      raw.lineWidth = 1
      raw.beginPath()
      raw.moveTo(PADDING + numW + 6, HEADER_H)
      raw.lineTo(PADDING + numW + 6, h)
      raw.stroke()
    }

    // ── Code lines ────────────────────────────────────────────────────────
    raw.font = `${el.fontSize}px Consolas, 'Courier New', monospace`
    const baseline = HEADER_H + PADDING + el.fontSize

    for (let i = 0; i < lines.length; i++) {
      const y = baseline + i * lineH
      if (y > h) break

      // Line number
      if (el.showLineNumbers) {
        raw.fillStyle = C.lineNum
        raw.textAlign = 'right'
        raw.fillText(String(i + 1), PADDING + numW, y)
        raw.textAlign = 'left'
      }

      // Tokenized line
      const tokens = tokenizeLine(lines[i], el.language)
      let x = PADDING + numW + (el.showLineNumbers ? 10 : 0)
      for (const tok of tokens) {
        raw.fillStyle = tok.color
        raw.fillText(tok.text, x, y)
        x += raw.measureText(tok.text).width
        if (x > w - PADDING) break
      }
    }

    raw.restore()
    ctx.fillStrokeShape(shape)
  }, [el, lines, lineH, numW, bgColor])

  return (
    <Group {...konvaProps} width={el.width} height={el.height}>
      <Shape
        id={`${el.id}-hit`}
        width={el.width}
        height={el.height}
        sceneFunc={sceneFunc}
        onClick={konvaProps.onClick as (e: Konva.KonvaEventObject<MouseEvent>) => void}
        onDblClick={konvaProps.onDblClick as (e: Konva.KonvaEventObject<MouseEvent>) => void}
        hitFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.rect(0, 0, el.width, el.height)
          ctx.closePath()
          ctx.fillStrokeShape(shape)
        }}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}
