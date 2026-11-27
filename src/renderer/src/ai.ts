// Local generative AI: two-hand composition, Call & Response improvisation, and practice coaching.
import { makeSong, type Note, type Song } from './music'

export type AiStyle = 'classical' | 'jazz' | 'pop' | 'hijaz' | 'cinematic'
export type AiLevel = 'easy' | 'medium' | 'rich'

export const AI_STYLES: { id: AiStyle; name: string; hint: string; bpm: number }[] = [
  { id: 'classical', name: 'קלאסי רגוע', hint: 'ארפג׳יו עדין ומנגינה זורמת', bpm: 96 },
  { id: 'jazz', name: 'ג׳אז לילי', hint: 'אקורדים מורכבים ומקצב משוחרר', bpm: 108 },
  { id: 'pop', name: 'פופ סוחף', hint: 'מהלך אקורדים מודרני ומקפיץ', bpm: 116 },
  { id: 'hijaz', name: 'מזרחי (חיג׳אז)', hint: 'סולם חיג׳אז מרגש עם בס עמוק', bpm: 92 },
  { id: 'cinematic', name: 'קולנועי', hint: 'אווירה דרמטית ומרגשת', bpm: 84 }
]

type Prog = { bass: number; chord: number[] }

const PROGRESSIONS: Record<AiStyle, { scale: number[]; progs: Prog[][] }> = {
  classical: {
    scale: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79],
    progs: [
      [
        { bass: 48, chord: [48, 52, 55] },
        { bass: 45, chord: [45, 52, 57] },
        { bass: 41, chord: [41, 48, 53] },
        { bass: 43, chord: [43, 50, 55] }
      ]
    ]
  },
  jazz: {
    scale: [60, 62, 63, 65, 67, 69, 70, 72, 74, 75, 77, 79],
    progs: [
      [
        { bass: 50, chord: [50, 53, 57, 60] }, // Dm7
        { bass: 43, chord: [43, 47, 50, 53] }, // G7
        { bass: 48, chord: [48, 52, 55, 59] }, // Cmaj7
        { bass: 45, chord: [45, 48, 52, 55] } // Am7
      ]
    ]
  },
  pop: {
    scale: [60, 62, 64, 67, 69, 72, 74, 76, 79, 81],
    progs: [
      [
        { bass: 48, chord: [48, 52, 55] }, // C
        { bass: 43, chord: [43, 47, 50] }, // G
        { bass: 45, chord: [45, 48, 52] }, // Am
        { bass: 41, chord: [41, 45, 48] } // F
      ]
    ]
  },
  hijaz: {
    scale: [62, 63, 66, 67, 69, 70, 72, 74, 75, 78, 79, 81], // D Hijaz
    progs: [
      [
        { bass: 50, chord: [50, 54, 57] }, // D
        { bass: 51, chord: [51, 55, 58] }, // Eb
        { bass: 48, chord: [48, 51, 55] }, // Cm
        { bass: 50, chord: [50, 54, 57] } // D
      ]
    ]
  },
  cinematic: {
    scale: [57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76], // A minor
    progs: [
      [
        { bass: 45, chord: [45, 52, 57] }, // Am
        { bass: 41, chord: [41, 48, 53] }, // F
        { bass: 48, chord: [48, 55, 60] }, // C
        { bass: 43, chord: [43, 50, 55] } // G
      ]
    ]
  }
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/** Generates an original two-hand piece in the selected style and difficulty. */
export function composeAiSong(style: AiStyle, bars: number, level: AiLevel): Song {
  const cfg = PROGRESSIONS[style]
  const prog = pick(cfg.progs)
  const meta = AI_STYLES.find((s) => s.id === style)!
  const beat = 60 / meta.bpm
  const notes: Note[] = []

  // Pick a starting melodic index near the middle of the scale
  let idx = Math.floor(cfg.scale.length / 2)

  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * 4 * beat + 0.35
    const harm = prog[bar % prog.length]

    // Left hand accompaniment
    if (level === 'easy') {
      notes.push({ midi: harm.bass, time: barStart, duration: beat * 3.8, velocity: 0.48, track: 1 })
    } else if (style === 'classical' || style === 'cinematic') {
      const pat = [harm.chord[0], harm.chord[1], harm.chord[2], harm.chord[1]]
      for (let i = 0; i < 4; i++) {
        notes.push({ midi: pat[i % pat.length], time: barStart + i * beat, duration: beat * 0.9, velocity: 0.45, track: 1 })
      }
    } else {
      notes.push({ midi: harm.bass, time: barStart, duration: beat * 1.8, velocity: 0.5, track: 1 })
      for (const c of harm.chord.slice(0, 3)) {
        notes.push({ midi: c, time: barStart + beat * 2, duration: beat * 1.6, velocity: 0.44, track: 1 })
      }
    }

    // Right hand melody with smooth stepwise motion + occasional chord-tone leaps
    const stepsPerBar = level === 'easy' ? 4 : level === 'medium' ? 6 : 8
    const sub = (4 * beat) / stepsPerBar
    for (let s = 0; s < stepsPerBar; s++) {
      const t = barStart + s * sub
      const isLastNote = bar === bars - 1 && s === stepsPerBar - 1
      if (!isLastNote && s > 0 && Math.random() < (level === 'easy' ? 0.2 : 0.14)) continue

      if (isLastNote) {
        // Resolve to tonic
        idx = 0
      } else {
        const delta = pick([-2, -1, -1, 0, 1, 1, 2])
        idx = Math.max(0, Math.min(cfg.scale.length - 1, idx + delta))
      }

      const midi = cfg.scale[idx]
      const dur = isLastNote ? beat * 2.5 : sub * (Math.random() < 0.25 ? 1.6 : 0.9)
      notes.push({ midi, time: t, duration: dur, velocity: 0.72 + Math.random() * 0.14, track: 0 })

      // Occasional harmony note in rich mode
      if (level === 'rich' && s === 0 && Math.random() < 0.55) {
        const harmIdx = Math.max(0, idx - 2)
        notes.push({ midi: cfg.scale[harmIdx], time: t, duration: dur, velocity: 0.56, track: 0 })
      }
    }
  }

  return makeSong(`יצירת AI · ${meta.name}`, notes, ['יד ימין', 'יד שמאל'])
}

