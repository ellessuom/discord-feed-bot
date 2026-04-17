# Feed Sources Documentation

This document provides detailed configuration and usage information for each supported feed source type.

---

## Steam Game News

### Overview

Fetches news updates for a specific Steam game using its AppID. This includes patch notes, announcements, and community news from the Steam store news feed.

### Configuration Schema

```yaml
- id: 'steam_cs2'
  type: 'steam_game'
  name: 'Counter-Strike 2'
  appid: 730
  enabled: true
```

| Field     | Required | Type    | Description                                    |
| --------- | -------- | ------- | ---------------------------------------------- |
| `id`      | Yes      | string  | Unique identifier for this source              |
| `type`    | Yes      | string  | Must be `'steam_game'`                         |
| `name`    | Yes      | string  | Display name for the source                    |
| `appid`   | Yes      | number  | Steam AppID for the game                       |
| `enabled` | No       | boolean | Whether the source is active (default: `true`) |

### API Endpoint

```
https://store.steampowered.com/feeds/news/app/{appid}/
```

Example for CS2 (AppID 730):

```
https://store.steampowered.com/feeds/news/app/730/
```

### Rate Limits

No specific rate limits documented. The implementation uses retry logic with 2 retries and 500ms base delay.

### Example Usage

```yaml
sources:
  - id: 'steam_tf2'
    type: 'steam_game'
    name: 'Team Fortress 2'
    appid: 440

  - id: 'steam_rust'
    type: 'steam_game'
    name: 'Rust'
    appid: 252490

  - id: 'steam_dota2'
    type: 'steam_game'
    name: 'Dota 2'
    appid: 570
```

### Troubleshooting

| Issue                  | Solution                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| No news items returned | Verify the AppID is correct. Find AppIDs using the Steam store URL or `steamdb.info`        |
| Feed fetch fails       | The game may not have a news feed. Some games don't publish news via RSS                    |
| Outdated news          | Steam news feeds are updated by game developers. Check if the game has recent announcements |

---

## Steam News Feed

### Overview

Fetches the official Steam platform-wide news feed. This includes general Steam announcements, sales events, and platform updates.

### Configuration Schema

```yaml
- id: 'steam_official'
  type: 'steam_news'
  name: 'Steam Official News'
  enabled: true
```

| Field     | Required | Type    | Description                                    |
| --------- | -------- | ------- | ---------------------------------------------- |
| `id`      | Yes      | string  | Unique identifier for this source              |
| `type`    | Yes      | string  | Must be `'steam_news'`                         |
| `name`    | Yes      | string  | Display name for the source                    |
| `enabled` | No       | boolean | Whether the source is active (default: `true`) |

### API Endpoint

```
https://store.steampowered.com/feeds/news/
```

### Rate Limits

No specific rate limits documented. The implementation uses retry logic with 2 retries and 500ms base delay.

### Example Usage

```yaml
sources:
  - id: 'steam_news'
    type: 'steam_news'
    name: 'Steam Platform News'
```

### Troubleshooting

| Issue             | Solution                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------- |
| No items returned | Steam may be experiencing issues. Check the RSS URL directly in a browser                   |
| Duplicate entries | Normal behavior during Steam sales events when multiple announcements share similar content |

---

## Steam Sales

### Overview

Intended to fetch Steam sale information. This source type is currently **NOT IMPLEMENTED** and will return an empty result with a warning logged.

### Configuration Schema

```yaml
- id: 'steam_sales'
  type: 'steam_sales'
  name: 'Steam Sales'
```

| Field     | Required | Type    | Description                                    |
| --------- | -------- | ------- | ---------------------------------------------- |
| `id`      | Yes      | string  | Unique identifier for this source              |
| `type`    | Yes      | string  | Must be `'steam_sales'`                        |
| `name`    | Yes      | string  | Display name for the source                    |
| `enabled` | No       | boolean | Whether the source is active (default: `true`) |

### Status

**NOT YET IMPLEMENTED** - This source type defined in types but the fetch function returns an empty array.

### Implementation Note

Do not use this source type until implementation is complete. The fetch function currently logs:

```
"Steam sales source type is not yet implemented"
```

---

## Reddit Subreddit

### Overview

Fetches the latest posts from a Reddit subreddit via its RSS feed. Supports any public subreddit.

### Configuration Schema

```yaml
- id: 'reddit_programming'
  type: 'reddit'
  name: 'r/programming'
  subreddit: 'programming'
  enabled: true
```

| Field       | Required | Type    | Description                                    |
| ----------- | -------- | ------- | ---------------------------------------------- |
| `id`        | Yes      | string  | Unique identifier for this source              |
| `type`      | Yes      | string  | Must be `'reddit'`                             |
| `name`      | Yes      | string  | Display name for the source                    |
| `subreddit` | Yes      | string  | Subreddit name without the `r/` prefix         |
| `enabled`   | No       | boolean | Whether the source is active (default: `true`) |

