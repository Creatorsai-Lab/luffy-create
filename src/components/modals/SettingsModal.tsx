import { useEffect } from 'react'
import { ArrowUpRight, AudioLines, Github, Heart, HeartHandshake, MessageSquareHeart, Settings, Sparkles, Sprout, Star, X } from 'lucide-react'
import luffyLogo from '/images/luffy_create_logo.webp'
import { cn } from '../../utils/cn'

/** Creators AI Lab's other products. An empty url shows the button as "coming soon". */
const PRODUCTS = [
  { name: 'Audio Augment Studio', icon: AudioLines, url: 'https://audio-augment.vercel.app/editor', cta: 'Try it now',
    desc: 'Make every recording sound studio-made — clean up, enhance and shape voice and sound in minutes.' },
  { name: 'Cupid Agents', icon: HeartHandshake, url: '', cta: 'Meet the agents',
    desc: 'AI agents that play matchmaker — finding and connecting you with the right people.' },
  { name: 'Organic Marketing Copilot', icon: Sprout, url: '', cta: 'Grow organically',
    desc: 'Grow without ad spend: an AI copilot that plans and writes organic content your audience shares.' },
]
const DONATE_URL = ''
/** Where feedback goes — GitHub issues for now; swap in the feedback form page when it is ready. */
const FEEDBACK_URL = 'https://github.com/Creatorsai-Lab/luffy-create/issues'

const open = (url: string) => { if (url) void window.api.shell.openExternal(url) }

