import { useEffect, useRef, useLayoutEffect } from "react";

const resizeCallbacks = new Set<() => void>();
let isListening = false;

const handleResize = () => {
  resizeCallbacks.forEach((cb) => cb());
};

export function useGlobalResize(callback: () => void) {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const cb = () => callbackRef.current();
    resizeCallbacks.add(cb);

    if (!isListening) {
      window.addEventListener("resize", handleResize, { passive: true });
      isListening = true;
    }

    return () => {
      resizeCallbacks.delete(cb);
      if (resizeCallbacks.size === 0 && isListening) {
        window.removeEventListener("resize", handleResize);
        isListening = false;
      }
    };
  }, []);
}
