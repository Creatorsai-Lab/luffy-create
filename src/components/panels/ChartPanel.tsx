import { BarChart3, CircleDot, LineChart, PieChart, Plus, Trash2, Sparkles, TrendingUp } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { ChartElement, AnimationType, EasingType } from '../../types/editor'
import { makeAnimation, makeChart } from '../../utils/defaults'
import { PanelHeader, Row, ColorInput, Slider } from './TextPanel'
import { cn } from '../../utils/cn'
import { FONT_FAMILIES } from '../../types/editor'

const CHART_TYPES: { icon: React.ReactNode; type: ChartElement['chartType']; label: string }[] = [
  { icon: <BarChart3 size={13} />,   type: 'bar',      label: 'Bar' },
  { icon: <LineChart size={13} />,   type: 'line',     label: 'Line' },
  { icon: <TrendingUp size={13} />,  type: 'area',     label: 'Area' },
  { icon: <PieChart size={13} />,    type: 'pie',      label: 'Pie' },
  { icon: <PieChart size={13} />,    type: 'doughnut', label: 'Ring' },
  { icon: <CircleDot size={13} />,    type: 'points',   label: 'Points' },
]

const CHART_ANIM_TYPES: Record<ChartElement['chartType'], AnimationType> = {
  bar:      'chartBarsRise',
  line:     'chartLineDraw',
  area:     'chartAreaFlow',
  pie:      'chartPieSpin',
  doughnut: 'chartPieSpin',
  points:   'chartLineDraw',
}

const CHART_ANIM_LABELS: Record<ChartElement['chartType'], string> = {
  bar:      'Bars rise from bottom',
  line:     'Line draws point-to-point',
  area:     'Area flows left to right',
  pie:      'Slices open sequentially',
  doughnut: 'Slices open sequentially',
  points:   'Points reveal across the x-axis',
}

