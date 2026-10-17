import { promptParts } from '../../ai/promptTokens'
import { cn } from '../../utils/cn'

/**
 * A prompt with its `/add-on` commands and `@media` mentions in colour (and in
 * a monospace font). `inInput` keeps the input's own font, so the text drawn
 * under the textarea stays exactly in line with the caret.
 */
export default function PromptText({ text, inInput = false }: { text: string; inInput?: boolean }) {
  return (
    <>
      {promptParts(text).map((part, i) => part.kind ? (
        <span key={i} className={cn(part.kind === 'addon' ? 'text-violet-300' : part.kind === 'command' ? 'text-amber-300' : 'text-sky-300', !inInput && 'font-mono text-[0.92em]')}>
          {part.text}
        </span>
      ) : <span key={i}>{part.text}</span>)}
    </>
  )
}
