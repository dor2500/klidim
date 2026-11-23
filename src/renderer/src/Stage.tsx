import { useEffect, useMemo, useRef } from 'react'
import { engine } from './engine'
import { codeLabel, isBlack, noteName, pianoLayout } from './music'

export const TRACK_COLORS = ['#8b7cf6', '#22d3ee', '#f472b6', '#fbbf24', '#34d399', '#fb923c']
const LIVE_COLOR = '#a5b4fc'

type Trail = { midi: number; start: number; end: number | null }

type Props = {
  lo: number
  hi: number
  keymap: Map<string, number>
  labels: 'keys' | 'notes' | 'none'
}

export function Stage({ lo, hi, keymap, labels }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const keyEls = useRef(new Map<number, HTMLDivElement>())
  const trails = useRef<Trail[]>([])
  const { keys, whites } = useMemo(() => pianoLayout(lo, hi), [lo, hi])

  const keyLabel = useMemo(() => {
    const byNote = new Map<number, string>()
    // rows overlap; the map lists the top row first, so each octave is labeled by the
    // row that starts on its דו
    for (const [code, m] of keymap) if (!byNote.has(m)) byNote.set(m, codeLabel(code))
    // black keys: Shift + the white key below
    for (const [m, l] of [...byNote]) if (isBlack(m + 1) && !byNote.has(m + 1)) byNote.set(m + 1, `⇧${l}`)
    return byNote
  }, [keymap])

  // live notes → key highlight + rising trails
  useEffect(
    () =>
      engine.onLive((m, on) => {
        keyEls.current.get(m)?.classList.toggle('live', on)
        const now = performance.now() / 1000
        if (on) trails.current.push({ midi: m, start: now, end: null })
        else for (const t of trails.current) if (t.midi === m && t.end === null) t.end = now
      }),
    []
  )

  // draw loop
  useEffect(() => {
    const cv = canvasRef.current!
    const ctx = cv.getContext('2d')!
    const keyAt = new Map(keys.map((k) => [k.midi, k]))
    let raf = 0
    let lastSongKeys = new Map<number, number>()

    const frame = (): void => {
      raf = requestAnimationFrame(frame)
      const dpr = window.devicePixelRatio || 1
      const W = cv.clientWidth
      const H = cv.clientHeight
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr)
        cv.height = Math.round(H * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const unit = W / whites
      const pps = Math.max(120, H / 3.2) // pixels per second

      // octave guide lines on every C
      ctx.fillStyle = 'rgba(148,163,255,0.06)'
      for (const k of keys) if (k.midi % 12 === 0) ctx.fillRect(Math.round(k.x * unit), 0, 1, H)

      // song notes falling toward the keys
      const song = engine.song
      const songKeys = new Map<number, number>()
      if (song) {
        const t = engine.time
        const ahead = H / pps
        for (const n of song.notes) {
          if (n.time > t + ahead) break
          if (n.time + n.duration < t - 0.05) continue
          const k = keyAt.get(n.midi)
          if (!k) continue
          const muted = engine.muted.has(n.track)
          const yBottom = H - (n.time - t) * pps
          const yTop = yBottom - n.duration * pps
          const active = engine.playing && n.time <= t && t < n.time + n.duration
          if (active && !muted) songKeys.set(n.midi, n.track)
          const x = k.x * unit + 1.5
          const w = k.w * unit - 3
          const color = TRACK_COLORS[n.track % TRACK_COLORS.length]
          ctx.globalAlpha = muted ? 0.18 : active ? 1 : 0.85
          if (active && !muted) {
            ctx.shadowColor = color
            ctx.shadowBlur = 18
          }
          ctx.fillStyle = color
          roundRect(ctx, x, yTop, w, Math.max(6, yBottom - yTop), Math.min(7, w / 2))
          ctx.fill()
          ctx.shadowBlur = 0
          ctx.globalAlpha = 1
        }
      }

      // live trails rising from the keys
      const now = performance.now() / 1000
      trails.current = trails.current.filter((tr) => tr.end === null || H - (now - tr.end) * pps * 0.9 > -20)
      for (const tr of trails.current) {
        const k = keyAt.get(tr.midi)
        if (!k) continue
        const yTop = H - (now - tr.start) * pps * 0.9
        const yBottom = tr.end === null ? H : H - (now - tr.end) * pps * 0.9
        const x = k.x * unit + 1.5
        const w = k.w * unit - 3
        const g = ctx.createLinearGradient(0, yTop, 0, yBottom)
        g.addColorStop(0, 'rgba(165,180,252,0)')
        g.addColorStop(1, LIVE_COLOR)
        ctx.fillStyle = g
        roundRect(ctx, x, Math.max(yTop, -10), w, Math.max(4, yBottom - Math.max(yTop, -10)), Math.min(7, w / 2))
        ctx.fill()
      }

      // glow line where notes meet the keys
      const glow = ctx.createLinearGradient(0, H - 26, 0, H)
      glow.addColorStop(0, 'rgba(139,124,246,0)')
      glow.addColorStop(1, 'rgba(139,124,246,0.35)')
      ctx.fillStyle = glow
      ctx.fillRect(0, H - 26, W, 26)

      // song highlight on the keys (only touch the DOM when it changes)
      for (const [m, tr] of songKeys) {
        if (lastSongKeys.get(m) !== tr) {
          const el = keyEls.current.get(m)
          if (el) {
            el.classList.add('song')
            el.style.setProperty('--hit', TRACK_COLORS[tr % TRACK_COLORS.length])
          }
        }
      }
      for (const m of lastSongKeys.keys()) if (!songKeys.has(m)) keyEls.current.get(m)?.classList.remove('song')
      lastSongKeys = songKeys
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [keys, whites])

  // mouse / touch playing with glissando
  const down = useRef<number | null>(null)
  useEffect(() => {
    const up = (): void => {
      if (down.current !== null) engine.noteOff(down.current)
      down.current = null
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('blur', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('blur', up)
    }
  }, [])
  const press = (m: number, e: React.PointerEvent): void => {
    e.preventDefault()
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    down.current = m
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const depth = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    engine.noteOn(m, 0.45 + depth * 0.45)
  }
  const enter = (m: number): void => {
    if (down.current === null || down.current === m) return
    engine.noteOff(down.current)
    down.current = m
    engine.noteOn(m, 0.7)
  }

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="falls" />
      <div className="piano" dir="ltr">
        {keys.map((k) => {
          const label = labels === 'keys' ? keyLabel.get(k.midi) : labels === 'notes' ? noteName(k.midi).replace(/\d+$/, '') : undefined
          return (
            <div
              key={k.midi}
              ref={(el) => {
                if (el) keyEls.current.set(k.midi, el)
                else keyEls.current.delete(k.midi)
              }}
              className={k.black ? 'key black' : 'key white'}
              style={{ left: `${(k.x / whites) * 100}%`, width: `${(k.w / whites) * 100}%` }}
              onPointerDown={(e) => press(k.midi, e)}
              onPointerEnter={() => enter(k.midi)}
              title={noteName(k.midi)}
            >
              {label && <span className="lbl">{label}</span>}
              {!k.black && k.midi % 12 === 0 && <span className="oct">{noteName(k.midi)}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
