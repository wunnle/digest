"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountMenu, SignInButton } from "./account";
import { Icon, type AuthStatus } from "./ui";

/**
 * The frame every page shares, so the feed and its settings pages read as one
 * app: a reading column centred on the screen, a header that gets out of the
 * way, and — on wide screens — a sidebar just left of the column with the
 * page links first and anything page-specific (the feed's filters) below.
 */

/** Hidden while scrolling down, back the moment you scroll up. */
function useHeadroom() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        // Near the top it always shows; elsewhere a few pixels of intent
        // either way flips it, so tiny jitters don't.
        if (y < 64) setHidden(false);
        else if (y - last > 6) setHidden(true);
        else if (last - y > 6) setHidden(false);
        last = y;
        queued = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return hidden;
}

const FeedIcon = () => (
  <Icon>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </Icon>
);
const SourcesIcon = () => (
  <Icon>
    <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" />
    <circle cx="5" cy="19" r="1" />
  </Icon>
);
const InsightsIcon = () => (
  <Icon>
    <path d="M3 3v18h18M8 17v-6M13 17V7M18 17v-3" />
  </Icon>
);

function NavLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 transition ${
        active ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

function Nav() {
  return (
    <nav className="space-y-5" aria-label="Pages">
      <NavLink href="/" label="Feed" icon={<FeedIcon />} />
      <div>
        <h2 className="px-2.5 text-xs uppercase tracking-wider text-neutral-600">Settings</h2>
        <div className="mt-1.5 space-y-0.5">
          <NavLink href="/sources" label="Sources" icon={<SourcesIcon />} />
          <NavLink href="/insights" label="Insights" icon={<InsightsIcon />} />
        </div>
      </div>
    </nav>
  );
}

export function Shell({
  title,
  subtitle,
  controls,
  sidebar,
  wide = false,
  status,
  email,
  children,
}: {
  /** The page's name beside the wordmark; the feed has none. */
  title?: string;
  subtitle?: React.ReactNode;
  /** Extra header controls, left of the account. */
  controls?: React.ReactNode;
  /** Page-specific sidebar content, under the page links. */
  sidebar?: React.ReactNode;
  /** The feed's grid: full width, no sidebar. */
  wide?: boolean;
  status: AuthStatus;
  email: string | null;
  children: React.ReactNode;
}) {
  const hidden = useHeadroom();

  const header = (
    // Sticky rather than fixed, so it keeps its place in the column; the
    // backdrop runs a little past the column so posts don't peek at its edges.
    <div
      className={`sticky top-0 z-30 -mx-4 bg-neutral-950/85 px-4 py-3 backdrop-blur-md transition-transform duration-300 sm:-mx-6 sm:px-6 ${
        hidden ? "-translate-y-full" : ""
      }`}
    >
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link href="/" className="text-lg font-semibold tracking-tight text-white transition hover:text-neutral-300">
            Digest
          </Link>
          {title && (
            <>
              <span className="text-neutral-600">/</span>
              <h1 className="text-lg text-neutral-400">{title}</h1>
            </>
          )}
          {subtitle && <div className="ml-1 truncate text-sm text-neutral-500">{subtitle}</div>}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {controls}
          {/* Nothing until the session check lands, so the control doesn't flash. */}
          <div className="flex h-9 shrink-0 items-center">
            {status === "signedIn" && email && <AccountMenu email={email} />}
            {status === "signedOut" && <SignInButton />}
          </div>
        </div>
      </header>
    </div>
  );

  return (
    <main className="relative flex-1 overflow-x-clip px-4 pb-12 pt-3 text-neutral-200 sm:px-8 sm:pt-6">
      {/* Cool ambient wash behind the top rows, so the page isn't flat black */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[80rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(56,130,246,0.12),transparent)] blur-2xl"
      />
      {wide ? (
        <div className="relative mx-auto max-w-[95rem]">
          {header}
          {children}
        </div>
      ) : (
        // An empty third column balances the sidebar, so the column stays
        // centred on the screen. Below xl there's no room beside it.
        <div className="relative xl:grid xl:grid-cols-[minmax(0,1fr)_42rem_minmax(0,1fr)] xl:gap-10">
          <aside className="hidden xl:block xl:w-52 xl:justify-self-end">
            <div className="sticky top-6 space-y-8 pt-3 text-sm">
              <Nav />
              {sidebar}
            </div>
          </aside>
          <div className="mx-auto w-full max-w-[42rem]">
            {header}
            {children}
          </div>
        </div>
      )}
    </main>
  );
}
