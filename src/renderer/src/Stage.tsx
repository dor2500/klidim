import { useEffect, useMemo, useRef } from 'react'
import { engine } from './engine'
import { codeLabel, isBlack, noteName, pianoLayout, shortNoteName } from './music'

export const TRACK_COLORS = ['#f59e0b', '#38bdf8', '#34d399', '#fb7185', '#a78bfa', '#fb923c']
const LIVE_COLOR = '#fbbf24'

type Trail = { midi: number; start: number; end: number | null }
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string }

type Props = {
  lo: number
  hi: number
  keymap: Map<string, number>
  labels: 'keys' | 'notes' | 'none'
  showNoteNames?: boolean
  visualizer?: boolean
  scaleNotes?: Set<number>
  scaleRoot?: number
}

export function Stage({ lo, hi, keymap, labels, showNoteNames = true, visualizer = true, scaleNotes, scaleRoot }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const keyEls = useRef(new Map<number, HTMLDivElement>())
  const trails = useRef<Trail[]>([])
  const sparks = useRef<Spark[]>([])
  const { keys, whites } = useMemo(() => pianoLayout(lo, hi), [lo, hi])
  const keyAt = useMemo(() => new Map(keys.map((k) => [k.midi, k])), [keys])

  const keyLabel = useMemo(() => {
    const byNote = new Map<number, string>()
    // rows overlap; the map lists the top row first, so each octave is labeled by the
    // row that starts on its דו
    for (const [code, m] of keymap) if (!byNote.has(m)) byNote.set(m, codeLabel(code))
    // black keys: Shift + the white key below
    for (const [m, l] of [...byNote]) if (isBlack(m + 1) && !byNote.has(m + 1)) byNote.set(m + 1, `⇧${l}`)
    return byNote
  }, [keymap])

  // live notes → key highlight + rising trails + hit sparks
  useEffect(
    () =>
      engine.onLive((m, on) => {
        keyEls.current.get(m)?.classList.toggle('live', on)
        const now = performance.now() / 1000
        if (on) {
          trails.current.push({ midi: m, start: now, end: null })
          const cv = canvasRef.current
          const k = keyAt.get(m)
          if (cv && k) {
            const unit = cv.clientWidth / whites
            const cx = (k.x + k.w / 2) * unit
            const cy = cv.clientHeight - 2
            for (let i = 0; i < 6; i++) {
              const angle = -Math.PI * (0.15 + Math.random() * 0.7)
              const speed = 35 + Math.random() * 75
              sparks.current.push({
                x: cx + (Math.random() - 0.5) * k.w * unit * 0.5,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                color: LIVE_COLOR
              })
            }
          }
        } else {
          for (const t of trails.current) if (t.midi === m && t.end === null) t.end = now
        }
      }),
    [keyAt, whites]
  )

  // draw loop
  useEffect(() => {
    const cv = canvasRef.current!
    const ctx = cv.getContext('2d')!
    let raf = 0
    let lastTs = performance.now()
    let lastSongKeys = new Map<number, number>()
    let lastExpected = new Set<number>()

    const frame = (ts: number): void => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (ts - lastTs) / 1000)
      lastTs = ts
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

      // subtle black-key lane shading + octave C guide lines
      for (const k of keys) {
        if (k.black) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
          ctx.fillRect(k.x * unit, 0, k.w * unit, H)
        }
        if (k.midi % 12 === 0) {
          ctx.fillStyle = 'rgba(229, 169, 60, 0.08)'
          ctx.fillRect(Math.round(k.x * unit), 0, 1, H)
        }
      }

      // song notes falling toward the keys
      const song = engine.song
      const songKeys = new Map<number, number>()
      if (song) {
        const t = engine.time
        const ahead = H / pps

        // subtle beat grid lines scrolling down
        ctx.fillStyle = 'rgba(255, 255, 255, 0.025)'
        const beatSec = 0.5
        const firstBeat = Math.floor(t / beatSec) * beatSec
        for (let b = firstBeat; b <= t + ahead; b += beatSec) {
          const y = H - (b - t) * pps
          if (y >= 0 && y <= H) ctx.fillRect(0, Math.round(y), W, 1)
        }

        for (const n of song.notes) {
          if (n.time > t + ahead) break
          if (n.time + n.duration < t - 0.05) continue
          const k = keyAt.get(n.midi)
          if (!k) continue
          const muted = engine.muted.has(n.track)
          const yBottom = H - (n.time - t) * pps
          const yTop = yBottom - n.duration * pps
          const held = engine.waiting && n.time >= t - 0.001
          const active = engine.playing && !held && n.time <= t && t < n.time + n.duration
          const mine = engine.learn && engine.practice.has(n.track)
          if (active && !muted && !mine) songKeys.set(n.midi, n.track)

          const x = k.x * unit + 1.5
          const w = Math.max(4, k.w * unit - 3)
          const h = Math.max(8, yBottom - yTop)
          const color = TRACK_COLORS[n.track % TRACK_COLORS.length]

          ctx.globalAlpha = muted ? 0.16 : active ? 1 : 0.88
          if (active && !muted) {
            ctx.shadowColor = color
            ctx.shadowBlur = 18
          }
          ctx.fillStyle = color
          roundRect(ctx, x, yTop, w, h, Math.min(7, w / 2))
          ctx.fill()
          ctx.shadowBlur = 0

          // inner highlight rim on note bar
          if (!muted && h > 10) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
            roundRect(ctx, x + 1.5, yTop + 1.5, Math.max(2, w - 3), Math.min(5, h - 3), 3)
            ctx.fill()
          }

          // note name inside falling bar when wide & tall enough
          if (showNoteNames && !muted && w >= 18 && h >= 20) {
            ctx.fillStyle = 'rgba(11, 12, 16, 0.85)'
            ctx.font = `700 ${Math.min(11, Math.floor(w * 0.48))}px "Rubik Variable", sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            const cy = Math.min(yBottom - 10, yTop + h / 2)
            if (cy > 8 && cy < H - 6) ctx.fillText(shortNoteName(n.midi), x + w / 2, cy)
          }
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
        const x = k.x * unit + 2
        const w = Math.max(4, k.w * unit - 4)
        const g = ctx.createLinearGradient(0, yTop, 0, yBottom)
        g.addColorStop(0, 'rgba(251, 191, 36, 0)')
        g.addColorStop(0.7, 'rgba(251, 191, 36, 0.45)')
        g.addColorStop(1, LIVE_COLOR)
        ctx.fillStyle = g
        roundRect(ctx, x, Math.max(yTop, -10), w, Math.max(4, yBottom - Math.max(yTop, -10)), Math.min(7, w / 2))
        ctx.fill()
      }

      // hit sparks
      sparks.current = sparks.current.filter((s) => s.life > 0.04)
      for (const s of sparks.current) {
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.vy += 120 * dt
        s.life -= dt * 2.2
        ctx.globalAlpha = Math.max(0, s.life)
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(s.x, s.y, 2.2 * s.life + 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // warm brass horizon glow where notes meet the keybed
      const glow = ctx.createLinearGradient(0, H - 28, 0, H)
      glow.addColorStop(0, 'rgba(229, 169, 60, 0)')
      glow.addColorStop(1, 'rgba(229, 169, 60, 0.24)')
      ctx.fillStyle = glow
      ctx.fillRect(0, H - 28, W, 28)

      // live audio waveform ribbon
      if (visualizer) {
        const wave = engine.getWaveform()
        if (wave && wave.length > 1) {
          let peak = 0
          for (let i = 0; i < wave.length; i++) peak = Math.max(peak, Math.abs(wave[i]))
          if (peak > 0.003) {
            ctx.beginPath()
            for (let i = 0; i < wave.length; i++) {
              const x = (i / (wave.length - 1)) * W
              const y = H - 14 + wave[i] * 38
              if (i === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            }
            ctx.strokeStyle = `rgba(245, 196, 105, ${Math.min(0.65, peak * 3.2)})`
            ctx.lineWidth = 2
            ctx.stroke()
          }
        }
      }

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

      // teacher: the keys to press next
      const exp = new Set(engine.playing ? engine.expected : [])
      for (const m of exp) if (!lastExpected.has(m)) keyEls.current.get(m)?.classList.add('expect')
      for (const m of lastExpected) if (!exp.has(m)) keyEls.current.get(m)?.classList.remove('expect')
      lastExpected = exp
      if (exp.size) {
        const pulse = 0.55 + 0.45 * Math.sin(ts / 160)
        for (const m of exp) {
          const k = keyAt.get(m)
          if (!k) continue
          const x = k.x * unit + (k.w * unit) / 2
          // subtle guide beam
          const beam = ctx.createLinearGradient(0, 0, 0, H)
          beam.addColorStop(0, 'rgba(251, 191, 36, 0)')
          beam.addColorStop(1, `rgba(251, 191, 36, ${engine.waiting ? 0.14 * pulse : 0.06})`)
          ctx.fillStyle = beam
          ctx.fillRect(k.x * unit, 0, k.w * unit, H)

          // glowing marker triangle above the key
          ctx.globalAlpha = engine.waiting ? pulse : 0.55
          ctx.fillStyle = '#fbbf24'
          ctx.beginPath()
          ctx.moveTo(x - 9, H - 30)
          ctx.lineTo(x + 9, H - 30)
          ctx.lineTo(x, H - 15)
          ctx.closePath()
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [keyAt, keys, showNoteNames, visualizer, whites])

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
      <div className="keybed-felt" aria-hidden />
      <div className="piano" dir="ltr">
        {keys.map((k) => {
          const label = labels === 'keys' ? keyLabel.get(k.midi) : labels === 'notes' ? shortNoteName(k.midi) : undefined
          const pc = k.midi % 12
          const inScale = scaleNotes && scaleNotes.size > 0 && scaleNotes.has(pc)
          const isRoot = inScale && scaleRoot === pc
          return (
            <div
              key={k.midi}
              ref={(el) => {
                if (el) keyEls.current.set(k.midi, el)
                else keyEls.current.delete(k.midi)
              }}
              className={`${k.black ? 'key black' : 'key white'}${inScale ? ' in-scale' : ''}${isRoot ? ' scale-root' : ''}`}
              style={{ left: `${(k.x / whites) * 100}%`, width: `${(k.w / whites) * 100}%` }}
              onPointerDown={(e) => press(k.midi, e)}
              onPointerEnter={() => enter(k.midi)}
              title={noteName(k.midi)}
            >
              {inScale && <span className="scale-dot" aria-hidden />}
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
