import { render, waitFor } from '@testing-library/react';

import { S2sWsRealtimeClient } from './ws/s2s-ws-client';
import VoiceAssistantWidget from './VoiceAssistantWidget';

const mockSetIsActive = jest.fn();
const mockGetUserMedia = jest.fn();
const mockVoiceConfigQuery = jest.fn();
const mockVoiceClient = {
  addEventListener: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
  connect: jest.fn().mockResolvedValue(undefined),
  updateSession: jest.fn(),
};

jest.mock('recoil', () => ({
  useRecoilState: () => [true, mockSetIsActive],
  useRecoilValue: () => 'Aiden',
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { voiceAssistantActive: {}, voice: {} },
}));

jest.mock('~/hooks', () => ({
  useChatHelpers: () => ({ getMessages: jest.fn(() => []), setMessages: jest.fn() }),
}));

jest.mock('~/data-provider', () => ({
  useCookingVoiceConfigQuery: () => mockVoiceConfigQuery(),
  usePersistCookingVoiceTurnMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('./ws/s2s-ws-client', () => ({
  S2sWsRealtimeClient: jest.fn(),
}));

describe('VoiceAssistantWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (S2sWsRealtimeClient as jest.Mock).mockImplementation(() => mockVoiceClient);
    mockVoiceConfigQuery.mockReturnValue({
      data: { enabled: false, shareRecipeContext: false },
      isLoading: false,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: mockGetUserMedia },
    });
  });

  test('deactivates unavailable voice without requesting microphone permission', async () => {
    render(<VoiceAssistantWidget conversationId="conversation-1" />);

    await waitFor(() => expect(mockSetIsActive).toHaveBeenCalledWith(false));
    expect(mockGetUserMedia).not.toHaveBeenCalled();
    expect(S2sWsRealtimeClient).not.toHaveBeenCalled();
  });

  test('waits for voice configuration before attempting activation', async () => {
    mockVoiceConfigQuery.mockReturnValue({ data: undefined, isLoading: true });

    render(<VoiceAssistantWidget conversationId="conversation-1" />);

    await Promise.resolve();
    expect(mockSetIsActive).not.toHaveBeenCalled();
    expect(mockGetUserMedia).not.toHaveBeenCalled();
  });

  test('resends material recipe workspace changes to an active session', async () => {
    const stream = { getTracks: () => [{ stop: jest.fn() }] };
    mockGetUserMedia.mockResolvedValue(stream);
    mockVoiceConfigQuery.mockReturnValue({
      data: {
        enabled: true,
        sessionUrl: '/api/cooking/voice/session',
        shareRecipeContext: true,
      },
      isLoading: false,
    });
    const { rerender } = render(
      <VoiceAssistantWidget
        conversationId="conversation-1"
        recipeMarkdown="# Soup"
        workspaceContext={'Recipe revision: 1\nServings: 2'}
      />,
    );

    await waitFor(() => expect(mockVoiceClient.connect).toHaveBeenCalled());
    mockVoiceClient.updateSession.mockClear();
    rerender(
      <VoiceAssistantWidget
        conversationId="conversation-1"
        recipeMarkdown="# Soup"
        workspaceContext={'Recipe revision: 2\nServings: 4'}
      />,
    );

    await waitFor(() =>
      expect(mockVoiceClient.updateSession).toHaveBeenCalledWith({
        instructions: expect.stringContaining('Recipe revision: 2\nServings: 4'),
      }),
    );
  });
});
