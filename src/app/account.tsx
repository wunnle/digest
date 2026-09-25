"use client";

/** The header's account control, shared by the digest and the sources page. */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Signed in: a small gradient avatar with your initial. The email and sign-out
 * live behind it, since neither is something you need to see while reading.
 */
export function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account"
        className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 via-violet-500 to-rose-400 text-sm font-semibold uppercase text-white shadow-lg shadow-violet-500/20 ring-2 ring-neutral-950 transition hover:scale-105 focus:outline-none focus-visible:ring-white/40"
      >
        {email[0]}
        {/* A little "you're in" dot. */}
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-neutral-950" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 text-sm shadow-2xl backdrop-blur">
          <div className="px-3.5 py-3">
            <p className="text-xs text-neutral-500">Signed in as</p>
            <p className="mt-0.5 truncate text-neutral-200">{email}</p>
          </div>
          <Link
            href="/sources"
            className="block border-t border-white/10 px-3.5 py-2.5 text-neutral-400 transition hover:bg-white/5 hover:text-white"
          >
            Sources
          </Link>
          <form action="/api/auth/logout" method="post" className="border-t border-white/10">
            <button className="w-full px-3.5 py-2.5 text-left text-neutral-400 transition hover:bg-white/5 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * Google's dark-theme button: #131314 fill, #8E918F outline, the four-colour G.
 */
export function SignInButton() {
  return (
    <a
      href="/api/auth/login"
      className="flex h-9 items-center gap-2 rounded-full border border-[#8E918F] bg-[#131314] px-3.5 text-sm font-medium text-[#E3E3E3] transition hover:bg-[#1f1f20] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <GoogleIcon />
      <span className="hidden sm:inline">Sign in with Google</span>
      <span className="sm:hidden">Sign in</span>
    </a>
  );
}
