/**
 * The footer shared across kafagoz projects (after splendor-explorer's): the
 * kafagoz mark on a hairline, then credits and links.
 */

const LINKS = [
  { href: "https://github.com/wunnle/digest", label: "view on GitHub" },
  { href: "https://kafagoz.com/", label: "kafagoz.com" },
  { href: "https://wunnle.dev/", label: "wunnle.dev" },
];

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-[42rem] px-4 pb-6 pt-6 text-center text-xs">
      <div className="flex items-center justify-center">
        <div className="h-px flex-1 bg-white/[0.08]" />
        <svg width="32" height="14" viewBox="0 0 48 21" fill="none" aria-hidden className="mx-4 inline-block">
          <path d="M24 12L32 11.7L24 0.4V12Z" fill="#0D79BE" />
          <path d="M24 12L16 11.7L24 0.4V12Z" fill="#3790BB" />
          <path d="M24 12L0.7 0L7 21L18 17L24 12Z" fill="#F69226" />
          <path d="M24 12L47.3 0L41 21L30 17L24 12Z" fill="#D06A29" />
          <path d="M24 12L41 21H7L24 12Z" fill="#ED7723" />
        </svg>
        <div className="h-px flex-1 bg-white/[0.08]" />
      </div>
      <div className="flex flex-col items-center justify-center gap-2 pt-4 text-neutral-500 sm:flex-row sm:gap-4">
        <span>made with ♥ by wunnle</span>
        <nav className="flex items-center gap-2">
          {LINKS.map((l, i) => (
            <span key={l.href} className="flex items-center gap-2">
              {i > 0 && <span className="text-neutral-700">•</span>}
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-neutral-300 hover:underline">
                {l.label}
              </a>
            </span>
          ))}
        </nav>
      </div>
    </footer>
  );
}
