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

export type Effects = {
  reverb: number
  delay: number
  delayTime: number
  brightness: number
  eqLow?: number
  eqMid?: number
  eqHigh?: number
}
export type GrooveId = 'click' | 'pop' | 'ballad' | 'bossa'
export type ArpMode = 'up' | 'down' | 'updown'
export type HarmonizeMode = 'off' | 'octave' | 'fifth' | 'triad'

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
  layerInstrument: InstrumentId | 'none' = 'none'
  layerMix = 0.55
  private layerVoice: Voice | null = null
  private input!: Tone.Gain
  private eq!: Tone.EQ3
  private filter!: Tone.Filter
  private delay!: Tone.FeedbackDelay
  private reverb!: Tone.Reverb
  private out!: Tone.Volume
  private analyser: Tone.Analyser | null = null
  tuningHz: 432 | 440 | 442 = 440
  ready = false

  private pitch(m: number): string | number {
    if (this.tuningHz === 440) return toNoteName(m)
    return 440 * Math.pow(2, (m - 69) / 12) * (this.tuningHz / 440)
  }

  // live playing
  private held = new Set<number>()
  private sounding = new Set<number>()
  private sustain = false
  private liveListeners = new Set<Listener>()

  // song playback
  song: Song | null = null
  playing = false
  loop = false
  loopA: number | null = null
  loopB: number | null = null
  speed = 1
  muted = new Set<number>()
  private offset = 0 // song seconds at anchor
  private anchor = 0 // AudioContext time at anchor
  private next = 0
  private timer: number | null = null
  onSongEnd: (() => void) | null = null

  // metronome & rhythm groove
  private metroSynth: Tone.Synth | null = null
  private kickSynth: Tone.MembraneSynth | null = null
  private snareSynth: Tone.NoiseSynth | null = null
  private hatSynth: Tone.NoiseSynth | null = null
  metronome = false
  groove: GrooveId = 'click'
  bpm = 100
  private metroTimer: number | null = null
  private metroStep = 0
  onBeat: ((beat: number) => void) | null = null

  // arpeggiator
  arpOn = false
  arpMode: ArpMode = 'up'
  private arpTimer: number | null = null
  private arpIdx = 0
  private arpDir = 1

  // smart harmonizer (1-finger chord voicing)
  harmonize: HarmonizeMode = 'off'
  private harmChildren = new Map<number, number[]>()

  // live overdub looper
  loopRec = false
  loopPlaying = false
  private loopStart = 0
  private loopLen = 0
  private loopEvents: { midi: number; offset: number; dur: number; vel: number }[] = []
  private loopOpen = new Map<number, { t: number; v: number }>()
  private loopTimer: number | null = null
  onLoopState: (() => void) | null = null

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
    this.eq = new Tone.EQ3({ low: 0, mid: 0, high: 0 })
    this.input = new Tone.Gain(1)
    this.input.chain(this.eq, this.filter, this.delay, this.reverb, this.out)
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
    this.analyser = new Tone.Analyser('waveform', 64)
    this.out.connect(this.analyser)
    this.metroSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.03 }
    }).connect(this.out)
    this.metroSynth.volume.value = -8
    this.kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.05 }
    }).connect(this.out)
    this.kickSynth.volume.value = -6
    this.snareSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.04 }
    }).connect(this.out)
    this.snareSynth.volume.value = -14
    this.hatSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 }
    }).connect(this.out)
    this.hatSynth.volume.value = -20
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

  private getOrCreateVoice(id: InstrumentId): Voice | null {
    let v = this.voices.get(id)
    if (!v) {
      const made = INSTRUMENTS.find((i) => i.id === id)?.create?.()
      if (!made) return null
      made.output.connect(this.input)
      v = made.voice
      this.voices.set(id, v)
    }
    return v
  }

  setInstrument(id: InstrumentId): void {
    if (!this.ready) {
      this.instrument = id
      return
    }
    const v = this.getOrCreateVoice(id)
    if (!v) return
    this.voice?.releaseAll(Tone.now())
    this.sounding.clear()
    this.voice = v
    this.instrument = id
  }

  setLayer(id: InstrumentId | 'none', mix = this.layerMix): void {
    this.layerInstrument = id
    this.layerMix = Math.max(0.1, Math.min(1, mix))
    if (!this.ready || id === 'none') {
      this.layerVoice?.releaseAll(Tone.now())
      this.layerVoice = null
      return
    }
    this.layerVoice = this.getOrCreateVoice(id)
  }

  getWaveform(): Float32Array | null {
    if (!this.analyser) return null
    const val = this.analyser.getValue()
    return val instanceof Float32Array ? val : null
  }

  setEffects(fx: Effects): void {
    if (!this.reverb) return
    this.reverb.wet.rampTo(fx.reverb * 0.6, 0.05)
    this.delay.wet.rampTo(fx.delay * 0.5, 0.05)
    this.delay.feedback.rampTo(0.15 + fx.delay * 0.4, 0.05)
    this.delay.delayTime.rampTo(fx.delayTime, 0.05)
    this.filter.frequency.rampTo(600 * Math.pow(2, fx.brightness * 5.1), 0.05)
    if (this.eq) {
      this.eq.low.rampTo(fx.eqLow ?? 0, 0.05)
      this.eq.mid.rampTo(fx.eqMid ?? 0, 0.05)
      this.eq.high.rampTo(fx.eqHigh ?? 0, 0.05)
    }
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
    if (this.arpOn && !this.learn) {
      this.held.add(m)
      if (this.held.size === 1) this.startArp()
      this.emit(m, true)
      return
    }
    this.triggerSingleOn(m, velocity)
    if (!this.learn && this.harmonize !== 'off') {
      const extras =
        this.harmonize === 'octave'
          ? [m + 12]
          : this.harmonize === 'fifth'
            ? [m + 7]
            : [m + 4, m + 7]
      const valid = extras.filter((x) => x <= 108)
      this.harmChildren.set(m, valid)
      for (const x of valid) this.triggerSingleOn(x, velocity * 0.72)
    }
    if (this.learn && this.playing) this.checkInput(m)
  }

  private triggerSingleOn(m: number, velocity: number): void {
    if (!this.voice || m < 21 || m > 108) return
    if (this.sounding.has(m)) this.release(m)
    this.held.add(m)
    this.sounding.add(m)
    this.voice.triggerAttack(this.pitch(m) as never, Tone.now(), velocity)
    if (this.layerVoice && this.layerInstrument !== 'none' && this.layerInstrument !== this.instrument) {
      this.layerVoice.triggerAttack(this.pitch(m) as never, Tone.now(), velocity * this.layerMix)
    }
    if (this.recording) this.recOpen.set(m, { t: wall() - this.recStart, v: velocity })
    if (this.loopRec) this.loopOpen.set(m, { t: wall() - this.loopStart, v: velocity })
    this.emit(m, true)
  }

  noteOff(m: number): void {
    if (!this.held.delete(m)) return
    if (this.arpOn && !this.learn) {
      this.emit(m, false)
      if (this.held.size === 0) this.stopArp()
      return
    }
    if (!this.sustain) this.release(m)
    const extras = this.harmChildren.get(m)
    if (extras) {
      this.harmChildren.delete(m)
      for (const x of extras) {
        this.held.delete(x)
        if (!this.sustain) this.release(x)
      }
    }
  }

  private release(m: number): void {
    if (!this.sounding.delete(m)) return
    const t = Tone.now()
    this.voice?.triggerRelease(this.pitch(m) as never, t)
    if (this.layerVoice && this.layerInstrument !== 'none' && this.layerInstrument !== this.instrument) {
      this.layerVoice.triggerRelease(this.pitch(m) as never, t)
    }
    const open = this.recOpen.get(m)
    if (this.recording && open) {
      const end = wall() - this.recStart
      this.recNotes.push({ midi: m, time: open.t, duration: Math.max(0.05, end - open.t), velocity: open.v, track: 0 })
      this.recOpen.delete(m)
    }
    const lopen = this.loopOpen.get(m)
    if (this.loopRec && lopen) {
      const end = wall() - this.loopStart
      this.loopEvents.push({ midi: m, offset: lopen.t, dur: Math.max(0.06, end - lopen.t), vel: lopen.v })
      this.loopOpen.delete(m)
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

  get activeNotes(): number[] {
    return [...this.sounding]
  }

  setMetronome(on: boolean, bpm = this.bpm, groove = this.groove): void {
    this.metronome = on
    this.bpm = Math.max(40, Math.min(220, bpm))
    this.groove = groove
    if (this.metroTimer !== null) {
      clearInterval(this.metroTimer)
      this.metroTimer = null
    }
    if (!on) {
      this.metroStep = 0
      return
    }
    void this.resume()
    const tick = (): void => {
      const s = this.metroStep % 8
      this.metroStep++
      const now = Tone.now()
      if (this.ready) {
        if (this.groove === 'click') {
          if (s % 2 === 0 && this.metroSynth) {
            const b = s / 2
            this.metroSynth.triggerAttackRelease(b === 0 ? 'C6' : 'G5', 0.03, now, b === 0 ? 0.75 : 0.35)
          }
        } else if (this.groove === 'pop') {
          if (s === 0 || s === 4) this.kickSynth?.triggerAttackRelease('C1', '8n', now, 0.9)
          if (s === 2 || s === 6) this.snareSynth?.triggerAttackRelease('16n', now, 0.65)
          this.hatSynth?.triggerAttackRelease('32n', now, s % 2 === 0 ? 0.45 : 0.22)
        } else if (this.groove === 'ballad') {
          if (s === 0 || s === 3) this.kickSynth?.triggerAttackRelease('C1', '8n', now, 0.75)
          if (s === 4) this.snareSynth?.triggerAttackRelease('16n', now, 0.45)
          if (s % 2 === 0) this.hatSynth?.triggerAttackRelease('32n', now, 0.3)
        } else if (this.groove === 'bossa') {
          if (s === 0 || s === 3 || s === 4 || s === 7) this.kickSynth?.triggerAttackRelease('C1', '8n', now, 0.7)
          if (s === 1 || s === 4 || s === 6) this.snareSynth?.triggerAttackRelease('32n', now, 0.35)
          this.hatSynth?.triggerAttackRelease('32n', now, 0.28)
        }
      }
      if (s % 2 === 0) this.onBeat?.(s / 2)
    }
    tick()
    this.metroTimer = window.setInterval(tick, (60 / this.bpm / 2) * 1000)
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(40, Math.min(220, bpm))
    if (this.metronome) this.setMetronome(true, this.bpm, this.groove)
    if (this.arpOn && this.held.size > 0) this.startArp()
  }

  setGroove(groove: GrooveId): void {
    this.groove = groove
    if (this.metronome) this.setMetronome(true, this.bpm, groove)
  }

  setArp(on: boolean, mode = this.arpMode): void {
    this.arpOn = on
    this.arpMode = mode
    if (!on) this.stopArp()
    else if (this.held.size > 0) this.startArp()
  }

  private startArp(): void {
    this.stopArp()
    this.arpIdx = 0
    this.arpDir = 1
    const stepMs = (60 / this.bpm / 2) * 1000
    const step = (): void => {
      if (!this.arpOn || this.held.size === 0 || !this.voice) return
      const notes = [...this.held].sort((a, b) => a - b)
      if (!notes.length) return
      let m: number
      if (this.arpMode === 'down') {
        m = notes[notes.length - 1 - (this.arpIdx % notes.length)]
        this.arpIdx++
      } else if (this.arpMode === 'updown' && notes.length > 1) {
        const idx = Math.max(0, Math.min(notes.length - 1, this.arpIdx))
        m = notes[idx]
        this.arpIdx += this.arpDir
        if (this.arpIdx >= notes.length - 1) this.arpDir = -1
        else if (this.arpIdx <= 0) this.arpDir = 1
      } else {
        m = notes[this.arpIdx % notes.length]
        this.arpIdx++
      }
      const dur = Math.max(0.08, (60 / this.bpm / 2) * 0.85)
      this.voice.triggerAttackRelease(toNoteName(m), dur, Tone.now(), 0.75)
      if (this.layerVoice && this.layerInstrument !== 'none' && this.layerInstrument !== this.instrument) {
        this.layerVoice.triggerAttackRelease(toNoteName(m), dur, Tone.now(), 0.75 * this.layerMix)
      }
    }
    step()
    this.arpTimer = window.setInterval(step, stepMs)
  }

  private stopArp(): void {
    if (this.arpTimer !== null) {
      clearInterval(this.arpTimer)
      this.arpTimer = null
    }
  }

  // ---------------- live overdub looper ----------------
  toggleLiveLoop(): void {
    if (!this.loopRec && !this.loopPlaying) {
      this.loopEvents = []
      this.loopOpen.clear()
      this.loopStart = wall()
      this.loopRec = true
      this.loopPlaying = false
      this.onLoopState?.()
      return
    }
    if (this.loopRec) {
      const end = wall() - this.loopStart
      for (const [m, o] of this.loopOpen) {
        this.loopEvents.push({ midi: m, offset: o.t, dur: Math.max(0.06, end - o.t), vel: o.v })
      }
      this.loopOpen.clear()
      this.loopRec = false
      this.loopLen = Math.max(0.6, end)
      if (!this.loopEvents.length) {
        this.loopPlaying = false
        this.onLoopState?.()
        return
      }
      this.startLiveLoopPlayback()
      return
    }
    this.clearLiveLoop()
  }

  private startLiveLoopPlayback(): void {
    if (this.loopTimer !== null) clearInterval(this.loopTimer)
    this.loopPlaying = true
    const runCycle = (): void => {
      if (!this.loopPlaying || !this.voice) return
      const now = Tone.now()
      for (const ev of this.loopEvents) {
        this.voice.triggerAttackRelease(toNoteName(ev.midi), ev.dur, now + ev.offset, ev.vel * 0.72)
      }
    }
    runCycle()
    this.loopTimer = window.setInterval(runCycle, this.loopLen * 1000)
    this.onLoopState?.()
  }

  clearLiveLoop(): void {
    this.loopRec = false
    this.loopPlaying = false
    this.loopEvents = []
    this.loopOpen.clear()
    if (this.loopTimer !== null) {
      clearInterval(this.loopTimer)
      this.loopTimer = null
    }
    this.onLoopState?.()
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
      this.voice.triggerAttackRelease(this.pitch(n.midi) as never, n.duration / this.speed, at, n.velocity)
    }

    if (this.loop && !this.learn && this.loopA !== null && this.loopB !== null && this.loopB > this.loopA + 0.2 && this.time >= this.loopB) {
      this.seek(this.loopA)
      return
    }

    if (this.time > song.duration + 0.6 && (!this.learn || this.gi >= this.groups.length)) {
      if (this.loop && !this.learn) {
        this.seek(this.loopA ?? 0)
        return
      }
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
