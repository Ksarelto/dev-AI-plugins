/** Shared shutdown flag: readiness turns 503 as soon as shutdown starts, before connections close. */
export function createLifecycle() {
  let shuttingDown = false;
  return {
    isShuttingDown: (): boolean => shuttingDown,
    markShuttingDown: (): void => {
      shuttingDown = true;
    },
  };
}

export type Lifecycle = ReturnType<typeof createLifecycle>;
