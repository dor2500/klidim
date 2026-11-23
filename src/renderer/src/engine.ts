// Audio engine: instruments, effects, live playing with sustain, song playback,
// the teacher's wait-for-the-right-note mode, and recording.
import * as Tone from 'tone'
import { makeSong, type Note, type Song } from './music'
import { INSTRUMENTS, type InstrumentId } from './instruments'

const SAMPLE_NAMES = ['A0', ...[1, 2, 3, 4, 5, 6, 7].flatMap((o) => ['C', 'Ds', 'Fs', 'A'].map((n) => n + o)), 'C8']
/** Wall clock in seconds; recording timing must not depend on the audio clock running. */
const wall = (): number => performance.now() / 1000
const toNoteName = (m: number): string => Tone.Frequency(m, 'midi').toNote()

type Listener = (midi: number, on: boolean) => void

/** The part of Tone's Sampler / PolySynth API the engine uses. */
type Voice = {
  triggerAttack(note: string, time?: number, velocity?: number): unknown
  triggerRelease(note: string, time?: number): unknown
  triggerAttackRelease(note: string, duration: number, time?: number, velocity?: number): unknown
  releaseAll(time?: number): unknown
}

export type Effects = { reverb: number; delay: number; delayTime: number; brightness: number }

export type TeachEvent =
  | { type: 'wait'; notes: number[]; index: number; total: number }
  | { type: 'hit'; streak: number; index: number; total: number }
  | { type: 'wrong'; midi: number; expected: number[] }
  | { type: 'done'; stats: LessonStats }

export type LessonStats = { notes: number; wrong: number; accuracy: number; seconds: number; bestStreak: number }

type Group = { time: number; notes: number[] }

class Engine {
  private voices = new Map<InstrumentId, Voice>()
  private voice: Voice | null = null
  instrument: InstrumentId = 'piano'
  private input!: Tone.Gain
  private filter!: Tone.Filter
  private delay!: Tone.FeedbackDelay
  private reverb!: Tone.Reverb
  private out!: Tone.Volume
  ready = false

  // live playing
  private held = new Set<number>()
  private sounding = new Set<number>()
  private sustain = false
  private liveListeners = new Set<Listener>()

  // song playback
  song: Song | null = null
  playing = false
  speed = 1
  muted = new Set<number>()
  private offset = 0 // song seconds at anchor
  private anchor = 0 // AudioContext time at anchor
  private next = 0
  private timer: number | null = null
  onSongEnd: (() => void) | null = null

  // teacher (wait mode)
  learn = false
  practice = new Set<number>() // tracks the user plays
  private groups: Group[] = []
  private gi = 0
  waiting = false
  private hits = new Set<number>()
  private streak = 0
  private stats = { hit: 0, wrong: 0, best: 0, start: 0 }
  onTeach: ((e: TeachEvent) => void) | null = null

  // recording
  recording = false
  private recStart = 0
  private recOpen = new Map<number, { t: number; v: number }>()
  private recNotes: Note[] = []

