export const cartQuery = { queryKey: ['cart'], enabled: import.meta.env.DEV }

export const loadCart = () => httpClient.get('cart', { timeout: 15_000, retry: 2, prefixUrl: 'https://api.example' })
