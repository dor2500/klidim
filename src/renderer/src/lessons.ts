// Step-by-step lessons for the teacher mode. Each one is a song plus the tracks the
// student plays; the teacher waits on every one of those notes.
import { makeSong, type Song } from './music'
import { furElise, hatikvah, minuetInG, odeToJoy, seq, twinkle, yonatan } from './songs'

export type Lesson = {
  id: string
  title: string
  intro: string
  /** Tracks the student plays (0 = right hand, 1 = left hand). */
  play: number[]
  make: () => Song
}

const drill = (name: string, text: string, track = 0, beat = 0.6): Song =>
  makeSong(name, seq(text, beat, track, 0.6), track === 0 ? ['יד ימין'] : ['יד שמאל'])

export const LESSONS: Lesson[] = [
  {
    id: 'do',
    title: 'הצליל הראשון: דו',
    intro: 'דו הוא הקליד הלבן שנמצא משמאל לזוג הקלידים השחורים. במקלדת המחשב זה המקש Q. כשהקליד מהבהב, לחצו עליו.',
    play: [0],
    make: () => drill('הצליל הראשון: דו', 'C4 C4 C4:2 C4 C4 C4:2')
  },
  {
    id: 'do-re-mi',
    title: 'דו, רה, מי',
    intro: 'שלושה קלידים צמודים: Q הוא דו, W הוא רה, E הוא מי. כל מקש מימין עולה צליל אחד.',
    play: [0],
    make: () => drill('דו, רה, מי', 'C4 D4 E4:2 E4 D4 C4:2 C4 D4 E4 D4 C4:2')
  },
  {
    id: 'scale',
    title: 'הסולם המלא',
    intro: 'כל השורה העליונה היא סולם: Q W E R T Y U ואז I שחוזר לדו, אוקטבה אחת למעלה. עלו ואחר כך רדו.',
    play: [0],
    make: () => drill('הסולם המלא', 'C4 D4 E4 F4 G4 A4 B4 C5:2 C5 B4 A4 G4 F4 E4 D4 C4:2', 0, 0.5)
  },
  {
    id: 'left',
    title: 'יד שמאל: הבס',
    intro: 'יד שמאל מנגנת בשורה האמצעית. A הוא דו נמוך, D הוא מי ו-G הוא סול. יחד הם אקורד דו מז׳ור.',
    play: [1],
    make: () => drill('יד שמאל: הבס', 'C3 E3 G3:2 G3 E3 C3:2 C3 G3 C3:2', 1)
  },
  {
    id: 'yonatan-rh',
    title: 'יונתן הקטן: יד ימין',
    intro: 'שיר ילדים מוכר בסולם דו מז׳ור. יד ימין מנגנת את המנגינה, והמורה מלווה ביד שמאל.',
    play: [0],
    make: yonatan
  },
  {
    id: 'twinkle-rh',
    title: 'כוכב קטן: יד ימין',
    intro: 'השיר הראשון! אתם מנגנים את המנגינה, והמורה מנגן את יד שמאל. השיר מחכה לכם בכל צליל, אז אין לחץ.',
    play: [0],
    make: twinkle
  },
  {
    id: 'hatikvah-rh',
    title: 'התקווה: סולם מינור',
    intro: 'שימו לב לתחושה המינורית ולצליל סול♯ בסוף (Shift+T). נגנו בקצב שלכם.',
    play: [0],
    make: hatikvah
  },
  {
    id: 'ode-rh',
    title: 'אודה לשמחה: יד ימין',
    intro: 'המנגינה המפורסמת של בטהובן. רובה קלידים צמודים, אז שימו את האצבעות על Q W E R T ולא תצטרכו לזוז.',
    play: [0],
    make: odeToJoy
  },
  {
    id: 'twinkle-both',
    title: 'כוכב קטן: שתי ידיים',
    intro: 'עכשיו שתי הידיים יחד. כשמהבהבים שני קלידים, לחצו על שניהם. אפשר בזה אחר זה, המורה יחכה.',
    play: [0, 1],
    make: twinkle
  },
  {
    id: 'minuet-rh',
    title: 'מינואט בסול: באך',
    intro: 'יצירה קלאסית עם פה♯ (Shift+R). שמרו על זרימה נעימה של יד ימין.',
    play: [0],
    make: minuetInG
  },
  {
    id: 'elise-rh',
    title: 'לאליזה: יד ימין',
    intro: 'אתגר: המנגינה מתחילה ב-3 (מי) ו-Shift+2 (רה♯, קליד שחור). נגנו לאט, המורה תמיד מחכה.',
    play: [0],
    make: furElise
  }
]

const PROGRESS_KEY = 'klidim-lessons'
export function loadProgress(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}')
  } catch {
    return {}
  }
}
export function saveStars(id: string, stars: number): Record<string, number> {
  const p = loadProgress()
  p[id] = Math.max(p[id] ?? 0, stars)
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
  return p
}
export const starsFor = (accuracy: number): number => (accuracy >= 95 ? 3 : accuracy >= 80 ? 2 : 1)
