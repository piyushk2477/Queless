import { Bell, LogOut, Menu, Moon, Sun, Ticket, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useRealtime';
import { useScrolled } from '../hooks/useScroll';
import { chime } from '../lib/sound';
import { useApp } from '../store/app';
import { Spinner, clsx } from './ui';

export function Logo({ className }) {
  return (
    <Link to="/" className={clsx('flex items-center gap-2', className)} aria-label="QueLess home">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-bold text-bg">Q</span>
      <span className="text-lg font-bold tracking-tight">
        Que<span className="accent-text">Less</span>
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useApp();
  return (
    <button onClick={toggleTheme} className="btn btn-ghost btn-sm !px-2.5" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

/** Slim, dismissible announcement bar. */
function Announcement() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('ql_hide_banner') !== '1';
    } catch {
      return true;
    }
  });
  if (!open) return null;
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem('ql_hide_banner', '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="no-print px-3 pt-3">
      <div className="relative mx-auto flex max-w-7xl items-center justify-center gap-3 rounded-full bg-accent-soft px-12 py-2 text-center text-sm text-ink-2">
        <Ticket size={16} className="hidden shrink-0 text-accent sm:block" />
        <span>Businesses: QueLess is free during the beta.</span>
        <Link to="/biz/onboard" className="btn btn-sm hidden bg-surface sm:inline-flex">Get started</Link>
        <button onClick={close} className="absolute right-3 rounded-full p-1.5 text-muted hover:text-ink" aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

const navCls = ({ isActive }) => clsx('text-[0.95rem] font-medium transition-colors hover:text-ink', isActive ? 'text-ink' : 'text-muted');

function Navbar() {
  const { user, memberships, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const scrolled = useScrolled();
  const { unread } = useNotifications(user?.id, (n) => {
    chime(1);
    toast(n.title, { description: n.body });
  });
  useEffect(() => setOpen(false), [location.pathname]);

  const dashboard = user?.role === 'admin' ? '/admin' : memberships.length ? '/biz' : '/me/tokens';
  const links = (
    <>
      <NavLink to="/discover" className={navCls}>Discover</NavLink>
      <a href="/#how" className="text-[0.95rem] font-medium text-muted hover:text-ink">How it works</a>
      <NavLink to="/biz" className={navCls}>For business</NavLink>
      {user && <NavLink to="/me/tokens" className={navCls}>My tokens</NavLink>}
    </>
  );

  return (
    <header className={clsx('no-print sticky top-0 z-[500] bg-bg/90 backdrop-blur transition-shadow', scrolled && 'shadow-[0_1px_0_var(--line)]')}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
        <Logo />
        <nav className="hidden items-center gap-8 md:flex">{links}</nav>
        <div className="flex items-center gap-1.5">
          {user && (
            <Link to="/me/notifications" className="btn btn-ghost btn-sm relative !px-2.5" aria-label={`${unread} unread notifications`}>
              <Bell size={18} />
              {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />}
            </Link>
          )}
          <ThemeToggle />
          {user ? (
            <>
              <button className="btn btn-ghost btn-sm hidden sm:inline-flex" onClick={() => void logout()}>
                <LogOut size={16} /> Log out
              </button>
              <Link to={dashboard} className="btn btn-primary btn-sm hidden sm:inline-flex">Dashboard</Link>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm hidden sm:inline-flex">Log in</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Get started</Link>
            </>
          )}
          <button className="btn btn-ghost btn-sm !px-2.5 md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="pop-in flex flex-col gap-4 border-t border-line px-5 py-5 md:hidden">
          {links}
          {user ? (
            <div className="flex gap-2">
              <Link to={dashboard} className="btn btn-primary btn-sm">Dashboard</Link>
              <button className="btn btn-sm" onClick={() => void logout()}>Log out</button>
            </div>
          ) : (
            <Link to="/login" className="btn btn-sm self-start">Log in</Link>
          )}
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="no-print mt-24 border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm text-muted">Join the queue, not the crowd. Live tokens for clinics, banks, salons and offices across Pune.</p>
        </div>
        <div className="grid grid-cols-2 gap-10 text-sm sm:gap-16">
          <div className="flex flex-col gap-2.5">
            <p className="font-semibold">Product</p>
            <Link to="/discover" className="text-muted hover:text-ink">Find a queue</Link>
            <Link to="/me/tokens" className="text-muted hover:text-ink">My tokens</Link>
            <Link to="/biz/onboard" className="text-muted hover:text-ink">For business</Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <p className="font-semibold">Devices</p>
            <Link to="/kiosk" className="text-muted hover:text-ink">Reception kiosk</Link>
            <span className="text-muted">TV: /display/&lt;business&gt;</span>
          </div>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-muted">© {new Date().getFullYear()} QueLess · Made in Pune</div>
    </footer>
  );
}

export function AppShell() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>
      <Announcement />
      <Navbar />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export function Container({ children, className }) {
  return <div className={clsx('relative mx-auto w-full max-w-7xl px-5 py-10 sm:py-14', className)}>{children}</div>;
}

/** Route guard: needs a session (and optionally one of some roles). */
export function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children ?? <Outlet />;
}
