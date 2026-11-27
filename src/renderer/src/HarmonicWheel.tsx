import { engine } from './engine'

// Circle of fifths order (pitch class 0..11)
const FIFTHS: { pc: number; he: string }[] = [
  { pc: 0, he: 'דו' },
  { pc: 7, he: 'סול' },
  { pc: 2, he: 'רה' },
  { pc: 9, he: 'לה' },
  { pc: 4, he: 'מי' },
  { pc: 11, he: 'סי' },
  { pc: 6, he: 'פה♯' },
  { pc: 1, he: 'דו♯' },
  { pc: 8, he: 'לה♭' },
  { pc: 3, he: 'מי♭' },
  { pc: 10, he: 'סי♭' },
  { pc: 5, he: 'פה' }
]

export function HarmonicWheel({ activeNotes }: { activeNotes: number[] }): React.JSX.Element {
  const activePcs = new Set(activeNotes.map((m) => ((m % 12) + 12) % 12))
  const cx = 80
  const cy = 80
  const rOuter = 64
  const rInner = 34

  const points = FIFTHS.map((item, i) => {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2
    return {
      ...item,
      x: cx + Math.cos(angle) * rOuter,
      y: cy + Math.sin(angle) * rOuter,
      ix: cx + Math.cos(angle) * rInner,
      iy: cy + Math.sin(angle) * rInner
    }
  })

  const activePts = points.filter((p) => activePcs.has(p.pc))

  const playChord = (pc: number, minor: boolean): void => {
    const root = 60 + pc
    const notes = [root, root + (minor ? 3 : 4), root + 7]
    for (const m of notes) engine.noteOn(m, 0.72)
    window.setTimeout(() => {
      for (const m of notes) engine.noteOff(m)
    }, 520)
  }

  return (
    <div className="wheel-hud" title="מעגל הקווינטות החי — לחצו על צליל לניגון אקורד">
      <svg viewBox="0 0 160 160" width="152" height="152">
        <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={rInner} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        {activePts.length >= 2 && (
          <polygon
            points={activePts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="rgba(229, 169, 60, 0.16)"
            stroke="rgba(245, 196, 105, 0.85)"
            strokeWidth="1.6"
          />
        )}
        {points.map((p) => {
          const on = activePcs.has(p.pc)
          return (
            <g
              key={p.pc}
              className={`wheel-node ${on ? 'on' : ''}`}
              onClick={(e) => playChord(p.pc, e.shiftKey)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={on ? 12 : 10}
                fill={on ? '#e5a93c' : '#181b26'}
                stroke={on ? '#fde68a' : 'rgba(255,255,255,0.16)'}
                strokeWidth={on ? 1.8 : 1}
              />
              <text
                x={p.x}
                y={p.y + 0.5}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="8.5"
                fontWeight={on ? 800 : 600}
                fill={on ? '#161108' : '#d6d3cd'}
              >
                {p.he}
              </text>
            </g>
          )
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="8" fill="#76736d" fontWeight="600">
          מעגל
        </text>
        <text x={cx} y={cy + 7} textAnchor="middle" fontSize="8" fill="#76736d" fontWeight="600">
          הקווינטות
        </text>
      </svg>
    </div>
  )
}
