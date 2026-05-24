import { createContext, useRef, useContext, RefObject } from 'react';

type ScreenshotContextType = {
  ref?: RefObject<HTMLDivElement>;
};

const ScreenshotContext = createContext<ScreenshotContextType>({});

export const useScreenshot = () => {
  const { ref } = useContext(ScreenshotContext);
  return { screenshotTargetRef: ref };
};

export const ScreenshotProvider = ({ children }) => {
  const ref = useRef(null);

  return <ScreenshotContext.Provider value={{ ref }}>{children}</ScreenshotContext.Provider>;
};
