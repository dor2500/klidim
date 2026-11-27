// Instrument catalogue. The grand piano is sampled; the rest are synthesized, so they
// work offline and cost nothing to load. Each one is created on first use.
import * as Tone from 'tone'

export type InstrumentId =
  | 'piano'
  | 'epiano'
  | 'organ'
  | 'strings'
  | 'harpsichord'
  | 'musicbox'
  | 'synth'
  | 'pad'
  | 'marimba'
  | 'bass'

type Made = {
  output: Tone.ToneAudioNode
  voice: {
    triggerAttack(note: string, time?: number, velocity?: number): unknown
    triggerRelease(note: string, time?: number): unknown
    triggerAttackRelease(note: string, duration: number, time?: number, velocity?: number): unknown
    releaseAll(time?: number): unknown
  }
}

export type Instrument = { id: InstrumentId; name: string; hint: string; emoji: string; create?: () => Made }

const poly = <T extends Tone.Synth | Tone.FMSynth>(
  voice: new () => T,
  options: Record<string, unknown>,
  volume: number,
  ...fx: Tone.ToneAudioNode[]
): Made => {
  const s = new Tone.PolySynth(voice as never, options as never)
  s.maxPolyphony = 48
  s.volume.value = volume
  const out = new Tone.Gain(1)
  if (fx.length) s.chain(...fx, out)
  else s.connect(out)
  return { output: out, voice: s as unknown as Made['voice'] }
}

export const INSTRUMENTS: Instrument[] = [
  { id: 'piano', name: 'פסנתר כנף', hint: 'הקלטה של פסנתר אמיתי', emoji: '🎹' },
  {
    id: 'epiano',
    name: 'פסנתר חשמלי',
    hint: 'צליל רך ופעמוני של שנות ה-70',
    emoji: '✨',
    create: () =>
      poly(Tone.FMSynth, {
        harmonicity: 3.01,
        modulationIndex: 12,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.002, decay: 1.6, sustain: 0.18, release: 1.1 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.002, decay: 0.45, sustain: 0.08, release: 0.6 }
      }, -10, new Tone.Tremolo({ frequency: 4.5, depth: 0.25 }).start())
  },
  {
    id: 'organ',
    name: 'אורגן',
    hint: 'צליל מלא שנמשך כל עוד מחזיקים',
    emoji: '⛪',
    create: () =>
      poly(Tone.Synth, {
        oscillator: { partials: [1, 0.85, 0.6, 0.45, 0, 0.32, 0, 0.22, 0, 0.12] },
        envelope: { attack: 0.008, decay: 0.05, sustain: 1, release: 0.09 }
      }, -16, new Tone.Chorus({ frequency: 5.5, delayTime: 3, depth: 0.45, wet: 0.5 }).start())
  },
  {
    id: 'strings',
    name: 'כלי קשת',
    hint: 'תזמורת כינורות רכה',
    emoji: '🎻',
    create: () =>
      poly(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 22 },
        envelope: { attack: 0.28, decay: 0.3, sustain: 0.85, release: 1.5 }
      }, -19, new Tone.Filter({ type: 'lowpass', frequency: 2400, rolloff: -24 }), new Tone.Chorus({ frequency: 0.8, delayTime: 4, depth: 0.6, wet: 0.45 }).start())
  },
  {
    id: 'harpsichord',
    name: "צ'מבלו",
    hint: 'הפסנתר של תקופת הבארוק',
    emoji: '🏰',
    create: () =>
      poly(Tone.Synth, {
        oscillator: { type: 'sawtooth12' },
        envelope: { attack: 0.001, decay: 1.1, sustain: 0, release: 0.35 }
      }, -18, new Tone.Filter({ type: 'highpass', frequency: 180 }), new Tone.Filter({ type: 'lowpass', frequency: 5200 }))
  },
  {
    id: 'musicbox',
    name: 'תיבת נגינה',
    hint: 'פעמונים קטנים ומתוקים',
    emoji: '🎁',
    create: () =>
      poly(Tone.FMSynth, {
        harmonicity: 7.02,
        modulationIndex: 3.5,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 1.8, sustain: 0, release: 1.8 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.3 }
      }, -12)
  },
  {
    id: 'synth',
    name: 'סינתיסייזר',
    hint: 'צליל אלקטרוני חי',
    emoji: '🌊',
    create: () =>
      poly(Tone.Synth, {
        oscillator: { type: 'fatsquare', count: 2, spread: 14 },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.45, release: 0.55 }
      }, -21, new Tone.Filter({ type: 'lowpass', frequency: 3200, Q: 2 }))
  },
  {
    id: 'pad',
    name: 'פד חלומי',
    hint: 'אווירה רחבה ועוטפת לשכבות',
    emoji: '🌌',
    create: () =>
      poly(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 4, spread: 34 },
        envelope: { attack: 0.55, decay: 0.6, sustain: 0.9, release: 2.2 }
      }, -22, new Tone.Filter({ type: 'lowpass', frequency: 1700, rolloff: -24 }), new Tone.Chorus({ frequency: 0.5, delayTime: 5, depth: 0.7, wet: 0.55 }).start())
  },
  {
    id: 'marimba',
    name: 'מרימבה',
    hint: 'הקשה חמה מעץ',
    emoji: '🪵',
    create: () =>
      poly(Tone.FMSynth, {
        harmonicity: 4,
        modulationIndex: 2.2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.35 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.1 }
      }, -10)
  },
  {
    id: 'bass',
    name: 'בס אנלוגי',
    hint: 'בס חם ועמוק ליד שמאל',
    emoji: '🎸',
    create: () =>
      poly(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.35, sustain: 0.55, release: 0.28 }
      }, -16, new Tone.Filter({ type: 'lowpass', frequency: 680, rolloff: -24, Q: 2.5 }))
  }
]
