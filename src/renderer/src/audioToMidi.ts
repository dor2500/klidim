// Offline MP3/WAV/OGG/M4A -> MIDI converter using Web Audio decoding + a 61-note Goertzel pitch bank.
import { makeSong, type Note, type Song } from './music'

const MIDI_LO = 36 // C2
const MIDI_HI = 96 // C7
const COUNT = MIDI_HI - MIDI_LO + 1

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

/** Downmixes an AudioBuffer to mono Float32Array. */
function toMono(buf: AudioBuffer): Float32Array {
  const len = buf.length
  const out = new Float32Array(len)
  const chs = buf.numberOfChannels
  for (let c = 0; c < chs; c++) {
    const data = buf.getChannelData(c)
    for (let i = 0; i < len; i++) out[i] += data[i] / chs
  }
  return out
}

/** Goertzel magnitude for a target frequency over a Hann-windowed frame. */
function goertzelMag(samples: Float32Array, start: number, win: number, coeff: number): number {
  let s0 = 0
  let s1 = 0
  let s2 = 0
  const end = start + win
  for (let i = start; i < end; i++) {
    // Hann window
    const n = i - start
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (win - 1)))
    s0 = samples[i] * w + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2
  return Math.sqrt(Math.max(0, power)) / (win * 0.5)
}

export async function songFromAudio(name: string, data: ArrayBuffer): Promise<Song> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AudioCtx()
  let audio: AudioBuffer
  try {
    audio = await ctx.decodeAudioData(data.slice(0))
  } finally {
    await ctx.close().catch(() => {})
  }

  const sr = audio.sampleRate
  const mono = toMono(audio)
  // Cap analysis at 4 minutes so huge files stay snappy
  const maxSamples = Math.min(mono.length, sr * 240)
  const win = 2048
  const hop = Math.round(sr * 0.045) // ~45ms per frame

  // Precompute Goertzel coefficients for MIDI 36..96
  const coeffs = new Float32Array(COUNT)
  for (let i = 0; i < COUNT; i++) {
    const f = midiToFreq(MIDI_LO + i)
    const omega = (2 * Math.PI * f) / sr
    coeffs[i] = 2 * Math.cos(omega)
  }

  const frames: { time: number; rms: number; active: number[] }[] = []
  const mags = new Float32Array(COUNT)

  for (let pos = 0; pos + win <= maxSamples; pos += hop) {
    let sumSq = 0
    for (let i = pos; i < pos + win; i++) sumSq += mono[i] * mono[i]
    const rms = Math.sqrt(sumSq / win)
    const time = pos / sr

    if (rms < 0.012) {
      frames.push({ time, rms, active: [] })
      continue
    }

    let maxMag = 0
    for (let i = 0; i < COUNT; i++) {
      const m = goertzelMag(mono, pos, win, coeffs[i])
      mags[i] = m
      if (m > maxMag) maxMag = m
    }

    if (maxMag < 0.008) {
      frames.push({ time, rms, active: [] })
      continue
    }

    // Harmonic-bleed suppression (octave & twelfth)
    const clean = new Float32Array(mags)
    for (let i = 0; i < COUNT; i++) {
      if (i + 12 < COUNT) clean[i + 12] = Math.max(0, clean[i + 12] - mags[i] * 0.55)
      if (i + 19 < COUNT) clean[i + 19] = Math.max(0, clean[i + 19] - mags[i] * 0.35)
    }

    // Pick up to 3 strongest distinct peaks above threshold
    const thresh = Math.max(0.01, maxMag * 0.36)
    const peaks: { idx: number; val: number }[] = []
    for (let i = 0; i < COUNT; i++) {
      const v = clean[i]
      if (v < thresh) continue
      const prev = i > 0 ? clean[i - 1] : 0
      const next = i < COUNT - 1 ? clean[i + 1] : 0
      if (v >= prev && v >= next) peaks.push({ idx: i, val: v })
    }
    peaks.sort((a, b) => b.val - a.val)
    const active = peaks.slice(0, 3).map((p) => MIDI_LO + p.idx)
    frames.push({ time, rms, active })
  }

  // Convert frame activations into merged Note events
  const frameDur = hop / sr
  const open = new Map<number, { start: number; lastSeen: number; rmsSum: number; count: number }>()
  const notes: Note[] = []

  const closeNote = (midi: number, st: { start: number; lastSeen: number; rmsSum: number; count: number }): void => {
    const dur = st.lastSeen - st.start + frameDur
    if (dur < 0.07) return
    const avgRms = st.rmsSum / st.count
    const vel = Math.min(0.95, Math.max(0.35, avgRms * 4.2))
    notes.push({
      midi,
      time: st.start + 0.3,
      duration: Math.min(4, dur),
      velocity: vel,
      track: midi >= 60 ? 0 : 1
    })
  }

  for (const f of frames) {
    const set = new Set(f.active)
    for (const [m, st] of [...open]) {
      if (!set.has(m) && f.time - st.lastSeen > frameDur * 1.6) {
        closeNote(m, st)
        open.delete(m)
      }
    }
    for (const m of set) {
      const cur = open.get(m)
      if (cur) {
        cur.lastSeen = f.time
        cur.rmsSum += f.rms
        cur.count++
      } else {
        open.set(m, { start: f.time, lastSeen: f.time, rmsSum: f.rms, count: 1 })
      }
    }
  }
  for (const [m, st] of open) closeNote(m, st)

  if (!notes.length) throw new Error('לא זוהו צלילים ברורים בקובץ האודיו')
  const cleanName = name.replace(/\.(mp3|wav|ogg|m4a|flac|aac)$/i, '')
  return makeSong(`${cleanName} (MP3→MIDI)`, notes, ['יד ימין', 'יד שמאל'])
}

export function pickAudioFile(): Promise<{ name: string; data: ArrayBuffer } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mp3,.wav,.ogg,.m4a,.flac,audio/*'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return resolve(null)
      resolve({ name: f.name, data: await f.arrayBuffer() })
    }
    input.click()
  })
}
