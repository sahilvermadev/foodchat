import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { dataService } from 'librechat-data-provider';
import ProtectedImage from './ProtectedImage';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getProtectedImage: jest.fn(),
    },
  };
});

const getProtectedImage = dataService.getProtectedImage as jest.MockedFunction<
  typeof dataService.getProtectedImage
>;
const createObjectURL = jest.fn(() => 'blob:authenticated-image');
const revokeObjectURL = jest.fn();

function renderProtectedImage(src: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ProtectedImage src={src} alt="Illustration" fallback={<span>Loading</span>} />
    </QueryClientProvider>,
  );
}

describe('ProtectedImage', () => {
  beforeEach(() => {
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    getProtectedImage.mockResolvedValue({
      data: new Blob(['image'], { type: 'image/png' }),
    } as Awaited<ReturnType<typeof dataService.getProtectedImage>>);
  });

  it.each([
    '/api/recipes/recipe-1/illustration?v=1',
    '/api/preferences/ingredients/ingredient-1/image?v=1&variant=thumbnail',
  ])('loads protected API media through the authenticated data service: %s', async (src) => {
    const { unmount } = renderProtectedImage(src);

    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Illustration' })).toHaveAttribute(
      'src',
      'blob:authenticated-image',
    );
    expect(getProtectedImage).toHaveBeenCalledWith(src);

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:authenticated-image');
  });

  it('renders unprotected image sources directly', async () => {
    renderProtectedImage('data:image/png;base64,image');

    expect(screen.getByRole('img', { name: 'Illustration' })).toHaveAttribute(
      'src',
      'data:image/png;base64,image',
    );
    await waitFor(() => expect(getProtectedImage).not.toHaveBeenCalled());
  });
});
