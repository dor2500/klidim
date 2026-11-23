// Pure music helpers: note names, keyboard map, piano geometry.

export type Note = { midi: number; time: number; duration: number; velocity: number; track: number }
export type Track = { name: string; count: number }
export type Song = { name: string; notes: Note[]; duration: number; tracks: Track[] }

const HE_NAMES = ['דו', 'דו♯', 'רה', 'רה♯', 'מי', 'פה', 'פה♯', 'סול', 'סול♯', 'לה', 'לה♯', 'סי']
export const noteName = (m: number): string => `${HE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`
export const isBlack = (m: number): boolean => [1, 3, 6, 8, 10].includes(m % 12)

export const PIANO_MIN = 21 // A0
export const PIANO_MAX = 108 // C8

// ---------- computer keyboard → notes (physical keys, so it works with a Hebrew layout too) ----------
// Keyboard order: every row is a run of white keys rising left to right, and each row
// starts one octave above the row below it (Z row → A row → Q row → number row).
// Shift + key plays the black key just above it.
const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23]
export const KEY_ROWS: { codes: string[]; octave: number }[] = [
  { codes: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'], octave: 3 },
  { codes: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'], octave: 2 },
  { codes: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'], octave: 1 },
  { codes: ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'], octave: 0 }
]

/** White-key map (code → midi). octave 0 puts the Z row on C2 and the number row on C5. */
export function buildKeymap(octave: number, transpose: number): Map<string, number> {
  const base = 36 + octave * 12 + transpose
  const map = new Map<string, number>()
  for (const row of KEY_ROWS) {
    row.codes.forEach((c, i) => map.set(c, base + row.octave * 12 + WHITE_STEPS[i]))
  }
  for (const [c, m] of map) if (m < PIANO_MIN || m > PIANO_MAX) map.delete(c)
  return map
}

/** The note a key plays, with Shift raising it to the black key when there is one. */
export function keyNote(base: number, shift: boolean): number {
  return shift && isBlack(base + 1) ? base + 1 : base
}

const PUNCT: Record<string, string> = {
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-'
}
export const codeLabel = (code: string): string =>
  code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : PUNCT[code] ?? code

// ---------- piano geometry (shared by the keys and the waterfall) ----------
export type KeyRect = { midi: number; x: number; w: number; black: boolean }

/** Geometry in units where one white key = 1. */
export function pianoLayout(lo: number, hi: number): { keys: KeyRect[]; whites: number } {
  const keys: KeyRect[] = []
  let wi = 0
  for (let m = lo; m <= hi; m++) {
    if (isBlack(m)) keys.push({ midi: m, x: wi - 0.31, w: 0.62, black: true })
    else keys.push({ midi: m, x: wi++, w: 1, black: false })
  }
  return { keys, whites: wi }
}

/** Visible range: always C2–C7, widened to fit the keyboard map and the song. */
export function pianoRange(extra: number[]): [number, number] {
  let lo = 36
  let hi = 96
  for (const m of extra) {
    if (m < lo) lo = m
    if (m > hi) hi = m
  }
  lo = Math.max(PIANO_MIN, lo - (lo % 12)) // start on a C (or A0)
  hi = Math.min(PIANO_MAX, hi + ((12 - (hi % 12)) % 12)) // end on a C
  return [lo, hi]
}

export const fmtTime = (s: number): string => {
  s = Math.max(0, Math.floor(s))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function makeSong(name: string, notes: Note[], trackNames?: string[]): Song {
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi)
  const ids = [...new Set(notes.map((n) => n.track))].sort((a, b) => a - b)
  const remap = new Map(ids.map((t, i) => [t, i]))
  for (const n of notes) n.track = remap.get(n.track)!
  const tracks = ids.map((t, i) => ({
    name: trackNames?.[t] || defaultTrackName(i, ids.length),
    count: notes.filter((n) => n.track === i).length
  }))
  const duration = notes.reduce((d, n) => Math.max(d, n.time + n.duration), 0)
  return { name, notes, duration, tracks }
}

function defaultTrackName(i: number, total: number): string {
  if (total === 2) return i === 0 ? 'יד ימין' : 'יד שמאל'
  return `ערוץ ${i + 1}`
}
