import Link from 'next/link';

import type { MeResponse } from '@bright-memo/shared';
import { apiGet } from '@/lib/server-api';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let me: MeResponse;
  try {
    me = await apiGet<MeResponse>('/v1/me');
  } catch {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="flex w-60 flex-col border-r bg-white">
        <div className="border-b px-4 py-4">
          <p className="text-sm font-medium text-zinc-900">{me.email}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          <NavItem href="/dashboard">Dashboard</NavItem>
          <NavItem href="/dashboard/memories">Memories</NavItem>
          <NavItem href="/dashboard/projects">Projects</NavItem>
          <NavItem href="/dashboard/search">Search</NavItem>
          <NavItem href="/dashboard/settings">Settings</NavItem>
        </nav>
        <div className="border-t px-3 py-4">
          <Link
            href="/api/auth/logout"
            className="block rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            Logout
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

function NavItem({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
    >
      {children}
    </Link>
  );
}
