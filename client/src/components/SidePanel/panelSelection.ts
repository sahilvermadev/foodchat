import type { NavLink } from '~/common';
import { resolveActivePanel } from '~/Providers/ActivePanelContext';

export function getPanelLinks(links: NavLink[]): NavLink[] {
  return links.filter((link) => Boolean(link.Component));
}

export function resolveRenderedPanel(active: string, links: NavLink[], pathname: string): string {
  const panelLinks = getPanelLinks(links);
  const routePanel = panelLinks.find((link) => link.isActive?.(pathname))?.id;

  return routePanel ?? resolveActivePanel(active, panelLinks);
}
