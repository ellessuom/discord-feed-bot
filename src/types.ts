export interface NewsItem {
  id: string
  title: string
  url: string
  content?: string
  snippet?: string
  publishedAt: Date
  source: string
  image?: string
}
