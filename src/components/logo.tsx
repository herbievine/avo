export function Logo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="currentColor" />
      <path
        d="M256 92c-52 0-86 44-98 96-8 36-34 60-34 112 0 74 60 120 132 120s132-46 132-120c0-52-26-76-34-112-12-52-46-96-98-96z"
        fill="#a3e635"
      />
      <path
        d="M256 128c-38 0-64 34-73 76-7 30-27 50-27 92 0 58 46 92 100 92s100-34 100-92c0-42-20-62-27-92-9-42-35-76-73-76z"
        fill="#d9f99d"
      />
      <circle cx="256" cy="304" r="54" fill="#78350f" />
      <circle cx="240" cy="288" r="16" fill="#a16207" opacity=".8" />
    </svg>
  )
}
