import { useLocation } from 'react-router-dom';
import type { NavLink } from '~/common';
import { useActivePanel } from '~/Providers';
import { getPanelLinks, resolveRenderedPanel } from './panelSelection';

export default function Nav({ links }: { links: NavLink[] }) {
  const location = useLocation();
  const { active } = useActivePanel();
  const panelLinks = getPanelLinks(links);
  const effectiveActive = resolveRenderedPanel(active, links, location.pathname);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden text-text-primary">
      {panelLinks.map((link) =>
        link.id === effectiveActive && link.Component ? <link.Component key={link.id} /> : null,
      )}
    </div>
  );
}