/**
 * Given a short phrase of MIDI notes played by the user, generates a musical
 * "answer" phrase in the same register and implied scale/mode.
 */
export function generateAiReply(phrase: number[]): { midi: number; delayMs: number; durMs: number }[] {
  if (!phrase.length) return []
  const last = phrase[phrase.length - 1]
  const avg = Math.round(phrase.reduce((a, b) => a + b, 0) / phrase.length)
  // Infer pitch-class palette from user's phrase, padded with major/minor pentatonic around avg
  const pcs = [...new Set(phrase.map((m) => ((m % 12) + 12) % 12))]
  const root = ((phrase[0] % 12) + 12) % 12
  const fallback = [0, 2, 4, 7, 9].map((iv) => (root + iv) % 12)
  const palette = pcs.length >= 3 ? pcs : [...new Set([...pcs, ...fallback])]

  // Build nearby candidate pitches within +-7 semitones of average
  const candidates: number[] = []
  for (let m = Math.max(36, avg - 7); m <= Math.min(84, avg + 9); m++) {
    if (palette.includes(((m % 12) + 12) % 12)) candidates.push(m)
  }
  if (!candidates.length) return []

  const len = Math.min(6, Math.max(3, phrase.length))
  const out: { midi: number; delayMs: number; durMs: number }[] = []
  let curIdx = Math.max(
    0,
    candidates.reduce((best, m, i) => (Math.abs(m - last) < Math.abs(candidates[best] - last) ? i : best), 0)
  )

  let time = 0
  for (let i = 0; i < len; i++) {
    if (i === len - 1) {
      // Resolve back toward root or starting note
      curIdx = candidates.reduce((best, m, idx) => (Math.abs(m - phrase[0]) < Math.abs(candidates[best] - phrase[0]) ? idx : best), 0)
    } else {
      curIdx = Math.max(0, Math.min(candidates.length - 1, curIdx + pick([-2, -1, 1, 1, 2])))
    }
    const stepMs = i === len - 1 ? 360 : pick([220, 260, 320])
    out.push({ midi: candidates[curIdx], delayMs: time, durMs: stepMs * 0.88 })
    time += stepMs
  }
  return out
}
