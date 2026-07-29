import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { authInputClass, authLabelClass } from './styles';

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  id: string;
  label: string;
};

const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ id, label, className, ...inputProps }, ref) => {
    const localize = useLocalize();
    const [visible, setVisible] = useState(false);
    const toggleLabel = localize(visible ? 'com_auth_hide_password' : 'com_auth_show_password');

    return (
      <div className="relative">
        <input
          {...inputProps}
          ref={ref}
          id={id}
          type={visible ? 'text' : 'password'}
          className={cn(authInputClass, 'pr-12', className)}
          placeholder=" "
        />
        <label htmlFor={id} className={authLabelClass}>
          {label}
        </label>
        <button
          type="button"
          aria-label={toggleLabel}
          aria-pressed={visible}
          title={toggleLabel}
          onClick={() => setVisible((current) => !current)}
          className="absolute end-3 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary active:bg-surface-active"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);

PasswordField.displayName = 'PasswordField';

export default PasswordField;
