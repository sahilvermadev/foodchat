import { useCallback, useEffect, useRef } from 'react';

type TUseTimeoutParams = {
  callback: (error: string | number | boolean | null) => void;
  delay?: number;
};
type TTimeout = ReturnType<typeof setTimeout> | null;

function useTimeout({ callback, delay = 400 }: TUseTimeoutParams) {
  const timeout = useRef<TTimeout>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const callOnTimeout = useCallback(
    (value?: string) => {
      if (timeout.current !== null) {
        clearTimeout(timeout.current);
      }

      if (value != null && value) {
        console.log(value);
        timeout.current = setTimeout(() => {
          callbackRef.current(value);
        }, delay);
      }
    },
    [delay],
  );

  useEffect(() => {
    return () => {
      if (timeout.current !== null) {
        clearTimeout(timeout.current);
      }
    };
  }, []);

  return callOnTimeout;
}

export default useTimeout;