export default function ChartPanel() {
  const {
    project, currentSceneId, getSelectedEls, updateElement, addElement, addAnimation, updateAnimation, removeAnimation,
    setActiveTool, setActivePanel, pendingChartType, setPendingChartType
  } = useEditorStore()
  const el = getSelectedEls().find(e => e.type === 'chart') as ChartElement | undefined
  const firstDataset = el?.data.datasets[0]
  const pointData = firstDataset?.points ?? [
    { x: 0, y: 1 },
    { x: 2, y: 4 },
    { x: 4, y: 3 },
    { x: 6, y: 8 },
    { x: 8, y: 6 },
  ]

  function upd(patch: Partial<ChartElement>) {
    if (el) updateElement(el.id, patch)
  }

  function toNumber(raw: string, fallback: number) {
    const parsed = parseFloat(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  function withPointDefaults(chart: ChartElement): ChartElement {
    const datasets = chart.data.datasets.length > 0 ? chart.data.datasets : [{
      label: 'Points',
      data: [],
      color: '#2563eb',
      points: pointData,
    }]
    return {
      ...chart,
      data: {
        ...chart.data,
        datasets: datasets.map((ds, i) => ({
          ...ds,
          label: i === 0 && ds.label === 'Dataset 1' ? 'Points' : ds.label,
          color: ds.color || '#2563eb',
          points: ds.points?.length ? ds.points : pointData,
        })),
      },
      xAxisMin: chart.xAxisMin ?? 0,
      xAxisMax: chart.xAxisMax ?? 10,
      xAxisStep: chart.xAxisStep ?? 2,
      yAxisMin: chart.yAxisMin ?? 0,
      yAxisMax: chart.yAxisMax ?? 10,
      yAxisStep: chart.yAxisStep ?? 2,
      pointSize: chart.pointSize ?? 5,
      showPointLabels: chart.showPointLabels ?? true,
      regressionLineEnabled: chart.regressionLineEnabled ?? false,
      regressionStartX: chart.regressionStartX ?? 0,
      regressionStartY: chart.regressionStartY ?? 1,
      regressionEndX: chart.regressionEndX ?? 10,
      regressionEndY: chart.regressionEndY ?? 8,
      regressionLineColor: chart.regressionLineColor ?? '#ef4444',
      regressionLineWidth: chart.regressionLineWidth ?? 3,
      showGrid: true,
      showLegend: false,
    }
  }

  function setChartType(type: ChartElement['chartType']) {
    setPendingChartType(type)
    if (el) {
      const patch: Partial<ChartElement> = { chartType: type }
      if (type === 'points') Object.assign(patch, withPointDefaults({ ...el, chartType: type }))
      upd(patch)
      return
    }

    if (!project || !currentSceneId) return
    const chart = makeChart(
      Math.round(project.width / 2 - 200),
      Math.round(project.height / 2 - 150)
    )
    chart.chartType = type
    addElement(type === 'points' ? withPointDefaults(chart) : chart)
    setActiveTool('select')
    setActivePanel('charts')
  }

  function addDataset() {
    if (!el) return
    upd({
      data: {
        ...el.data,
        datasets: [...el.data.datasets, {
          label: `Series ${el.data.datasets.length + 1}`,
          data: el.data.labels.map(() => Math.floor(Math.random() * 20) + 1),
          color: ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'][el.data.datasets.length % 5]
        }]
      }
    })
  }

  function removeDataset(idx: number) {
    if (!el || el.data.datasets.length <= 1) return
    upd({ data: { ...el.data, datasets: el.data.datasets.filter((_, i) => i !== idx) } })
  }

  function addLabel() {
    if (!el) return
    upd({
      data: {
        labels: [...el.data.labels, `L${el.data.labels.length + 1}`],
        datasets: el.data.datasets.map(ds => ({ ...ds, data: [...ds.data, 0] }))
      }
    })
  }

  function removeLabel(idx: number) {
    if (!el || el.data.labels.length <= 1) return
    upd({
      data: {
        labels: el.data.labels.filter((_, i) => i !== idx),
        datasets: el.data.datasets.map(ds => ({ ...ds, data: ds.data.filter((_, i) => i !== idx) }))
      }
    })
  }

  function updateLabel(idx: number, v: string) {
    if (!el) return
    const labels = [...el.data.labels]; labels[idx] = v
    upd({ data: { ...el.data, labels } })
  }

  function updateDatasetLabel(dsIdx: number, v: string) {
    if (!el) return
    const datasets = el.data.datasets.map((ds, i) => i === dsIdx ? { ...ds, label: v } : ds)
    upd({ data: { ...el.data, datasets } })
  }

  function updateDatasetColor(dsIdx: number, color: string) {
    if (!el) return
    const datasets = el.data.datasets.map((ds, i) => i === dsIdx ? { ...ds, color } : ds)
    upd({ data: { ...el.data, datasets } })
  }

  function updateValue(dsIdx: number, valIdx: number, v: number) {
    if (!el) return
    const datasets = el.data.datasets.map((ds, i) => {
      if (i !== dsIdx) return ds
      const data = [...ds.data]; data[valIdx] = v
      return { ...ds, data }
    })
    upd({ data: { ...el.data, datasets } })
  }

  function updatePoint(idx: number, axis: 'x' | 'y', value: number) {
    if (!el || !firstDataset) return
    const points = pointData.map((pt, i) => i === idx ? { ...pt, [axis]: value } : pt)
    const datasets = el.data.datasets.map((ds, i) => i === 0 ? { ...ds, points } : ds)
    upd({ data: { ...el.data, datasets } })
  }

  function addPoint() {
    if (!el || !firstDataset) return
    const last = pointData[pointData.length - 1] ?? { x: 0, y: 0 }
    const points = [...pointData, { x: last.x + (el.xAxisStep ?? 1), y: last.y }]
    const datasets = el.data.datasets.map((ds, i) => i === 0 ? { ...ds, points } : ds)
    upd({ data: { ...el.data, datasets } })
  }

  function removePoint(idx: number) {
    if (!el || !firstDataset || pointData.length <= 1) return
    const points = pointData.filter((_, i) => i !== idx)
    const datasets = el.data.datasets.map((ds, i) => i === 0 ? { ...ds, points } : ds)
    upd({ data: { ...el.data, datasets } })
  }

  const chartAnimType = el ? CHART_ANIM_TYPES[el.chartType] : null
  const chartAnim = el?.animations.find(a => a.timing === 'onEnter' && chartAnimType && a.type === chartAnimType)

  function toggleChartAnim(checked: boolean) {
    if (!el || !chartAnimType) return
    if (checked) {
      const existing = el.animations.find(a => a.timing === 'onEnter')
      if (existing) removeAnimation(el.id, existing.id)
      addAnimation(el.id, { ...makeAnimation(), type: chartAnimType, timing: 'onEnter', duration: 1.5, delay: 0, easing: 'easeOut' })
    } else if (chartAnim) {
      removeAnimation(el.id, chartAnim.id)
    }
  }

  const isPieType = el?.chartType === 'pie' || el?.chartType === 'doughnut'
  const isPointType = el?.chartType === 'points'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader icon={<BarChart3 size={12} />} title="Chart" />

      <div className="flex-1 overflow-y-auto">
        {/* Chart type grid — always visible */}
        <div className="px-3 py-2 border-b border-editor-border">
          <span className="label block mb-2">Chart Type</span>
          <div className="grid grid-cols-6 gap-1">
            {CHART_TYPES.map(ct => {
              const isActive = el ? el.chartType === ct.type : pendingChartType === ct.type
              return (
                <button
                  key={ct.type}
                  onClick={() => setChartType(ct.type)}
                  title={ct.label}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 py-2 rounded border transition-colors',
                    isActive
                      ? 'bg-editor-accent border-editor-accent text-white'
                      : 'bg-editor-elevated border-editor-border text-[#f2f2f2] hover:text-editor-text hover:border-editor-text/40'
                  )}
                >
                  {ct.icon}
                  <span className="text-[9px]">{ct.label}</span>
                </button>
              )
            })}
          </div>
          {!el && (
            <p className="text-[10px] text-[#d9d9d9] mt-2">Click a type, then click canvas to place chart.</p>
          )}
        </div>

        {el && (
          <>
            {/* Style */}
            <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-1.5">
              <span className="label">Style</span>
              <Row label="Background">
                <ColorInput value={el.backgroundColor} onChange={v => upd({ backgroundColor: v })} />
              </Row>
              <Row label="Label Color">
                <ColorInput value={el.textColor ?? '#999999'} onChange={v => upd({ textColor: v })} />
              </Row>
              <Row label="Font Size">
                <Slider value={el.fontSize ?? 10} min={6} max={40} step={1}
                  onChange={v => upd({ fontSize: v })} display={`${el.fontSize ?? 10}px`} />
              </Row>
              <Row label="Font Family">
                <select
                  value={el.fontFamily ?? 'Arial'}
                  onChange={e => upd({ fontFamily: e.target.value })}
                  className="w-full bg-editor-base border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                >
                  {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Row>
              <Row label="Corner Radius">
                <Slider value={el.cornerRadius ?? 4} min={0} max={32} step={1}
                  onChange={v => upd({ cornerRadius: v })} display={`${el.cornerRadius ?? 4}px`} />
              </Row>
              <Row label="Opacity">
                <Slider value={el.opacity} min={0} max={1} step={0.01}
                  onChange={v => upd({ opacity: v })} display={`${Math.round(el.opacity * 100)}%`} />
              </Row>
              <div className="flex items-center gap-3 pt-0.5">
                {!isPointType && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={el.showLegend}
                      onChange={e => upd({ showLegend: e.target.checked })}
                      className="w-3.5 h-3.5 accent-editor-accent" />
                    <span className="text-xs text-[#f2f2f2]">Legend</span>
                  </label>
                )}
                {!isPieType && !isPointType && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={el.showGrid}
                      onChange={e => upd({ showGrid: e.target.checked })}
                      className="w-3.5 h-3.5 accent-editor-accent" />
                    <span className="text-xs text-[#f2f2f2]">Grid</span>
                  </label>
                )}
              </div>
            </div>

            {/* Chart-type-specific controls */}
            {el.chartType === 'bar' && (
              <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-1.5">
                <span className="label">Bar Options</span>
                <Row label="Bar Width">
                  <Slider value={el.barWidth ?? 0.8} min={0.2} max={1.0} step={0.05}
                    onChange={v => upd({ barWidth: v })} display={`${Math.round((el.barWidth ?? 0.8) * 100)}%`} />
                </Row>
                <Row label="Bar Spacing">
                  <Slider value={el.barSpacing ?? 0.12} min={0} max={0.5} step={0.02}
                    onChange={v => upd({ barSpacing: v })} display={`${Math.round((el.barSpacing ?? 0.12) * 100)}%`} />
                </Row>
              </div>
            )}

            {(el.chartType === 'line' || el.chartType === 'area') && (
              <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-1.5">
                <span className="label">Line Options</span>
                <Row label="Line Weight">
                  <Slider value={el.lineWeight ?? 2} min={1} max={8} step={0.5}
                    onChange={v => upd({ lineWeight: v })} display={`${el.lineWeight ?? 2}px`} />
                </Row>
              </div>
            )}

            {isPointType && (
              <>
                <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-1.5">
                  <span className="label">Point Graph</span>
                  <Row label="Point Color">
                    <ColorInput value={firstDataset?.color ?? '#2563eb'} onChange={v => updateDatasetColor(0, v)} />
                  </Row>
                  <Row label="Point Size">
                    <Slider value={el.pointSize ?? 5} min={2} max={18} step={1}
                      onChange={v => upd({ pointSize: v })} display={`${el.pointSize ?? 5}px`} />
                  </Row>
                  <Row label="Coordinates">
                    <select
                      value={el.showPointLabels ?? true ? 'show' : 'hide'}
                      onChange={e => upd({ showPointLabels: e.target.value === 'show' })}
                      className="w-full bg-editor-base border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                    >
                      <option value="show">Show labels</option>
                      <option value="hide">Hide labels</option>
                    </select>
                  </Row>
                </div>

                <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-1.5">
                  <span className="label">Axis Range</span>
                  <div className="grid grid-cols-3 gap-1">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-[#d9d9d9]">X Start</span>
                      <input type="number" value={el.xAxisMin ?? 0}
                        onChange={e => upd({ xAxisMin: toNumber(e.target.value, 0) })}
                        className="px-1.5 py-1 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-[#d9d9d9]">X End</span>
                      <input type="number" value={el.xAxisMax ?? 10}
                        onChange={e => upd({ xAxisMax: toNumber(e.target.value, 10) })}
                        className="px-1.5 py-1 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-[#d9d9d9]">X Gap</span>
                      <input type="number" value={el.xAxisStep ?? 2} min={0.01} step={0.1}
                        onChange={e => upd({ xAxisStep: Math.max(0.01, toNumber(e.target.value, 1)) })}
                        className="px-1.5 py-1 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-[#d9d9d9]">Y Start</span>
                      <input type="number" value={el.yAxisMin ?? 0}
                        onChange={e => upd({ yAxisMin: toNumber(e.target.value, 0) })}
                        className="px-1.5 py-1 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-[#d9d9d9]">Y End</span>
                      <input type="number" value={el.yAxisMax ?? 10}
                        onChange={e => upd({ yAxisMax: toNumber(e.target.value, 10) })}
                        className="px-1.5 py-1 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] text-[#d9d9d9]">Y Gap</span>
                      <input type="number" value={el.yAxisStep ?? 2} min={0.01} step={0.1}
                        onChange={e => upd({ yAxisStep: Math.max(0.01, toNumber(e.target.value, 1)) })}
                        className="px-1.5 py-1 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag" />
                    </label>
                  </div>
                </div>

                <div className="px-3 py-2 border-b border-editor-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="label">Data Points</span>
                    <button onClick={addPoint}
                      className="flex items-center gap-1 text-xs text-editor-accent hover:text-editor-accent/80">
                      <Plus size={10} /> Add
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                    {pointData.map((pt, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1">
                        <input
                          type="number" value={pt.x}
                          onChange={e => updatePoint(i, 'x', toNumber(e.target.value, 0))}
                          className="px-1.5 py-1 text-xs bg-editor-elevated border border-editor-border rounded text-editor-text nodrag"
                          title="X value"
                        />
                        <input
                          type="number" value={pt.y}
                          onChange={e => updatePoint(i, 'y', toNumber(e.target.value, 0))}
                          className="px-1.5 py-1 text-xs bg-editor-elevated border border-editor-border rounded text-editor-text nodrag"
                          title="Y value"
                        />
                        <button onClick={() => removePoint(i)}
                          disabled={pointData.length <= 1}
                          className="p-1 text-[#f2f2f2] hover:text-red-400 disabled:opacity-30">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {isPointType && (
              <div className="px-3 py-2 border-b border-editor-border flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={el.regressionLineEnabled ?? false}
                    onChange={e => upd({ regressionLineEnabled: e.target.checked })}
                    className="w-3.5 h-3.5 accent-editor-accent"
                  />
                  <span className="label">Regression Line</span>
                </label>

                {el.regressionLineEnabled && (
                  <>
                    <div className="grid grid-cols-2 gap-1">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-[#d9d9d9]">Start X</span>
                        <input type="number" value={el.regressionStartX ?? 0}
                          onChange={e => upd({ regressionStartX: toNumber(e.target.value, 0) })}
                          className="px-1.5 py-1 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-[#d9d9d9]">Start Y</span>
                        <input type="number" value={el.regressionStartY ?? 1}
                          onChange={e => upd({ regressionStartY: toNumber(e.target.value, 1) })}
                          className="px-1.5 py-1 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-[#d9d9d9]">End X</span>
                        <input type="number" value={el.regressionEndX ?? 10}
                          onChange={e => upd({ regressionEndX: toNumber(e.target.value, 10) })}
                          className="px-1.5 py-1 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[10px] text-[#d9d9d9]">End Y</span>
                        <input type="number" value={el.regressionEndY ?? 8}
                          onChange={e => upd({ regressionEndY: toNumber(e.target.value, 8) })}
                          className="px-1.5 py-1 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag" />
                      </label>
                    </div>
                    <Row label="Line Color">
                      <ColorInput value={el.regressionLineColor ?? '#ef4444'} onChange={v => upd({ regressionLineColor: v })} />
                    </Row>
                    <Row label="Line Width">
                      <Slider value={el.regressionLineWidth ?? 3} min={1} max={12} step={0.5}
                        onChange={v => upd({ regressionLineWidth: v })} display={`${el.regressionLineWidth ?? 3}px`} />
                    </Row>
                  </>
                )}
              </div>
            )}

            {/* Categories */}
            {!isPointType && <div className="px-3 py-2 border-b border-editor-border">
              <div className="flex items-center justify-between mb-2">
                <span className="label">Categories</span>
                <button onClick={addLabel}
                  className="flex items-center gap-1 text-xs text-editor-accent hover:text-editor-accent/80">
                  <Plus size={10} /> Add
                </button>
              </div>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                {el.data.labels.map((label, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <input
                      type="text" value={label}
                      onChange={e => updateLabel(i, e.target.value)}
                      className="flex-1 px-2 py-1 text-xs bg-editor-elevated border border-editor-border rounded text-editor-text nodrag"
                    />
                    <button onClick={() => removeLabel(i)}
                      disabled={el.data.labels.length <= 1}
                      className="p-1 text-[#f2f2f2] hover:text-red-400 disabled:opacity-30">
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>}

            {/* Data Series */}
            {!isPointType && <div className="px-3 py-2 border-b border-editor-border">
              <div className="flex items-center justify-between mb-2">
                <span className="label">Data Series</span>
                {!isPieType && (
                  <button onClick={addDataset}
                    className="flex items-center gap-1 text-xs text-editor-accent hover:text-editor-accent/80">
                    <Plus size={10} /> Add
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                {(isPieType ? el.data.datasets.slice(0, 1) : el.data.datasets).map((ds, dsIdx) => (
                  <div key={dsIdx} className="bg-editor-elevated rounded border border-editor-border p-2">
                    <div className="flex items-center gap-1 mb-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: ds.color }} />
                      <input
                        type="text" value={ds.label}
                        onChange={e => updateDatasetLabel(dsIdx, e.target.value)}
                        className="flex-1 px-1.5 py-0.5 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag"
                        placeholder="Series name"
                      />
                      <ColorInput value={ds.color} onChange={v => updateDatasetColor(dsIdx, v)} />
                      {!isPieType && (
                        <button onClick={() => removeDataset(dsIdx)}
                          disabled={el.data.datasets.length <= 1}
                          className="p-0.5 text-[#f2f2f2] hover:text-red-400 disabled:opacity-30">
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {ds.data.map((val, valIdx) => (
                        <div key={valIdx} className="flex items-center gap-1">
                          <span className="text-[10px] text-[#f2f2f2] w-14 truncate">
                            {el.data.labels[valIdx] ?? `#${valIdx + 1}`}:
                          </span>
                          <input
                            type="number" value={val}
                            onChange={e => updateValue(dsIdx, valIdx, parseFloat(e.target.value) || 0)}
                            className="flex-1 px-1.5 py-0.5 text-xs bg-editor-base border border-editor-border rounded text-editor-text nodrag"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>}

            {/* Animation */}
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={11} className="text-editor-accent" />
                <span className="label">Animation</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                  type="checkbox"
                  checked={!!chartAnim}
                  onChange={e => toggleChartAnim(e.target.checked)}
                  className="w-3.5 h-3.5 accent-editor-accent"
                />
                <span className="text-xs text-[#f2f2f2]">{CHART_ANIM_LABELS[el.chartType]}</span>
              </label>
              {chartAnim && (
                <div className="flex flex-col gap-1.5 p-2 bg-editor-elevated border border-editor-border rounded">
                  <Row label="Duration (s)">
                    <Slider value={chartAnim.duration} min={0.3} max={5} step={0.1}
                      onChange={v => updateAnimation(el.id, chartAnim.id, { duration: v })}
                      display={`${chartAnim.duration.toFixed(1)}s`} />
                  </Row>
                  <Row label="Delay (s)">
                    <Slider value={chartAnim.delay} min={0} max={10} step={0.1}
                      onChange={v => updateAnimation(el.id, chartAnim.id, { delay: v })}
                      display={`${chartAnim.delay.toFixed(1)}s`} />
                  </Row>
                  <Row label="Easing">
                    <select
                      value={chartAnim.easing}
                      onChange={e => updateAnimation(el.id, chartAnim.id, { easing: e.target.value as EasingType })}
                      className="w-full bg-editor-base border border-editor-border rounded text-xs text-editor-text px-2 py-1"
                    >
                      {['linear', 'easeIn', 'easeOut', 'easeInOut', 'bounce'].map(v =>
                        <option key={v} value={v}>{v}</option>)}
                    </select>
                  </Row>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
