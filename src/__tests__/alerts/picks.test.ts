import { expect, test } from 'vitest'
import { parseSearch } from '../../alerts/picks'

test('store search: appids come from the capsule URL, names are unescaped', () => {
  const body = {
    items: [
      { name: 'Hela: of Mice &amp; Magic', logo: 'https://shared.akamai/apps/2/capsule.jpg?t=1' },
      { name: 'Bundle', logo: 'https://shared.akamai/bundles/9/capsule.jpg' },
    ],
  }
  expect(parseSearch(body)).toEqual([{ appid: 2, name: 'Hela: of Mice & Magic' }])
})
