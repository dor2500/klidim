import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { engine } from './engine'
import { connectMidiInputs, pickMidi, saveSong, songFromMidi } from './midi'
import { buildKeymap, fmtTime, keyNote, pianoRange, type Song } from './music'
import { BUILTIN } from './songs'
import { Stage, TRACK_COLORS } from './Stage'
import { Icon } from './icons'

type Labels = 'keys' | 'notes' | 'none'
type Prefs = { volume: number; octave: number; labels: Labels }

const PREFS_KEY = 'klidim-prefs'
function loadPrefs(): Prefs {
  const def: Prefs = { volume: 0.8, octave: 0, labels: 'keys' }
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
  } catch {
    return def
  }
}

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [transpose, setTranspose] = useState(0)
  const [sustain, setSustain] = useState(false)
  const [song, setSong] = useState<Song | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [muted, setMuted] = useState<number[]>([])
  const [recording, setRecording] = useState(false)
  const [recTime, setRecTime] = useState(0)
  const [recordings, setRecordings] = useState<Song[]>([])
  const [devices, setDevices] = useState<string[] | null>(null)
  const [menu, setMenu] = useState(false)
  const [help, setHelp] = useState(false)
  const [played, setPlayed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const seeking = useRef(false)

  const say = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200)
  }, [])

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    engine.setVolume(prefs.volume)
  }, [prefs])

  // boot: samples + MIDI keyboards
  useEffect(() => {
    engine
      .init()
      .then(() => {
        engine.setVolume(loadPrefs().volume)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
    engine.onSongEnd = () => setPlaying(false)
    void connectMidiInputs({
      noteOn: (m, v) => {
        engine.noteOn(m, v)
        setPlayed(true)
      },
      noteOff: (m) => engine.noteOff(m),
      sustain: (on) => {
        engine.setSustain(on)
        setSustain(on)
      },
      devices: setDevices
    }).then((ok) => {
      if (!ok) setDevices([])
    })
  }, [])

  // UI clock
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!seeking.current) setTime(engine.time)
      if (engine.recording) setRecTime(engine.recordingTime)
    }, 100)
    return () => clearInterval(id)
  }, [])

  const keymap = useMemo(() => buildKeymap(prefs.octave, transpose), [prefs.octave, transpose])
  const [lo, hi] = useMemo(() => {
    const extra = [...keymap.values()]
    if (song) for (const n of song.notes) extra.push(n.midi)
    return pianoRange(extra)
  }, [keymap, song])

  // computer keyboard
  const pressed = useRef(new Map<string, number>())
  useEffect(() => {
    const isField = (e: KeyboardEvent): boolean =>
      e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'button'
    const down = (e: KeyboardEvent): void => {
      if (isField(e) || e.ctrlKey || e.altKey || e.metaKey) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) {
          engine.setSustain(true)
          setSustain(true)
        }
        return
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault()
        const d = e.code === 'ArrowRight' ? 1 : -1
        setPrefs((p) => ({ ...p, octave: Math.max(-2, Math.min(2, p.octave + d)) }))
        return
      }
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault()
        setTranspose((t) => Math.max(-11, Math.min(11, t + (e.code === 'ArrowUp' ? 1 : -1))))
        return
      }
      if (e.code === 'Escape') {
        engine.allLiveOff()
        setSustain(false)
        setMenu(false)
        setHelp(false)
        return
      }
      const base = keymap.get(e.code)
      if (base === undefined || e.repeat || pressed.current.has(e.code)) return
      const m = keyNote(base, e.shiftKey)
      e.preventDefault()
      pressed.current.set(e.code, m)
      engine.noteOn(m, 0.78)
      setPlayed(true)
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        engine.setSustain(false)
        setSustain(false)
        return
      }
      const m = pressed.current.get(e.code)
      if (m === undefined) return
      pressed.current.delete(e.code)
      engine.noteOff(m)
    }
    const blur = (): void => {
      for (const m of pressed.current.values()) engine.noteOff(m)
      pressed.current.clear()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [keymap])

  // ---------- song actions ----------
  const loadSong = (s: Song | null): void => {
    engine.load(s)
    setSong(s)
    setPlaying(false)
    setTime(0)
    setMuted([])
    setSpeed(1)
    engine.setSpeed(1)
    setMenu(false)
  }
  const togglePlay = (): void => {
    if (!song) return
    if (engine.playing) engine.pause()
    else engine.play()
    setPlaying(engine.playing)
  }
  const stopSong = (): void => {
    engine.stop()
    setPlaying(false)
    setTime(0)
  }
  const openFile = async (): Promise<void> => {
    setMenu(false)
    try {
      const s = await pickMidi()
      if (s) loadSong(s)
    } catch (e) {
      say(e instanceof Error && e.message.startsWith('אין') ? e.message : 'לא הצלחתי לקרוא את הקובץ')
    }
  }
  const toggleTrack = (i: number): void => {
    if (engine.muted.has(i)) engine.muted.delete(i)
    else engine.muted.add(i)
    setMuted([...engine.muted])
  }

  // drag & drop a .mid file anywhere
  useEffect(() => {
    const over = (e: DragEvent): void => e.preventDefault()
    const drop = async (e: DragEvent): Promise<void> => {
      e.preventDefault()
      const f = e.dataTransfer?.files[0]
      if (!f) return
      try {
        loadSong(songFromMidi(f.name, await f.arrayBuffer()))
      } catch {
        say('אפשר לגרור לכאן רק קובצי MIDI')
      }
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  })

  // ---------- recording ----------
  const toggleRec = (): void => {
    if (!engine.recording) {
      engine.startRecording()
      setRecording(true)
      setRecTime(0)
      return
    }
    const s = engine.stopRecording()
    setRecording(false)
    if (!s) return say('לא נוגנו תווים, אין מה לשמור')
    setRecordings((r) => [s, ...r])
    loadSong(s)
    say('ההקלטה מוכנה. אפשר לנגן אותה או לשמור')
  }
  const save = async (): Promise<void> => {
    if (!song) return
    const p = await saveSong(song)
    if (p) say('נשמר בהצלחה')
  }

  const setOct = (d: number): void => setPrefs((p) => ({ ...p, octave: Math.max(-2, Math.min(2, p.octave + d)) }))
  const blurAfter = (e: React.MouseEvent): void => (e.currentTarget as HTMLElement).blur()

  return (
    <div className="app" onMouseUp={blurAfter}>
      <header className="titlebar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <Icon name="logo" />
          </span>
          <span className="brand-name">קלידים</span>
          <span className="brand-sub">Klidim</span>
        </div>

        <div className="song-picker">
          <button className={`picker ${menu ? 'open' : ''}`} onClick={() => setMenu((v) => !v)}>
            <Icon name="music" />
            <span className="picker-name">{song ? song.name : 'בחירת שיר'}</span>
            <Icon name="chevron" />
          </button>
          {menu && (
            <>
              <div className="scrim" onClick={() => setMenu(false)} />
              <div className="menu" role="menu">
                <button className="menu-item accent" onClick={openFile}>
                  <Icon name="folder" /> פתיחת קובץ MIDI…
                </button>
                <div className="menu-label">שירים לתרגול</div>
                {BUILTIN.map((b) => {
                  const s = b.make()
                  return (
                    <button key={b.id} className="menu-item" onClick={() => loadSong(s)}>
                      <Icon name="note" /> {s.name}
                      <span className="menu-meta">{fmtTime(s.duration)}</span>
                    </button>
                  )
                })}
                {recordings.length > 0 && <div className="menu-label">ההקלטות שלי</div>}
                {recordings.map((r, i) => (
                  <button key={i} className="menu-item" onClick={() => loadSong(r)}>
                    <Icon name="mic" /> {r.name}
                    <span className="menu-meta">{fmtTime(r.duration)}</span>
                  </button>
                ))}
                {song && (
                  <button className="menu-item muted" onClick={() => loadSong(null)}>
                    <Icon name="close" /> נגינה חופשית (בלי שיר)
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className={`chip ${devices && devices.length ? 'on' : ''}`} title={devices?.join(', ') || ''}>
          <Icon name="midi" />
          {devices === null ? 'מחפש מקלדת MIDI…' : devices.length ? devices[0] : 'אין מקלדת MIDI'}
        </div>
      </header>

      <main className="main">
        {song && (
          <div className="transport">
            <button className="round primary" onClick={togglePlay} title={playing ? 'השהיה' : 'ניגון'}>
              <Icon name={playing ? 'pause' : 'play'} />
            </button>
            <button className="round" onClick={stopSong} title="עצירה">
              <Icon name="stop" />
            </button>
            <span className="clock">{fmtTime(time)}</span>
            <input
              className="seek"
              type="range"
              dir="ltr"
              min={0}
              max={song.duration || 1}
              step={0.01}
              value={Math.min(time, song.duration)}
              onPointerDown={() => (seeking.current = true)}
              onPointerUp={() => (seeking.current = false)}
              onChange={(e) => {
                const t = Number(e.target.value)
                setTime(t)
                engine.seek(t)
              }}
              style={{ ['--p' as string]: `${(Math.min(time, song.duration) / (song.duration || 1)) * 100}%` }}
            />
            <span className="clock dim">{fmtTime(song.duration)}</span>
            <div className="seg" title="מהירות">
              {[0.5, 0.75, 1, 1.25].map((s) => (
                <button
                  key={s}
                  className={speed === s ? 'on' : ''}
                  onClick={() => {
                    setSpeed(s)
                    engine.setSpeed(s)
                  }}
                >
                  {Math.round(s * 100)}%
                </button>
              ))}
            </div>
            <div className="tracks">
              {song.tracks.map((t, i) => (
                <button
                  key={i}
                  className={`track ${muted.includes(i) ? 'off' : ''}`}
                  onClick={() => toggleTrack(i)}
                  title={muted.includes(i) ? 'הפעלת הערוץ' : 'השתקת הערוץ (כדי לנגן אותו בעצמכם)'}
                >
                  <span className="dot" style={{ background: TRACK_COLORS[i % TRACK_COLORS.length] }} />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {!song && !played && status === 'ready' && (
          <div className="welcome">
            <h1>נגנו מהמקלדת</h1>
            <p>
              כל שורה במקלדת עולה בסולם משמאל לימין: <b>Z</b>, <b>A</b>, <b>Q</b> ו-<b>1</b> הם דו, כל שורה
              באוקטבה מעל הקודמת. <b>Shift</b> עם מקש מנגן את הקליד השחור, ומקש הרווח הוא דוושת ההדהוד.
            </p>
            <div className="welcome-actions">
              <button className="btn primary" onClick={() => setMenu(true)}>
                <Icon name="music" /> שירים לתרגול
              </button>
              <button className="btn" onClick={openFile}>
                <Icon name="folder" /> פתיחת קובץ MIDI
              </button>
            </div>
          </div>
        )}
        {status === 'loading' && <div className="welcome"><div className="spinner" /><p>טוען את צליל הפסנתר…</p></div>}
        {status === 'error' && <div className="welcome"><h1>הצליל לא נטען</h1><p>נסו לפתוח את התוכנה מחדש.</p></div>}

        <Stage lo={lo} hi={hi} keymap={keymap} labels={prefs.labels} />
      </main>

      <footer className="controls">
        <div className="group">
          <button className={`rec ${recording ? 'on' : ''}`} onClick={toggleRec}>
            <span className="rec-dot" />
            {recording ? `עצירה · ${fmtTime(recTime)}` : 'הקלטה'}
          </button>
          <button className="btn ghost" onClick={save} disabled={!song || recording} title="שמירת השיר הפתוח כקובץ MIDI">
            <Icon name="save" /> שמירה
          </button>
        </div>

        <div className="group">
          <label className="ctl">
            <span>אוקטבה</span>
            <span className="stepper">
              <button onClick={() => setOct(-1)} aria-label="אוקטבה למטה">−</button>
              <b>{prefs.octave > 0 ? `+${prefs.octave}` : prefs.octave}</b>
              <button onClick={() => setOct(1)} aria-label="אוקטבה למעלה">+</button>
            </span>
          </label>
          <label className="ctl">
            <span>סולם</span>
            <span className="stepper">
              <button onClick={() => setTranspose((t) => Math.max(-11, t - 1))} aria-label="חצי טון למטה">−</button>
              <b>{transpose > 0 ? `+${transpose}` : transpose}</b>
              <button onClick={() => setTranspose((t) => Math.min(11, t + 1))} aria-label="חצי טון למעלה">+</button>
            </span>
          </label>
          <button
            className={`pedal ${sustain ? 'on' : ''}`}
            onPointerDown={() => {
              engine.setSustain(!engine.sustainOn)
              setSustain(engine.sustainOn)
            }}
            title="דוושת הדהוד (רווח)"
          >
            <Icon name="pedal" /> דוושה
          </button>
        </div>

        <div className="group">
          <label className="ctl vol">
            <Icon name="volume" />
            <input
              type="range"
              dir="ltr"
              min={0}
              max={1}
              step={0.01}
              value={prefs.volume}
              onChange={(e) => setPrefs((p) => ({ ...p, volume: Number(e.target.value) }))}
              style={{ ['--p' as string]: `${prefs.volume * 100}%` }}
            />
          </label>
          <div className="seg" title="מה כתוב על הקלידים">
            {(
              [
                ['keys', 'מקשים'],
                ['notes', 'תווים'],
                ['none', 'ללא']
              ] as const
            ).map(([v, l]) => (
              <button key={v} className={prefs.labels === v ? 'on' : ''} onClick={() => setPrefs((p) => ({ ...p, labels: v }))}>
                {l}
              </button>
            ))}
          </div>
          <button className="round" onClick={() => setHelp(true)} title="קיצורי מקלדת">
            <Icon name="help" />
          </button>
        </div>
      </footer>

      {help && (
        <div className="modal-wrap" onClick={() => setHelp(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>איך מנגנים</h2>
            <ul className="help">
              <li>כל שורה במקלדת היא סולם שעולה משמאל לימין, ומתחילה בדו</li>
              <li><kbd>Z</kbd> אוקטבה 2, <kbd>A</kbd> אוקטבה 3, <kbd>Q</kbd> אוקטבה 4, <kbd>1</kbd> אוקטבה 5</li>
              <li><kbd>Shift</kbd> + מקש: הקליד השחור שמעליו (דיאז)</li>
              <li><kbd>רווח</kbd> דוושת הדהוד (להחזיק)</li>
              <li><kbd>←</kbd> <kbd>→</kbd> הזזת אוקטבה</li>
              <li><kbd>↑</kbd> <kbd>↓</kbd> העלאה או הורדה בחצי טון</li>
              <li><kbd>Esc</kbd> השתקת כל הצלילים</li>
            </ul>
            <p className="dim">אפשר לגרור קובץ MIDI לחלון כדי לפתוח אותו. כדי לתרגל יד אחת, כבו את הערוץ שלה בסרגל השיר ונגנו אותו בעצמכם.</p>
            <p className="credit">
              צליל הפסנתר: <bdi dir="ltr">Salamander Grand Piano · Alexander Holm · CC BY 3.0</bdi>
            </p>
            <button className="btn primary" onClick={() => setHelp(false)}>הבנתי</button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
