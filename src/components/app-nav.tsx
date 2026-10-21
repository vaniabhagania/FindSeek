"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building, Columns, Home, Lock, Person, Plus, Search } from "./icons";

const NAV = [
  { href: "/dashboard", label: "Today", Icon: Home },
  { href: "/jobs", label: "Jobs", Icon: Search },
  { href: "/tracker", label: "Applications", Icon: Columns },
  { href: "/profile", label: "Profile", Icon: Person },
];
const SECONDARY = [
  { href: "/settings", label: "Privacy", Icon: Lock },
  { href: "/admin", label: "Hiring", Icon: Building },
];

const isActive = (path: string, href: string) =>
  href === "/jobs/add" ? path === href : path === href || (path.startsWith(`${href}/`) && path !== "/jobs/add");

/** Left rail on wide screens, bottom tab bar on phones. */
export function AppNav() {
  const path = usePathname();
  return (
    <>
      <nav aria-label="Main" className="no-print hidden w-56 shrink-0 flex-col gap-1 border-r border-line bg-surface px-3 py-5 md:flex">
        <Link href="/dashboard" className="display mb-6 px-2.5 text-[22px] font-semibold" style={{ fontStretch: "80%" }}>
          FindSeek
        </Link>
        <Link href="/jobs/add" className="btn mb-4 w-full justify-start"><Plus /> Bring a job</Link>
        {NAV.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(path, href) ? "page" : undefined}
            className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[15px] text-muted transition-colors hover:bg-raised hover:text-ink aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
          >
            <Icon /> {label}
          </Link>
        ))}
        <div className="mt-auto space-y-1 border-t border-line pt-3">
          {SECONDARY.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(path, href) ? "page" : undefined}
              className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-raised hover:text-ink aria-[current=page]:text-ink"
            >
              <Icon /> {label}
            </Link>
          ))}
        </div>
      </nav>

      <nav
        aria-label="Main"
        className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {[...NAV.slice(0, 2), { href: "/jobs/add", label: "Add", Icon: Plus }, ...NAV.slice(2)].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(path, href) ? "page" : undefined}
            className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11.5px] text-muted aria-[current=page]:text-accent"
          >
            <Icon /> {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
