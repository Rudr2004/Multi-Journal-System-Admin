export class ApiError extends Error {
  constructor(message: string, public code = 'error') {
    super(message)
  }
}

/** Simulates network latency (300–800 ms) for the screens that are still backed by mock data. */
export const delay = <T,>(value: T, min = 300, max = 800): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), min + Math.random() * (max - min)))
