import { useRef, useLayoutEffect } from "react";

export function useLatest<T>(val: T) {
  const ref = useRef(val);
  useLayoutEffect(() => {
    ref.current = val;
  });
  return ref;
}