  async init(fx: Effects): Promise<void> {
    Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0 }))
    this.out = new Tone.Volume(-6).toDestination()
    this.reverb = new Tone.Reverb({ decay: 2.8, preDelay: 0.01 })
    await this.reverb.generate()
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3 })
    this.filter = new Tone.Filter({ type: 'lowpass', frequency: 20000, rolloff: -12 })
    this.input = new Tone.Gain(1)
    this.input.chain(this.filter, this.delay, this.reverb, this.out)
    this.setEffects(fx)

    const base = new URL('samples/', document.baseURI).href
    const urls: Record<string, string> = {}
    for (const n of SAMPLE_NAMES) urls[n.replace('s', '#')] = `${n}.mp3`
    const sampler = await new Promise<Tone.Sampler>((resolve, reject) => {
      const s: Tone.Sampler = new Tone.Sampler({ urls, baseUrl: base, release: 1.1, onload: () => resolve(s), onerror: reject })
    })
    sampler.connect(this.input)
    this.voices.set('piano', sampler)
    this.voice = sampler
    this.ready = true
  }

  /** Must be called from a user gesture in a browser; Electron allows autoplay. */
  async resume(): Promise<void> {
    if (Tone.getContext().state !== 'running') await Tone.start()
  }

  get now(): number {
    return Tone.now()
  }

  // ---------------- sound settings ----------------
  setVolume(v: number): void {
    if (this.out) this.out.volume.value = v <= 0 ? -Infinity : 20 * Math.log10(v) - 2
  }

  setInstrument(id: InstrumentId): void {
    if (!this.ready) {
      this.instrument = id
      return
    }
    let v = this.voices.get(id)
    if (!v) {
      const made = INSTRUMENTS.find((i) => i.id === id)?.create?.()
      if (!made) return
      made.output.connect(this.input)
      v = made.voice
      this.voices.set(id, v)
    }
    this.voice?.releaseAll(Tone.now())
    this.sounding.clear()
    this.voice = v
    this.instrument = id
  }

  setEffects(fx: Effects): void {
    if (!this.reverb) return
    this.reverb.wet.rampTo(fx.reverb * 0.6, 0.05)
    this.delay.wet.rampTo(fx.delay * 0.5, 0.05)
    this.delay.feedback.rampTo(0.15 + fx.delay * 0.4, 0.05)
    this.delay.delayTime.rampTo(fx.delayTime, 0.05)
    this.filter.frequency.rampTo(600 * Math.pow(2, fx.brightness * 5.1), 0.05)
  }

  // ---------------- live ----------------
  onLive(fn: Listener): () => void {
    this.liveListeners.add(fn)
    return () => this.liveListeners.delete(fn)
  }
  private emit(m: number, on: boolean): void {
    for (const fn of this.liveListeners) fn(m, on)
  }

  noteOn(m: number, velocity = 0.8): void {
    if (!this.voice || m < 21 || m > 108) return
    void this.resume()
    if (this.sounding.has(m)) this.release(m)
    this.held.add(m)
    this.sounding.add(m)
    this.voice.triggerAttack(toNoteName(m), Tone.now(), velocity)
    if (this.recording) this.recOpen.set(m, { t: wall() - this.recStart, v: velocity })
    this.emit(m, true)
    if (this.learn && this.playing) this.checkInput(m)
  }

  noteOff(m: number): void {
    if (!this.held.delete(m)) return
    if (this.sustain) return
    this.release(m)
  }

  private release(m: number): void {
    if (!this.sounding.delete(m)) return
    this.voice?.triggerRelease(toNoteName(m), Tone.now())
    const open = this.recOpen.get(m)
    if (this.recording && open) {
      const end = wall() - this.recStart
      this.recNotes.push({ midi: m, time: open.t, duration: Math.max(0.05, end - open.t), velocity: open.v, track: 0 })
      this.recOpen.delete(m)
    }
    this.emit(m, false)
  }

  setSustain(on: boolean): void {
    this.sustain = on
    if (!on) for (const m of [...this.sounding]) if (!this.held.has(m)) this.release(m)
  }
  get sustainOn(): boolean {
    return this.sustain
  }

  allLiveOff(): void {
    this.held.clear()
    this.sustain = false
    for (const m of [...this.sounding]) this.release(m)
  }

  // ---------------- recording ----------------
  startRecording(): void {
    this.recording = true
    this.recStart = wall()
    this.recOpen.clear()
    this.recNotes = []
  }

  stopRecording(): Song | null {
    if (!this.recording) return null
    const end = wall() - this.recStart
    for (const [m, o] of this.recOpen) {
      this.recNotes.push({ midi: m, time: o.t, duration: Math.max(0.05, end - o.t), velocity: o.v, track: 0 })
    }
    this.recording = false
    this.recOpen.clear()
    if (!this.recNotes.length) return null
    const first = Math.min(...this.recNotes.map((n) => n.time))
    const notes = this.recNotes.map((n) => ({ ...n, time: n.time - first + 0.5 }))
    const d = new Date()
    const name = `הקלטה ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    return makeSong(name, notes, ['ההקלטה שלי'])
  }

  get recordingTime(): number {
    return this.recording ? wall() - this.recStart : 0
  }

  // ---------------- song playback ----------------
  load(song: Song | null): void {
    this.stop()
    this.song = song
    this.muted.clear()
    this.offset = 0
    this.next = 0
    this.setLearn(false)
  }

  /** Current position in song seconds (holds still while the teacher waits). */
  get time(): number {
    if (!this.playing || this.waiting) return this.offset
    const t = this.offset + (Tone.now() - this.anchor) * this.speed
    if (this.learn && this.gi < this.groups.length) return Math.min(t, this.groups[this.gi].time)
    return t
  }

  play(): void {
    if (!this.song || this.playing || !this.voice) return
    void this.resume()
    if (this.offset >= this.song.duration) this.seek(0)
    if (this.learn && this.gi >= this.groups.length) this.seek(0)
    this.anchor = Tone.now() + 0.05
    this.playing = true
    this.waiting = false
    this.seekIndex(this.offset)
    if (this.learn && this.offset === 0) this.stats = { hit: 0, wrong: 0, best: 0, start: wall() }
    this.timer = window.setInterval(() => this.schedule(), 20)
    this.schedule()
  }

  pause(): void {
    if (!this.playing) return
    this.offset = this.time
    this.playing = false
    this.waiting = false
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.voice?.releaseAll(Tone.now())
    this.sounding.clear()
  }

  stop(): void {
    this.pause()
    this.offset = 0
    this.next = 0
    this.gi = 0
    this.hits.clear()
    this.streak = 0
  }

  seek(t: number): void {
    const was = this.playing
    if (was) this.pause()
    this.offset = Math.max(0, Math.min(t, this.song?.duration ?? 0))
    this.seekIndex(this.offset)
    if (was) this.play()
  }

  setSpeed(s: number): void {
    if (this.playing && !this.waiting) {
      this.offset = this.time
      this.anchor = Tone.now()
    }
    this.speed = s
  }

  private seekIndex(t: number): void {
    const notes = this.song?.notes ?? []
    let i = 0
    while (i < notes.length && notes[i].time < t - 0.001) i++
    this.next = i
    let g = 0
    while (g < this.groups.length && this.groups[g].time < t - 0.001) g++
    this.gi = g
    this.hits.clear()
  }

  private schedule(): void {
    const song = this.song
    if (!song || !this.playing || !this.voice) return
    const now = Tone.now()
    const t = this.time

    // teacher: stop the clock at the next note the user has to play
    if (this.learn && !this.waiting && this.gi < this.groups.length && t >= this.groups[this.gi].time) {
      this.offset = this.groups[this.gi].time
      this.waiting = true
      const g = this.groups[this.gi]
      this.onTeach?.({ type: 'wait', notes: g.notes, index: this.gi, total: this.groups.length })
    }

    let limit = this.time + 0.12 * this.speed
    if (this.learn && this.gi < this.groups.length) limit = Math.min(limit, this.groups[this.gi].time)
    while (this.next < song.notes.length && song.notes[this.next].time < limit) {
      const n = song.notes[this.next++]
      if (this.muted.has(n.track)) continue
      if (this.learn && this.practice.has(n.track)) continue // the user plays these
      let at = this.anchor + (n.time - this.offset) / this.speed
      if (this.waiting) at = now
      if (at < now - 0.05) continue
      at = Math.max(at, now)
      this.voice.triggerAttackRelease(toNoteName(n.midi), n.duration / this.speed, at, n.velocity)
    }

    if (this.time > song.duration + 0.6 && (!this.learn || this.gi >= this.groups.length)) {
      const wasLearn = this.learn
      this.stop()
      if (wasLearn) this.onTeach?.({ type: 'done', stats: this.lessonStats() })
      this.onSongEnd?.()
    }
  }

  // ---------------- teacher ----------------
  /** Turns the wait-for-the-player mode on, with the given tracks played by the user. */
  setLearn(on: boolean, tracks: number[] = []): void {
    this.learn = on
    this.practice = new Set(on ? tracks : [])
    this.groups = []
    this.waiting = false
    this.streak = 0
    if (on && this.song) {
      const notes = this.song.notes.filter((n) => this.practice.has(n.track))
      for (const n of notes) {
        const last = this.groups[this.groups.length - 1]
        if (last && n.time - last.time < 0.045) {
          if (!last.notes.includes(n.midi)) last.notes.push(n.midi)
        } else this.groups.push({ time: n.time, notes: [n.midi] })
      }
    }
    this.seekIndex(this.offset)
  }

  /** The notes the user must play next (for highlighting the keys). */
  get expected(): number[] {
    if (!this.learn || this.gi >= this.groups.length) return []
    const g = this.groups[this.gi]
    return this.waiting || g.time - this.time < 1.2 ? g.notes : []
  }

  get lessonProgress(): { index: number; total: number } {
    return { index: this.gi, total: this.groups.length }
  }

  private checkInput(m: number): void {
    const g = this.groups[this.gi]
    if (!g) return
    const close = this.waiting || g.time - this.time < 0.3 * this.speed
    if (g.notes.includes(m) && close) {
      this.hits.add(m)
      if (g.notes.every((n) => this.hits.has(n))) {
        this.stats.hit += g.notes.length
        this.streak++
        this.stats.best = Math.max(this.stats.best, this.streak)
        this.gi++
        this.hits.clear()
        if (this.waiting) {
          this.waiting = false
          this.anchor = Tone.now()
        }
        this.onTeach?.({ type: 'hit', streak: this.streak, index: this.gi, total: this.groups.length })
      }
    } else if (this.waiting) {
      this.stats.wrong++
      this.streak = 0
      this.onTeach?.({ type: 'wrong', midi: m, expected: g.notes })
    }
  }

  private lessonStats(): LessonStats {
    const { hit, wrong, best, start } = this.stats
    return {
      notes: hit,
      wrong,
      accuracy: hit + wrong ? Math.round((hit / (hit + wrong)) * 100) : 100,
      seconds: Math.round(wall() - start),
      bestStreak: best
    }
  }
}

export const engine = new Engine()
