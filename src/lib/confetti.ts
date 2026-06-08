import confetti from 'canvas-confetti';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function triggerConfetti() {
  if (prefersReducedMotion()) return;
  // Create burst from multiple angles
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  // Fire sequence for dramatic effect
  fire(0.25, {
    spread: 26,
    startVelocity: 55,
    origin: { x: 0.2, y: 0.7 },
  });
  fire(0.2, {
    spread: 60,
    origin: { x: 0.5, y: 0.7 },
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
    origin: { x: 0.5, y: 0.7 },
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
    origin: { x: 0.8, y: 0.7 },
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
    origin: { x: 0.3, y: 0.7 },
  });
}

export function triggerSuccessConfetti() {
  if (prefersReducedMotion()) return;
  // Simpler, celebratory burst
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    zIndex: 9999,
    colors: ['#22c55e', '#10b981', '#34d399', '#6ee7b7'],
  });
}

/**
 * Mini celebration for action completions - subtle but satisfying
 */
export function triggerMiniCelebration() {
  if (prefersReducedMotion()) return;
  confetti({
    particleCount: 30,
    spread: 50,
    origin: { y: 0.8, x: 0.5 },
    zIndex: 9999,
    colors: ['#c8e600', '#84cc16', '#22c55e'],
    startVelocity: 20,
    gravity: 1.2,
    scalar: 0.8,
  });
}

/**
 * KPI update celebration - brand colors with upward trajectory
 */
export function triggerKpiCelebration() {
  if (prefersReducedMotion()) return;
  const colors = ['#c8e600', '#84cc16', '#22c55e', '#10b981'];
  
  // Upward burst suggesting growth
  confetti({
    particleCount: 60,
    spread: 55,
    origin: { y: 0.9, x: 0.5 },
    angle: 90,
    startVelocity: 45,
    zIndex: 9999,
    colors,
  });
}

/**
 * Milestone completion - big celebration
 */
export function triggerMilestoneCelebration() {
  if (prefersReducedMotion()) return;
  const duration = 1500;
  const animationEnd = Date.now() + duration;
  const colors = ['#c8e600', '#cc2936', '#22c55e', '#f59e0b', '#3b82f6'];

  (function frame() {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors,
      zIndex: 9999,
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors,
      zIndex: 9999,
    });

    if (Date.now() < animationEnd) {
      requestAnimationFrame(frame);
    }
  })();
}
