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
  help: <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5M12 18h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />
}

export function Icon({ name }: { name: string }): React.JSX.Element {
  return (
    <svg className="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name]}
    </svg>
  )
}
