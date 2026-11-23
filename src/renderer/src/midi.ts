// MIDI files (open/save) and MIDI keyboards (Web MIDI).
import { Midi } from '@tonejs/midi'
import { makeSong, type Note, type Song } from './music'

type Api = {
  openMidi(): Promise<{ name: string; data: Uint8Array } | null>
  saveMidi(name: string, data: Uint8Array): Promise<string | null>
}
const api = (window as unknown as { api?: Api }).api

export function songFromMidi(name: string, data: ArrayBuffer | Uint8Array): Song {
  const midi = new Midi(data)
  const notes: Note[] = []
  const names: string[] = []
  midi.tracks.forEach((tr, i) => {
    if (tr.channel === 9 || tr.instrument.percussion) return // drums
    names[i] = tr.name?.trim() || ''
    for (const n of tr.notes) {
      notes.push({ midi: n.midi, time: n.time, duration: Math.max(0.05, n.duration), velocity: n.velocity, track: i })
    }
  })
  if (!notes.length) throw new Error('אין בקובץ תווים לנגינה')
  return makeSong(name.replace(/\.midi?$/i, ''), notes, names)
}

/** Opens a .mid file through the native dialog (Electron) or a file picker (browser). */
export async function pickMidi(): Promise<Song | null> {
  if (api) {
    const f = await api.openMidi()
    return f ? songFromMidi(f.name, f.data) : null
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mid,.midi,audio/midi'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return resolve(null)
      try {
        resolve(songFromMidi(f.name, await f.arrayBuffer()))
      } catch (e) {
        reject(e)
      }
    }
    input.click()
  })
}

export async function saveSong(song: Song): Promise<string | null> {
  const midi = new Midi()
  midi.header.setTempo(120)
  song.tracks.forEach((t, i) => {
    const tr = midi.addTrack()
    tr.name = t.name
    for (const n of song.notes) if (n.track === i) tr.addNote({ midi: n.midi, time: n.time, duration: n.duration, velocity: n.velocity })
  })
  const data = midi.toArray()
  const name = `${song.name.replace(/[\\/:*?"<>|]/g, '-')}.mid`
  if (api) return api.saveMidi(name, data)
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'audio/midi' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return name
}

// ---------------- MIDI keyboards ----------------
export type MidiHandlers = {
  noteOn(m: number, velocity: number): void
  noteOff(m: number): void
  sustain(on: boolean): void
  devices(names: string[]): void
}

export async function connectMidiInputs(h: MidiHandlers): Promise<boolean> {
  if (!navigator.requestMIDIAccess) return false
  let access: MIDIAccess
  try {
    access = await navigator.requestMIDIAccess()
  } catch {
    return false
  }
  const onMsg = (e: MIDIMessageEvent): void => {
    const d = e.data
    if (!d || d.length < 2) return
    const cmd = d[0] & 0xf0
    if (cmd === 0x90 && d[2] > 0) h.noteOn(d[1], d[2] / 127)
    else if (cmd === 0x80 || (cmd === 0x90 && d[2] === 0)) h.noteOff(d[1])
    else if (cmd === 0xb0 && d[1] === 64) h.sustain(d[2] >= 64)
  }
  const refresh = (): void => {
    const names: string[] = []
    access.inputs.forEach((inp) => {
      inp.onmidimessage = onMsg
      if (inp.state === 'connected') names.push(inp.name || 'מקלדת MIDI')
    })
    h.devices(names)
  }
  access.onstatechange = refresh
  refresh()
  return true
}
