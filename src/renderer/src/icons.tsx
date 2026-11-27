const P: Record<string, React.JSX.Element> = {
  logo: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M8 4v9M12 4v16M16 4v9" />
      <rect x="6.6" y="4" width="2.8" height="8" rx=".6" fill="currentColor" stroke="none" />
      <rect x="14.6" y="4" width="2.8" height="8" rx=".6" fill="currentColor" stroke="none" />
    </>
  ),
  music: <path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  note: <path d="M12 17V4l6 2M12 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  mic: <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  midi: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="2" />
      <path d="M6 7v5M10 7v5M14 7v5M18 7v5" />
    </>
  ),
  play: <path d="M7 5v14l12-7Z" fill="currentColor" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />,
  save: <path d="M12 3v12m0 0-4-4m4 4 4-4M5 19h14" />,
  pedal: <path d="M7 20h10M9 20l1-12a2 2 0 0 1 4 0l1 12M12 4V2" />,
  volume: <path d="M4 9v6h4l5 4V5L8 9Zm12.5-1.5a6 6 0 0 1 0 9M19 5a9.5 9.5 0 0 1 0 14" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  teacher: <path d="M22 10 12 5 2 10l10 5 10-5Zm-16 2v5c3 2.5 9 2.5 12 0v-5M22 10v6" />,
  help: <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 18h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />,
  loop: <path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />,
  metronome: <path d="M12 3 5 20h14L12 3Zm0 0v10m0 0 4.5-6" />,
  trash: <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m-9 0 1 14a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-14" />,
  sparkles: <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Zm7 12l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" />,
  layers: <path d="m12 2 9 4.5-9 4.5-9-4.5L12 2Zm-9 9.5 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />,
  palette: <path d="M12 2a10 10 0 0 0 0 20c1.3 0 2.2-1 2.2-2.2 0-.6-.2-1.1-.6-1.5-.4-.4-.6-.9-.6-1.5 0-1.2 1-2.2 2.2-2.2H18a4 4 0 0 0 4-4A8.5 8.5 0 0 0 12 2Zm-4.5 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm3-3a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm2.5 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />,
  arp: <path d="M4 17l4-4 4 4 4-8 4 4" />,
  wave: <path d="M2 12h3l2-5 3 10 3-14 3 12 2-3h4" />,
  drum: <><ellipse cx="12" cy="8" rx="8" ry="3.5" /><path d="M4 8v8c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5V8M8 11.2v7.8M16 11.2v7.8" /></>
}

export function Icon({ name }: { name: string }): React.JSX.Element {
  return (
    <svg className="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name]}
    </svg>
  )
}
