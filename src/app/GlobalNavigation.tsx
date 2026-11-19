import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { ActionMenu } from '../ui/ActionMenu';
import { MenuIcon } from '../ui/icons';
import styles from './GlobalNavigation.module.css';
import { href, navigate } from './router';
import { rememberStudioPath } from './studioEntry';

type PrimaryId = 'library' | 'perform' | 'studio' | 'collaborate';

interface NavItem {
  id: PrimaryId;
  path: string;
  label: string;
  title?: string;
}

/** The primary destination represented by an app route. */
export function primaryForPath(path: string): PrimaryId | null {
  if (path === '/' || path.startsWith('/prepare') || path.startsWith('/signature/')) return 'library';
  if (path.startsWith('/album/')) return 'library';
  if (path === '/perform' || path.startsWith('/perform/') || path.startsWith('/performance/'))
    return 'perform';
  if (path === '/studio' || path.startsWith('/studio/')) return 'studio';
  if (path === '/collaborative' || path.startsWith('/collaborative/')) return 'collaborate';
  return null;
}

/**
 * At this width and narrower the links fold into a Menu button. Keep it in step with
 * GlobalNavigation.module.css (CSS can't read it from here).
 */
export const COMPACT_NAV_QUERY = '(max-width: 720px)';

/**
 * The single global app navigation: logo, four primary destinations and secondary pages in
 * More. Wide windows show the links in a row; phones use one disclosure for the same content.
 */
export function GlobalNavigation({ current }: { current: string }) {
  const listId = useId();
  const navRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === current;
  const active = primaryForPath(current);
  const secondaryActive = ['/guide', '/help', '/settings', '/diagnostics'].some(
    (path) => current === path || current.startsWith(`${path}/`),
  );
  const items: NavItem[] = [
    { id: 'library', path: '/', label: 'Library' },
    { id: 'perform', path: '/perform', label: 'Perform' },
    {
      id: 'studio',
      path: '/studio',
      label: 'Studio',
      title: 'Open Studio compositions',
    },
    { id: 'collaborate', path: '/collaborative', label: 'Collaborate' },
  ];

  useEffect(() => {
    rememberStudioPath(current);
  }, [current]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpenAt(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (navRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
      close();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) close();
    };
    const compact = window.matchMedia(COMPACT_NAV_QUERY);
    const onResize = () => {
      if (!compact.matches) close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    compact.addEventListener('change', onResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      compact.removeEventListener('change', onResize);
    };
  }, [open]);

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (open && next instanceof Node && !event.currentTarget.contains(next)) setOpenAt(null);
  };

  return (
    <header className={styles.header}>
      <a
        className={styles.wordmark}
        href={href('/')}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
          event.preventDefault();
          navigate('/');
        }}
      >
        Synesthesia
      </a>
      <nav ref={navRef} className={styles.nav} aria-label="Main" onBlur={onBlur}>
        <button
          ref={buttonRef}
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpenAt(open ? null : current)}
        >
          <MenuIcon />
          Menu
        </button>
        <div id={listId} className={styles.navContent} data-open={open ? '' : undefined}>
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id} className={styles.item}>
                <a
                  href={href(item.path)}
                  title={item.title}
                  aria-current={active === item.id ? 'page' : undefined}
                  onClick={(event) => {
                    setOpenAt(null);
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    navigate(item.path);
                  }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <ActionMenu
            label="More"
            buttonText="More"
            current={secondaryActive}
            className={`${styles.moreButton} ${secondaryActive ? styles.moreActive : ''}`}
            items={[
              { label: 'Guide', onSelect: () => navigate('/guide') },
              { label: 'Help', onSelect: () => navigate('/help') },
              { label: 'Settings', onSelect: () => navigate('/settings') },
              { label: 'Diagnostics', onSelect: () => navigate('/diagnostics') },
              { label: 'Supervised Arts (Future concept)', onSelect: () => undefined, disabled: true },
            ]}
          />
        </div>
      </nav>
    </header>
  );
}
