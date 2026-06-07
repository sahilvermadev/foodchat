import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import RekkyJsonMarkdownCode from './MarkdownCode';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownComponents', () => ({
  code: ({ children }: { children: React.ReactNode }) => <code>{children}</code>,
}));

describe('RekkyJsonMarkdownCode', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('omits invalid generated widgets without exposing protocol errors', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { container } = render(
      <RekkyJsonMarkdownCode className="language-rekky-ui">
        {'{"type":"UnknownWidget","props":{}}'}
      </RekkyJsonMarkdownCode>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/allowed catalog/i)).not.toBeInTheDocument();
  });
});
