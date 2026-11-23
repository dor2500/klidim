// Audio engine: sampled piano, live playing with sustain, song playback and recording.
import * as Tone from 'tone'
import { makeSong, type Note, type Song } from './music'

const SAMPLE_NAMES = ['A0', ...[1, 2, 3, 4, 5, 6, 7].flatMap((o) => ['C', 'Ds', 'Fs', 'A'].map((n) => n + o)), 'C8']
/** Wall clock in seconds; recording timing must not depend on the audio clock running. */
const wall = (): number => performance.now() / 1000
const toNoteName = (m: number): string => Tone.Frequency(m, 'midi').toNote()

type Listener = (midi: number, on: boolean) => void

class Engine {
  private sampler: Tone.Sampler | null = null
  private out = new Tone.Volume(-6)
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

  // recording
  recording = false
  private recStart = 0
  private recOpen = new Map<number, { t: number; v: number }>()
  private recNotes: Note[] = []

  async init(): Promise<void> {
    Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0 }))
    this.out = new Tone.Volume(-6).toDestination()
    const reverb = new Tone.Reverb({ decay: 2.2, wet: 0.16 })
    await reverb.generate()
    reverb.connect(this.out)
    const base = new URL('samples/', document.baseURI).href
    const urls: Record<string, string> = {}
    for (const n of SAMPLE_NAMES) urls[n.replace('s', '#')] = `${n}.mp3`
    await new Promise<void>((resolve, reject) => {
      this.sampler = new Tone.Sampler({ urls, baseUrl: base, release: 1.1, onload: () => resolve(), onerror: reject })
      this.sampler.connect(reverb)
    })
    this.ready = true
  }

  /** Must be called from a user gesture in a browser; Electron allows autoplay. */
  async resume(): Promise<void> {
    if (Tone.getContext().state !== 'running') await Tone.start()
  }

  get now(): number {
    return Tone.now()
  }

  setVolume(v: number): void {
    // v in 0..1
    this.out.volume.value = v <= 0 ? -Infinity : 20 * Math.log10(v) - 2
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
    if (!this.sampler || m < 21 || m > 108) return
    void this.resume()
    if (this.sounding.has(m)) this.release(m)
    this.held.add(m)
    this.sounding.add(m)
    this.sampler.triggerAttack(toNoteName(m), Tone.now(), velocity)
    if (this.recording) this.recOpen.set(m, { t: wall() - this.recStart, v: velocity })
    this.emit(m, true)
  }

  noteOff(m: number): void {
    if (!this.held.delete(m)) return
    if (this.sustain) return
    this.release(m)
  }

  private release(m: number): void {
    if (!this.sounding.delete(m)) return
    this.sampler?.triggerRelease(toNoteName(m), Tone.now())
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
    // start the recording at its first note
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
  }

  /** Current position in song seconds. */
  get time(): number {
    if (!this.playing) return this.offset
    return this.offset + (Tone.now() - this.anchor) * this.speed
  }

  play(): void {
    if (!this.song || this.playing || !this.sampler) return
    void this.resume()
    if (this.offset >= this.song.duration) this.seek(0)
    this.anchor = Tone.now() + 0.05
    this.playing = true
    this.seekIndex(this.offset)
    this.timer = window.setInterval(() => this.schedule(), 25)
    this.schedule()
  }

  pause(): void {
    if (!this.playing) return
    this.offset = this.time
    this.playing = false
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.sampler?.releaseAll(Tone.now())
  }

  stop(): void {
    this.pause()
    this.offset = 0
    this.next = 0
  }

  seek(t: number): void {
    const was = this.playing
    if (was) this.pause()
    this.offset = Math.max(0, Math.min(t, this.song?.duration ?? 0))
    this.seekIndex(this.offset)
    if (was) this.play()
  }

  setSpeed(s: number): void {
    if (this.playing) {
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
  }

  private schedule(): void {
    const song = this.song
    if (!song || !this.playing || !this.sampler) return
    const now = Tone.now()
    const t = this.time
    const horizon = t + 0.12 * this.speed
    while (this.next < song.notes.length && song.notes[this.next].time < horizon) {
      const n = song.notes[this.next++]
      if (this.muted.has(n.track)) continue
      let at = this.anchor + (n.time - this.offset) / this.speed
      if (at < now - 0.05) continue // too late (e.g. after a stall), skip
      at = Math.max(at, now)
      this.sampler.triggerAttackRelease(toNoteName(n.midi), n.duration / this.speed, at, n.velocity)
    }
    if (t > song.duration + 0.6) {
      this.stop()
      this.onSongEnd?.()
    }
  }
}

export const engine = new Engine()
