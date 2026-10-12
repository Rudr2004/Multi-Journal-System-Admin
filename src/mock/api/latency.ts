/** Simulates network latency (300–800 ms). Real API client replaces this via VITE_API_BASE_URL. */
export const delay = <T,>(value: T, min = 300, max = 800): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), min + Math.random() * (max - min)))

export class ApiError extends Error {
  constructor(message: string, public code = 'error') {
    super(message)
  }
}