/** Settings: about Luffy Create, Creators AI Lab's other products, and support. */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex flex-col overflow-hidden border border-editor-border bg-editor-panel rounded-2xl" style={{ width: '92vw', height: '90vh' }}>
        <header className="flex flex-none items-center gap-2 border-b border-editor-border px-4 py-2.5">
          <Settings size={15} className="text-editor-accent" />
          <h2 className="text-base font-semibold text-editor-text">Settings</h2>
          <button type="button" onClick={onClose} title="Close (Esc)" className="ml-auto rounded p-1 text-editor-text-secondary hover:bg-white/5 hover:text-editor-text">
            <X size={15} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto flex max-w-5xl flex-col gap-8 py-4">
            {/* About */}
            <section className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <img src={luffyLogo} alt="" className="h-12 w-12 flex-none rounded-lg object-cover" />
                <div>
                  <h3 className="text-xl font-semibold text-editor-text">Luffy Create</h3>
                  <p className="text-sm text-editor-text-secondary">The free, open-source AI video editor for creators.</p>
                </div>
              </div>
              <p className="text-base leading-relaxed text-editor-text-secondary">
                Luffy Create is a fast, lightweight editor for making videos that explain, teach and grab attention — from ML
                diagrams, code walkthroughs and system-design animations to talking-head and cinematic edits. Our goal is
                simple: make it the best editing app for <span className="text-editor-text">animations, transitions and effects</span>.
              </p>
              <div className="rounded-xl border border-editor-border bg-editor-elevated-highlight p-4">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-editor-text">
                  <Sparkles size={13} className="text-editor-accent" /> Why we built it
                </h4>
                <p className="mt-2 text-base leading-relaxed text-editor-text-secondary">
                  Creators shouldn't need a heavy, expensive pro suite — or a week of learning — to turn an idea into a
                  polished video. We wanted one place where you animate, cut, caption and export with frame-accurate
                  control, where the AI does the busy work on your own computer, and where it all stays free.
                </p>
              </div>
              <p className="text-base leading-relaxed text-editor-text-secondary">
                Luffy Create is made by <span className="font-medium text-editor-text">Creators AI Lab</span>, founded by{' '}
                <span className="font-medium text-editor-text">Adya Prasad</span>.
              </p>
            </section>

            {/* Feedback: a preview of the form — the whole card opens the real one in the browser. */}
            <section className="flex flex-col gap-3">
              <h3 className="flex items-center gap-1.5 text-lg font-semibold text-editor-text">
                <MessageSquareHeart size={17} className="text-editor-accent" /> Tell us what you think
              </h3>
              <div role="link" tabIndex={0} onClick={() => open(FEEDBACK_URL)} title="Opens the feedback page in your browser"
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(FEEDBACK_URL) } }}
                className="group flex w-full cursor-pointer flex-col gap-3 rounded-xl border border-editor-border bg-editor-elevated-highlight p-5 text-left outline-none transition-colors hover:border-editor-accent/70 focus-visible:border-editor-accent">
                <p className="text-sm leading-relaxed text-editor-text-secondary">
                  Found a bug, missing a feature, or just loving it? Every note is read — and the best ideas ship in the next update.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <DemoField label="Name" placeholder="Your name" />
                  <DemoField label="Email" placeholder="you@example.com (optional)" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-editor-text-secondary">How's Luffy Create so far?</span>
                  <span className="flex gap-1">
                    {[0, 1, 2, 3, 4].map(n => <Star key={n} size={16} className={n < 4 ? 'fill-amber-400 text-amber-400' : 'text-editor-text-secondary'} />)}
                  </span>
                </div>
                <DemoField label="Your feedback" placeholder="What should we build, fix or improve next?" tall />
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-editor-text-secondary group-hover:text-editor-text">
                    <Github size={13} className="flex-none" /> github.com/Creatorsai-Lab/luffy-create
                  </span>
                  <span style={{ '--cta-delay': '0.8s' } as React.CSSProperties}
                    className="cta-shine cta-glow flex flex-none items-center gap-1 whitespace-nowrap rounded-lg bg-editor-accent px-4 py-2 text-sm font-medium text-white transition-colors group-hover:bg-editor-accent-hover">
                    Share feedback <ArrowUpRight size={14} className="cta-nudge" />
                  </span>
                </div>
              </div>
            </section>

            {/* Other products */}
            <section className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold text-editor-text">Try other cool products from <em>Creators AI Lab</em></h3>
              {PRODUCTS.map(({ name, icon: Icon, url, cta, desc }, i) => (
                <div key={name} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-gray-200 bg-white p-6 transition-colors hover:border-editor-accent/60">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-editor-accent/15 text-editor-accent"><Icon size={17} /></span>
                    <div className="min-w-0">
                      <h4 className="text-orange-500 font-semibold text-editor-text">{name}</h4>
                      <p className="mt-0.5 text-sm leading-relaxed text-editor-text-secondary">{desc}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => open(url)} disabled={!url} title={url ? undefined : 'Link coming soon'}
                    // Live buttons loop for attention, each a little after the one above; "Coming soon" stays still.
                    style={url ? { '--cta-delay': `${i * 0.4}s` } as React.CSSProperties : undefined}
                    className={cn('flex flex-none items-center gap-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
                      url ? 'cta-shine cta-glow bg-editor-accent hover:bg-editor-accent-hover' : 'cursor-default bg-editor-accent/40')}>
                    {url ? cta : 'Coming soon'} {url && <ArrowUpRight size={14} className="cta-nudge" />}
                  </button>
                </div>
              ))}
            </section>

            {/* Support */}
            <section className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-pink-500/30 bg-gradient-to-r from-pink-500/10 to-editor-accent/10 p-5">
              <div>
                <h3 className="flex items-center gap-1.5 text-lg font-semibold text-editor-text">
                  <Heart size={16} className="fill-pink-500 text-pink-500" /> Love Luffy? Please DONATE Us!
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-editor-text-secondary">
                  Luffy Create is free and open source: no subscription, no watermark, no data leak, most work with no internet. If it saved you an evening of
                  editing, please help us to keep it alive. Chip in: every bit buys build time for more cool tools for creators.
                </p>
              </div>
              <button type="button" onClick={() => open(DONATE_URL)} disabled={!DONATE_URL} title={DONATE_URL ? undefined : 'Link coming soon'}
                style={DONATE_URL ? { '--cta-glow': 'rgba(236, 72, 153, 0.55)' } as React.CSSProperties : undefined}
                className={cn('flex flex-none items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 transition-colors',
                  DONATE_URL ? 'cta-shine cta-glow bg-pink-600 hover:bg-pink-500' : 'cursor-default bg-pink-600/50')}>
                <Heart size={14} className={cn('fill-white', DONATE_URL && 'cta-heartbeat')} /> {DONATE_URL ? 'Fuel the next feature' : 'Coming soon'}
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A form field look-alike for the feedback preview (not typed into; the real form opens in the browser). */
function DemoField({ label, placeholder, tall }: { label: string; placeholder: string; tall?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-editor-text-secondary">{label}</span>
      <span className={cn('rounded-lg border border-editor-border bg-editor-panel px-3 py-2 text-sm text-editor-text-secondary/70', tall && 'h-20')}>
        {placeholder}
      </span>
    </div>
  )
}
