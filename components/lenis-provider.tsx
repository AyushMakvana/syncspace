"use client";

import Lenis from "lenis";
import { useEffect } from "react";

export function LenisProvider() {
  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      anchors: true,
      duration: 0.75,
      wheelMultiplier: 0.85,
      touchMultiplier: 1,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });

    return () => {
      lenis.destroy();
    };
  }, []);

  return null;
}
