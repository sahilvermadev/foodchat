import { userErrorMessage } from './errors';

describe('userErrorMessage', () => {
  it('keeps actionable client errors', () => {
    const error = Object.assign(new Error('That password is incorrect.'), { status: 401 });
    expect(userErrorMessage(error, 'Try again.')).toBe('That password is incorrect.');
  });

  it('hides local connection details', () => {
    expect(
      userErrorMessage(
        new Error('java.net.ConnectException: Failed to connect to /127.0.0.1:3080'),
        'Check your connection and try again.',
      ),
    ).toBe('Check your connection and try again.');
  });
});
