// Built-in practice pieces (public-domain melodies, simple arrangements).
import { makeSong, type Note, type Song } from './music'

const N: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
/** "E5", "D#5", "Bb3" → midi */
function m(s: string): number {
  const r = /^([A-G])([#b]?)(-?\d)$/.exec(s)!
  return (Number(r[3]) + 1) * 12 + N[r[1]] + (r[2] === '#' ? 1 : r[2] === 'b' ? -1 : 0)
}

/** "E5:1 D5:1 -:2" → notes; numbers are lengths in beats, "-" is a rest, "C4+E4" a chord. */
function seq(text: string, beat: number, track: number, start = 0, vel = 0.75): Note[] {
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

function odeToJoy(): Song {
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

function twinkle(): Song {
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

function furElise(): Song {
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

export const BUILTIN: { id: string; make: () => Song }[] = [
  { id: 'twinkle', make: twinkle },
  { id: 'ode', make: odeToJoy },
  { id: 'elise', make: furElise }
]
