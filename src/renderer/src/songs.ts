// Built-in practice pieces (public-domain melodies, simple arrangements).
import { makeSong, type Note, type Song } from './music'

const N: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
/** "E5", "D#5", "Bb3" → midi */
function m(s: string): number {
  const r = /^([A-G])([#b]?)(-?\d)$/.exec(s)!
  return (Number(r[3]) + 1) * 12 + N[r[1]] + (r[2] === '#' ? 1 : r[2] === 'b' ? -1 : 0)
}

/** "E5:1 D5:1 -:2" → notes; numbers are lengths in beats, "-" is a rest, "C4+E4" a chord. */
export function seq(text: string, beat: number, track: number, start = 0, vel = 0.75): Note[] {
  const out: Note[] = []
  let t = start
  for (const tok of text.trim().split(/\s+/)) {
    const [pitch, len] = tok.split(':')
    const d = Number(len ?? 1) * beat
    if (pitch !== '-') {
      for (const p of pitch.split('+')) out.push({ midi: m(p), time: t, duration: d * 0.95, velocity: vel, track })
    }
    t += d
  }
  return out
}

export function odeToJoy(): Song {
  const b = 0.45
  const rh = seq(
    `E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2
     E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2
     D4 D4 E4 C4 D4 E4:0.5 F4:0.5 E4 C4 D4 E4:0.5 F4:0.5 E4 D4 C4 D4 G3:2
     E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2`, b, 0, 0, 0.8)
  const lh = seq(
    `C3+G3:4 G2+G3:4 C3+G3:4 G2+F3:4
     C3+G3:4 G2+G3:4 C3+G3:4 G2+F3:2 C3+E3:2
     G2+G3:4 C3+G3:4 G2+G3:4 G2+F3:4
     C3+G3:4 G2+G3:4 C3+G3:4 G2+F3:2 C3+E3:2`, b, 1, 0, 0.55)
  return makeSong('אודה לשמחה – בטהובן', [...rh, ...lh])
}

export function twinkle(): Song {
  const b = 0.5
  const rh = seq(
    `C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2
     G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2
     C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2`, b, 0)
  const lh = seq(
    `C3:2 E3:2 F3:2 E3:2 D3:2 C3:2 G2:2 C3:2
     E3:2 D3:2 C3:2 G2:2 E3:2 D3:2 C3:2 G2:2
     C3:2 E3:2 F3:2 E3:2 D3:2 C3:2 G2:2 C3:2`, b, 1, 0, 0.5)
  return makeSong('כוכב קטן', [...rh, ...lh])
}

export function furElise(): Song {
  const s = 0.16 // one sixteenth
  const A = `E5 D#5 E5 D#5 E5 B4 D5 C5`
  const rh = seq(
    `E5 D#5 ${A.split(' ').slice(2).join(' ')} A4:2 - C4 E4 A4 B4:2 - E4 G#4 B4 C5:2 - E4
     ${A} A4:2 - C4 E4 A4 B4:2 - E4 C5 B4 A4:4
     ${A} A4:2 - C4 E4 A4 B4:2 - E4 G#4 B4 C5:2 - E4
     ${A} A4:2 - C4 E4 A4 B4:2 - E4 C5 B4 A4:6`, s, 0, 0, 0.7)
  const bar = 6 * s
  const start = 2 * s // bar 1 begins after the two-note pickup
  // 3/8 bars; melody-only bars ("-") have no left hand
  const lhBars = ['-', 'A', 'E', 'A', '-', 'A', 'E', 'A', '-', 'A', 'E', 'A', '-', 'A', 'E', 'A']
  const lh: Note[] = []
  lhBars.forEach((c, i) => {
    if (c === '-') return
    const pat = c === 'A' ? 'A2 E3 A3' : 'E2 E3 G#3'
    lh.push(...seq(pat, s, 1, start + i * bar, 0.5))
  })
  return makeSong('לאליזה – בטהובן', [...rh, ...lh])
}

export function yonatan(): Song {
  const b = 0.44
  const rh = seq(
    `G4 E4 E4:2 F4 D4 D4:2 C4 D4 E4 F4 G4 G4 G4:2
     G4 E4 E4:2 F4 D4 D4:2 C4 E4 G4 G4 C4:4
     D4 D4 D4 D4 D4 E4 F4:2 E4 E4 E4 E4 E4 F4 G4:2
     G4 E4 E4:2 F4 D4 D4:2 C4 E4 G4 G4 C4:4`,
    b,
    0,
    0,
    0.78
  )
  const lh = seq(
    `C3+G3:4 G2+F3:4 C3+G3:4 G2+F3:2 C3+E3:2
     C3+G3:4 G2+F3:4 C3+G3:4 C3+E3:4
     G2+F3:4 G2+F3:4 C3+E3:4 C3+G3:4
     C3+G3:4 G2+F3:4 C3+G3:4 C3+E3:4`,
    b,
    1,
    0,
    0.5
  )
  return makeSong('יונתן הקטן', [...rh, ...lh])
}

export function hatikvah(): Song {
  const b = 0.48
  const rh = seq(
    `A4 B4 C5 D5 E5:1.5 E5:0.5 E5:2
     F5 E5 F5 A5 E5:4
     D5:1.5 D5:0.5 D5:1 C5:1 B4 A4 B4 C5
     A4:1.5 A4:0.5 B4:1 C5:1 E4:4
     A5:2 A5:2 G5 F5 E5:2
     F5:1.5 G5:0.5 A5:1 G5:1 F5:2 E5:2
     D5:1.5 D5:0.5 D5:1 C5:1 B4 A4 B4 C5
     A4:1.5 A4:0.5 B4:1 G#4:1 A4:4`,
    b,
    0,
    0,
    0.78
  )
  const lh = seq(
    `A2+E3:4 A2+E3:4
     D3+A3:4 A2+E3:4
     D3+F3:4 E3+G#3:4
     A2+E3:4 E2+E3:4
     A2+E3:4 C3+G3:4
     D3+A3:4 A2+E3:4
     D3+F3:4 E3+G#3:4
     A2+E3:2 E2+E3:2 A2+E3:4`,
    b,
    1,
    0,
    0.48
  )
  return makeSong('התקווה', [...rh, ...lh])
}

export function minuetInG(): Song {
  const b = 0.42
  const rh = seq(
    `D5 G4 A4 B4 C5 D5 G4:2 G4:2
     E5 C5 D5 E5 F#5 G5 G4:2 G4:2
     C5 D5 C5 B4 A4 B4 C5 B4 A4 G4 F#4 G4 A4 B4 G4:2 A4:4
     D5 G4 A4 B4 C5 D5 G4:2 G4:2
     E5 C5 D5 E5 F#5 G5 G4:2 G4:2
     C5 D5 C5 B4 A4 B4 C5 B4 A4 G4 A4 B4 A4:1.5 G4:0.5 G4:4`,
    b,
    0,
    0,
    0.76
  )
  const lh = seq(
    `G3+B3:4 A3+D4:2 B3:4
     C4:4 B3:2 G3:4
     A3:2 F#3:2 G3:4 D3:6
     G3+B3:4 A3+D4:2 B3:4
     C4:4 B3:2 G3:4
     A3:2 F#3:2 G3:2 D3:4 G2+G3:4`,
    b,
    1,
    0,
    0.48
  )
  return makeSong('מינואט בסול – באך', [...rh, ...lh])
}

export const BUILTIN: { id: string; make: () => Song }[] = [
  { id: 'yonatan', make: yonatan },
  { id: 'twinkle', make: twinkle },
  { id: 'hatikvah', make: hatikvah },
  { id: 'ode', make: odeToJoy },
  { id: 'minuet', make: minuetInG },
  { id: 'elise', make: furElise }
]