### API Endpoint

```
https://www.reddit.com/r/{subreddit}/.rss
```

Example for r/programming:

```
https://www.reddit.com/r/programming/.rss
```

### Rate Limits

Reddit has API rate limits, but RSS feeds are generally accessible. The implementation uses retry logic with 2 retries and 1000ms base delay.

### Example Usage

```yaml
sources:
  - id: 'reddit_typescript'
    type: 'reddit'
    name: 'r/typescript'
    subreddit: 'typescript'

  - id: 'reddit_gaming'
    type: 'reddit'
    name: 'r/gaming'
    subreddit: 'gaming'
```

### Troubleshooting

| Issue                         | Solution                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `r/` prefix in subreddit name | Automatically stripped by the code. Both `r/programming` and `programming` work    |
| Private or banned subreddit   | Returns empty results. Verify subreddit exists and is public                       |
| Rate limited                  | Wait before re-fetching. Reddit may temporarily block IPs making too many requests |

---

## Generic RSS

### Overview

Fetches any standard RSS 2.0 or Atom feed. Supports podcasts, blogs, news sites, and any other RSS-compatible sources.

### Configuration Schema

```yaml
- id: 'my_blog'
  type: 'rss'
  name: 'My Blog'
  url: 'https://example.com/blog/rss.xml'
  enabled: true
```

| Field     | Required | Type    | Description                                    |
| --------- | -------- | ------- | ---------------------------------------------- |
| `id`      | Yes      | string  | Unique identifier for this source              |
| `type`    | Yes      | string  | Must be `'rss'`                                |
| `name`    | Yes      | string  | Display name for the source                    |
| `url`     | Yes      | string  | Full URL to the RSS/Atom feed                  |
| `enabled` | No       | boolean | Whether the source is active (default: `true`) |

### API Endpoint

Any valid RSS 2.0 or Atom feed URL.

### Rate Limits

Varies by source. The implementation uses retry logic with 2 retries and 1000ms base delay.

### Example Usage

```yaml
sources:
  - id: 'techcrunch'
    type: 'rss'
    name: 'TechCrunch'
    url: 'https://techcrunch.com/feed/'

  - id: 'my_podcast'
    type: 'rss'
    name: 'My Podcast'
    url: 'https://feeds.simplecast.com/your-podcast-feed'

  - id: 'github_blog'
    type: 'rss'
    name: 'GitHub Blog'
    url: 'https://github.blog/feed/'
```

### Troubleshooting

| Issue             | Solution                                                            |
| ----------------- | ------------------------------------------------------------------- |
| Feed not parsing  | Verify the URL returns valid RSS 2.0 or Atom XML                    |
| HTTPS required    | Ensure the URL uses `https://`. HTTP may be blocked or redirected   |
| Content truncated | Content is limited to 2000 characters to fit Discord message limits |

---

## GitHub Releases

### Overview

Fetches release information from a GitHub repository, including version tags, release notes, and download links.

### Configuration Schema

```yaml
- id: 'nodejs_releases'
  type: 'github'
  name: 'Node.js Releases'
  owner: 'nodejs'
  repo: 'node'
  enabled: true
```

| Field     | Required | Type    | Description                                    |
| --------- | -------- | ------- | ---------------------------------------------- |
| `id`      | Yes      | string  | Unique identifier for this source              |
| `type`    | Yes      | string  | Must be `'github'`                             |
| `name`    | Yes      | string  | Display name for the source                    |
| `owner`   | Yes      | string  | GitHub repository owner (user or organization) |
| `repo`    | Yes      | string  | Repository name                                |
| `enabled` | No       | boolean | Whether the source is active (default: `true`) |

### API Endpoint

```
https://api.github.com/repos/{owner}/{repo}/releases
```

Example for Node.js:

```
https://api.github.com/repos/nodejs/node/releases
```

### Rate Limits

- **Unauthenticated**: 60 requests per hour
- **Authenticated**: 5,000 requests per hour (requires GitHub token configuration)

The implementation uses retry logic with 2 retries and 1000ms base delay.

### Example Usage

```yaml
sources:
  - id: 'react_releases'
    type: 'github'
    name: 'React'
    owner: 'facebook'
    repo: 'react'

  - id: 'rust_releases'
    type: 'github'
    name: 'Rust'
    owner: 'rust-lang'
    repo: 'rust'

  - id: 'vite_releases'
    type: 'github'
    name: 'Vite'
    owner: 'vitejs'
    repo: 'vite'
```

### Troubleshooting

| Issue                        | Solution                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| 404 Not Found                | Verify the owner and repo names are correct. Check if the repository exists and is public |
| 403 Forbidden / Rate limited | GitHub API rate limit exceeded. Wait or configure authentication                          |
| No releases returned         | Repository may have no published releases. Check the Releases page on GitHub              |
