export interface SteamGame {
  appid: number
  name: string
  type: 'game' | 'dlc' | 'software' | 'video'
  tiny_image: string
  platforms: {
    windows?: boolean
    mac?: boolean
    linux?: boolean
  }
  price?: {
    currency: string
    initial: number
    final: number
  }
}

export async function searchSteamGames(query: string): Promise<SteamGame[]> {
  if (!query.trim()) return []

  const response = await fetch(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`
  )

  if (!response.ok) {
    throw new Error('Steam API error')
  }

  const data = await response.json()
  return data.items || data.products || []
}

export function getSteamIcon(appid: number): string {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_184x69.jpg`
}

export function getSteamStoreUrl(appid: number): string {
  return `https://store.steampowered.com/app/${appid}`
}

export function formatPrice(price?: SteamGame['price']): string {
  if (!price) return 'Free'
  const amount = price.final / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency,
  }).format(amount)
}
