import { fireEvent, render, screen } from '@testing-library/react';
import PasswordField from '../PasswordField';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) =>
    key === 'com_auth_show_password' ? 'Show password' : 'Hide password',
}));

describe('PasswordField', () => {
  it('toggles password visibility with an accessible control', () => {
    render(<PasswordField id="password" label="Password" aria-label="Password" />);

    const input = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });

    expect(input).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);

    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
