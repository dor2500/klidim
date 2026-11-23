import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { engine, type Effects, type LessonStats, type TeachEvent } from './engine'
import { INSTRUMENTS, type InstrumentId } from './instruments'
import { LESSONS, loadProgress, saveStars, starsFor, type Lesson } from './lessons'
import { connectMidiInputs, pickMidi, saveSong, songFromMidi } from './midi'
import { buildKeymap, codeLabel, fmtTime, isBlack, keyNote, noteName, pianoRange, type Song } from './music'
import { BUILTIN } from './songs'
import { Stage, TRACK_COLORS } from './Stage'
import { Icon } from './icons'

type Labels = 'keys' | 'notes' | 'none'
type Prefs = Effects & { volume: number; octave: number; labels: Labels; instrument: InstrumentId; touch: number }

const DEFAULT_FX: Effects = { reverb: 0.27, delay: 0, delayTime: 0.25, brightness: 1 }
const DEFAULTS: Prefs = { volume: 0.8, octave: 0, labels: 'keys', instrument: 'piano', touch: 0.78, ...DEFAULT_FX }
const PREFS_KEY = 'klidim-prefs'
function loadPrefs(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
  } catch {
    return DEFAULTS
  }
}
const fxOf = (p: Prefs): Effects => ({ reverb: p.reverb, delay: p.delay, delayTime: p.delayTime, brightness: p.brightness })

