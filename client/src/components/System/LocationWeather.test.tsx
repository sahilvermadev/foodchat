import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import LocationWeather from './LocationWeather';

const mockUser = { id: 'user-1' };
let mockMarkdown = '## Location\n- Location: Dwarka, Delhi\n- Timezone: Asia/Calcutta';

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: mockUser }),
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  usePreferencesQuery: () => ({ data: { markdown: mockMarkdown } }),
}));

describe('LocationWeather', () => {
  beforeEach(() => {
    localStorage.clear();
    mockMarkdown = '## Location\n- Location: Dwarka, Delhi\n- Timezone: Asia/Calcutta';
    global.fetch = Object.assign(
      jest.fn(() => new Promise<Response>(() => undefined)),
      {
        preconnect: jest.fn(),
      },
    );
  });

  it('does not display a cache entry belonging to another user', () => {
    const sourceKey = 'query:dwarka, delhi';
    localStorage.setItem(
      `rekky:location-weather:v2:${encodeURIComponent('other-user')}:${encodeURIComponent(sourceKey)}`,
      JSON.stringify({
        town: 'Other town',
        temperature: 20,
        unit: 'C',
        code: 0,
        updatedAt: Date.now(),
        sourceKey,
        expiresAt: Date.now() + 60_000,
      }),
    );

    render(<LocationWeather />);

    expect(screen.getByText('Dwarka')).toBeInTheDocument();
    expect(screen.queryByText('Other town')).not.toBeInTheDocument();
  });

  it('prefers the explicit location line over other location metadata', () => {
    mockMarkdown = '## Location\n- Timezone: Asia/Calcutta\n- Location: Pune, India';

    render(<LocationWeather />);

    expect(screen.getByText('Pune')).toBeInTheDocument();
    expect(screen.queryByText('Timezone: Asia/Calcutta')).not.toBeInTheDocument();
  });
});
