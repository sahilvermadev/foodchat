import { render, screen } from '@testing-library/react';
import type { NavLink } from '~/common';
import Sidebar from '../Sidebar';

jest.mock('../ExpandedPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="icon-strip" />,
}));

jest.mock('~/components/SidePanel/Nav', () => ({
  __esModule: true,
  default: () => <div data-testid="active-panel" />,
}));

const links: NavLink[] = [];

describe('Sidebar', () => {
  it('keeps panel content at its expanded width while the outer shell animates', () => {
    render(
      <Sidebar
        links={links}
        expanded={false}
        contentWidth={420}
        onCollapse={jest.fn()}
        onExpand={jest.fn()}
        onResizeStart={jest.fn()}
        onResizeKeyboard={jest.fn()}
      />,
    );

    expect(screen.getByTestId('desktop-sidebar-content')).toHaveStyle({ width: '420px' });
  });
});
