import { promptParts } from '../../ai/promptTokens'
import { cn } from '../../utils/cn'

/**
 * A prompt with its `/add-on` commands and `@media` mentions highlighted.
 * `sameWidth` keeps every glyph the width of the plain font (the bold look
 * comes from a thin text stroke), so it can sit exactly under a textarea.
 */
export default function PromptText({ text, sameWidth = false }: { text: string; sameWidth?: boolean }) {
  return (
    <>
      {promptParts(text).map((part, i) => part.kind ? (
        <span key={i}
          className={cn('rounded-sm', part.kind === 'addon' ? 'text-violet-300 bg-editor-accent/30' : 'text-sky-300 bg-sky-400/15', !sameWidth && 'font-semibold')}
          style={sameWidth ? { WebkitTextStroke: '0.45px currentColor' } : undefined}>
          {part.text}
        </span>
      ) : <span key={i}>{part.text}</span>)}
    </>
  )
}