type Teacher = { text: string; tone: 'info' | 'good' | 'bad' }
const PRAISE = ['יופי!', 'מצוין!', 'כל הכבוד!', 'נהדר!', 'בדיוק ככה!', 'איזה כישרון!']

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
  const [settings, setSettings] = useState(false)
  const [played, setPlayed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // teacher
  const [learn, setLearn] = useState(false)
  const [mine, setMine] = useState<number[]>([0])
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [progress, setProgress] = useState({ index: 0, total: 0 })
  const [result, setResult] = useState<(LessonStats & { stars: number }) | null>(null)
  const [stars, setStars] = useState<Record<string, number>>(loadProgress)
  const seeking = useRef(false)

  const say = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
    engine.setVolume(prefs.volume)
    engine.setEffects(fxOf(prefs))
  }, [prefs])
  useEffect(() => {
    if (status === 'ready') engine.setInstrument(prefs.instrument)
  }, [prefs.instrument, status])

  // boot: samples + MIDI keyboards
  useEffect(() => {
    const p = loadPrefs()
    engine
      .init(fxOf(p))
      .then(() => {
        engine.setVolume(p.volume)
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

  /** "רה4 (W)" – the note and the computer key that plays it. */
  const keyFor = useCallback(
    (m: number): string => {
      for (const [code, n] of keymap) if (n === m) return codeLabel(code)
      if (isBlack(m)) for (const [code, n] of keymap) if (n === m - 1) return `Shift+${codeLabel(code)}`
      return ''
    },
    [keymap]
  )
  const describe = useCallback(
    (notes: number[]): string =>
      notes
        .map((m) => {
          const k = keyFor(m)
          return k ? `${noteName(m)} · מקש ${k}` : `${noteName(m)} (הקליד המסומן)`
        })
        .join('  +  '),
    [keyFor]
  )

  // teacher events
  const lessonRef = useRef<Lesson | null>(null)
  lessonRef.current = lesson
  useEffect(() => {
    engine.onTeach = (e: TeachEvent) => {
      if (e.type === 'wait') {
        setProgress({ index: e.index, total: e.total })
        setTeacher((t) => ({
          text: `${t?.tone === 'good' ? t.text + '  ' : ''}נגנו: ${describe(e.notes)}`,
          tone: 'info'
        }))
      } else if (e.type === 'hit') {
        setProgress({ index: e.index, total: e.total })
        if (e.streak > 0 && e.streak % 8 === 0) {
          setTeacher({ text: `${PRAISE[(e.streak / 8) % PRAISE.length]} ${e.streak} ברצף 🔥`, tone: 'good' })
        } else setTeacher((t) => (t?.tone === 'bad' ? { text: PRAISE[e.index % PRAISE.length], tone: 'good' } : t))
      } else if (e.type === 'wrong') {
        setTeacher({ text: `זה ${noteName(e.midi)}. צריך: ${describe(e.expected)}`, tone: 'bad' })
      } else if (e.type === 'done') {
        const s = starsFor(e.stats.accuracy)
        const l = lessonRef.current
        if (l) setStars(saveStars(l.id, s))
        setResult({ ...e.stats, stars: s })
        setTeacher({ text: 'סיימתם! 🎉', tone: 'good' })
        setPlaying(false)
      }
    }
  }, [describe])

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
        setSettings(false)
        return
      }
      const base = keymap.get(e.code)
      if (base === undefined || e.repeat || pressed.current.has(e.code)) return
      const m = keyNote(base, e.shiftKey)
      e.preventDefault()
      pressed.current.set(e.code, m)
      engine.noteOn(m, prefs.touch)
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
  }, [keymap, prefs.touch])

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
    setLearn(false)
    setLesson(null)
    setTeacher(null)
    setResult(null)
  }
  const togglePlay = (): void => {
    if (!song) return
    if (engine.playing) engine.pause()
    else {
      setResult(null)
      engine.play()
    }
    setPlaying(engine.playing)
  }
  const stopSong = (): void => {
    engine.stop()
    setPlaying(false)
    setTime(0)
    if (engine.learn) setProgress(engine.lessonProgress)
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

  // ---------- teacher ----------
  const setMode = (on: boolean, tracks = mine): void => {
    if (!song) return
    const valid = tracks.filter((t) => t < song.tracks.length)
    const use = valid.length ? valid : [0]
    engine.stop()
    engine.setLearn(on, use)
    setPlaying(false)
    setTime(0)
    setLearn(on)
    setMine(use)
    setResult(null)
    setProgress(engine.lessonProgress)
    setTeacher(
      on
        ? { text: lesson?.intro ?? 'אני אחכה לכם בכל צליל. הקלידים שצריך לנגן יהבהבו בצהוב. לחצו ▶ כשאתם מוכנים.', tone: 'info' }
        : null
    )
  }
  const toggleMine = (i: number): void => {
    const next = mine.includes(i) ? mine.filter((t) => t !== i) : [...mine, i].sort()
    if (!next.length) return
    setMode(true, next)
  }
  const startLesson = (l: Lesson): void => {
    const s = l.make()
    loadSong(s)
    engine.setLearn(true, l.play)
    setLesson(l)
    setLearn(true)
    setMine(l.play)
    setProgress(engine.lessonProgress)
    setTeacher({ text: l.intro, tone: 'info' })
  }
  const nextLesson = lesson ? LESSONS[LESSONS.findIndex((l) => l.id === lesson.id) + 1] : undefined

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
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]): void => setPrefs((p) => ({ ...p, [k]: v }))
  const blurAfter = (e: React.MouseEvent): void => (e.currentTarget as HTMLElement).blur()
  const inst = INSTRUMENTS.find((i) => i.id === prefs.instrument) ?? INSTRUMENTS[0]

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
            <Icon name={lesson ? 'teacher' : 'music'} />
            <span className="picker-name">{lesson ? lesson.title : song ? song.name : 'בחירת שיר או שיעור'}</span>
            <Icon name="chevron" />
          </button>
          {menu && (
            <>
              <div className="scrim" onClick={() => setMenu(false)} />
              <div className="menu" role="menu">
                <div className="menu-label">שיעורים עם המורה</div>
                <div className="lesson-list">
                  {LESSONS.map((l, i) => (
                    <button key={l.id} className="menu-item lesson" onClick={() => startLesson(l)}>
                      <span className="step">{i + 1}</span>
                      <span className="lesson-title">{l.title}</span>
                      <span className="stars" aria-label={`${stars[l.id] ?? 0} כוכבים`}>
                        {[1, 2, 3].map((n) => (
                          <span key={n} className={n <= (stars[l.id] ?? 0) ? 'on' : ''}>★</span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="menu-label">שירים</div>
                {BUILTIN.map((b) => {
                  const s = b.make()
                  return (
                    <button key={b.id} className="menu-item" onClick={() => loadSong(s)}>
                      <Icon name="note" /> {s.name}
                      <span className="menu-meta">{fmtTime(s.duration)}</span>
                    </button>
                  )
                })}
                <button className="menu-item accent" onClick={openFile}>
                  <Icon name="folder" /> פתיחת קובץ MIDI…
                </button>
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
          <div className="top-stack">
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
              <div className="seg mode" title="איך לנגן את השיר">
                <button className={!learn ? 'on' : ''} onClick={() => setMode(false)}>האזנה</button>
                <button className={learn ? 'on teach' : ''} onClick={() => setMode(true)}>
                  <Icon name="teacher" /> עם מורה
                </button>
              </div>
              <div className="tracks">
                {learn && <span className="tracks-label">אני מנגן:</span>}
                {song.tracks.map((t, i) =>
                  learn ? (
                    <button key={i} className={`track ${mine.includes(i) ? 'mine' : 'off'}`} onClick={() => toggleMine(i)}>
                      <span className="dot" style={{ background: TRACK_COLORS[i % TRACK_COLORS.length] }} />
                      {t.name}
                    </button>
                  ) : (
                    <button
                      key={i}
                      className={`track ${muted.includes(i) ? 'off' : ''}`}
                      onClick={() => toggleTrack(i)}
                      title={muted.includes(i) ? 'הפעלת הערוץ' : 'השתקת הערוץ'}
                    >
                      <span className="dot" style={{ background: TRACK_COLORS[i % TRACK_COLORS.length] }} />
                      {t.name}
                    </button>
                  )
                )}
              </div>
            </div>

            {learn && teacher && (
              <div className={`teacher ${teacher.tone}`} role="status" aria-live="polite">
                <span className="teacher-avatar" aria-hidden>
                  <Icon name="teacher" />
                </span>
                <div className="teacher-body">
                  <div className="teacher-name">המורה</div>
                  <div className="teacher-text">{teacher.text}</div>
                  {progress.total > 0 && (
                    <div className="teacher-progress">
                      <div style={{ width: `${(progress.index / progress.total) * 100}%` }} />
                    </div>
                  )}
                </div>
                {!playing && (
                  <button className="btn primary" onClick={togglePlay}>
                    <Icon name="play" />{' '}
                    {progress.index === 0 ? 'התחלה' : progress.index >= progress.total ? 'שוב מההתחלה' : 'המשך'}
                  </button>
                )}
              </div>
            )}
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
              <button className="btn primary" onClick={() => startLesson(LESSONS[0])}>
                <Icon name="teacher" /> שיעור ראשון עם המורה
              </button>
              <button className="btn" onClick={() => setMenu(true)}>
                <Icon name="music" /> שירים ושיעורים
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
          <button className="inst-chip" onClick={() => setSettings(true)} title="החלפת כלי נגינה">
            <span className="emoji" aria-hidden>{inst.emoji}</span>
            {inst.name}
          </button>
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
              onChange={(e) => set('volume', Number(e.target.value))}
              style={{ ['--p' as string]: `${prefs.volume * 100}%` }}
            />
          </label>
          <button className="round" onClick={() => setSettings(true)} title="הגדרות צליל">
            <Icon name="gear" />
          </button>
          <button className="round" onClick={() => setHelp(true)} title="קיצורי מקלדת">
            <Icon name="help" />
          </button>
        </div>
      </footer>

      {settings && (
        <div className="drawer-wrap" onClick={() => setSettings(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="הגדרות">
            <div className="drawer-head">
              <h2>הגדרות</h2>
              <button className="round" onClick={() => setSettings(false)} aria-label="סגירה">
                <Icon name="close" />
              </button>
            </div>

            <section>
              <h3>כלי נגינה</h3>
              <div className="inst-grid">
                {INSTRUMENTS.map((i) => (
                  <button key={i.id} className={`inst ${prefs.instrument === i.id ? 'on' : ''}`} onClick={() => set('instrument', i.id)}>
                    <span className="emoji" aria-hidden>{i.emoji}</span>
                    <span className="inst-name">{i.name}</span>
                    <span className="inst-hint">{i.hint}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3>אפקטים</h3>
              <Slider label="הד (ריוורב)" hint="כמה החדר מהדהד" value={prefs.reverb} onChange={(v) => set('reverb', v)} />
              <Slider label="השהייה (אקו)" hint="חזרות של הצליל אחרי הנגינה" value={prefs.delay} onChange={(v) => set('delay', v)} />
              <div className="row">
                <span>זמן ההשהייה</span>
                <div className="seg">
                  {(
                    [
                      [0.12, 'קצר'],
                      [0.25, 'בינוני'],
                      [0.42, 'ארוך']
                    ] as const
                  ).map(([v, l]) => (
                    <button key={v} className={prefs.delayTime === v ? 'on' : ''} onClick={() => set('delayTime', v)} disabled={prefs.delay === 0}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <Slider label="בהירות" hint="שמאלה: צליל רך ועמום. ימינה: צליל חד" value={prefs.brightness} onChange={(v) => set('brightness', v)} />
            </section>

            <section>
              <h3>נגינה</h3>
              <Slider label="עוצמת הקשה מהמקלדת" hint="כמה חזק נשמע מקש במקלדת המחשב" value={(prefs.touch - 0.3) / 0.7} onChange={(v) => set('touch', 0.3 + v * 0.7)} />
              <div className="row">
                <span>מה כתוב על הקלידים</span>
                <div className="seg">
                  {(
                    [
                      ['keys', 'מקשים'],
                      ['notes', 'תווים'],
                      ['none', 'ללא']
                    ] as const
                  ).map(([v, l]) => (
                    <button key={v} className={prefs.labels === v ? 'on' : ''} onClick={() => set('labels', v)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <button className="btn ghost reset" onClick={() => setPrefs((p) => ({ ...p, ...DEFAULT_FX, touch: DEFAULTS.touch, instrument: 'piano' }))}>
              איפוס להגדרות ברירת המחדל
            </button>
          </aside>
        </div>
      )}

      {result && (
        <div className="modal-wrap" onClick={() => setResult(null)}>
          <div className="modal result" onClick={(e) => e.stopPropagation()}>
            <div className="big-stars" aria-label={`${result.stars} כוכבים`}>
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= result.stars ? 'on' : ''} style={{ animationDelay: `${n * 0.12}s` }}>★</span>
              ))}
            </div>
            <h2>{result.stars === 3 ? 'מושלם!' : result.stars === 2 ? 'כל הכבוד!' : 'סיימתם! עוד קצת תרגול'}</h2>
            <div className="stats">
              <div><b>{result.accuracy}%</b><span>דיוק</span></div>
              <div><b>{result.notes}</b><span>צלילים נכונים</span></div>
              <div><b>{result.wrong}</b><span>טעויות</span></div>
              <div><b>{result.bestStreak}</b><span>הרצף הכי ארוך</span></div>
            </div>
            <p className="dim">
              {result.stars === 3
                ? 'ניגנתם כמעט בלי טעויות. אפשר לנסות במהירות גבוהה יותר או לעבור לשיעור הבא.'
                : 'נסו שוב לאט. המורה מחכה בכל צליל, אז אין צורך למהר.'}
            </p>
            <div className="welcome-actions">
              {nextLesson && (
                <button className="btn primary" onClick={() => startLesson(nextLesson)}>
                  השיעור הבא: {nextLesson.title}
                </button>
              )}
              <button
                className={`btn ${nextLesson ? '' : 'primary'}`}
                onClick={() => {
                  setResult(null)
                  stopSong()
                  setTeacher({ text: 'עוד פעם מההתחלה. לחצו ▶ כשאתם מוכנים.', tone: 'info' })
                }}
              >
                שוב
              </button>
            </div>
          </div>
        </div>
      )}

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
            <p className="dim">
              <b>המורה:</b> בחרו שיעור בתפריט למעלה, או פתחו שיר ובחרו "עם מורה". השיר עוצר בכל צליל שלכם ומחכה
              שתנגנו את הקליד שמהבהב בצהוב.
            </p>
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

function Slider({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }): React.JSX.Element {
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{label}</span>
        <b>{Math.round(value * 100)}%</b>
      </span>
      <input
        type="range"
        dir="ltr"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--p' as string]: `${value * 100}%` }}
      />
      <span className="slider-hint">{hint}</span>
    </label>
  )
}
