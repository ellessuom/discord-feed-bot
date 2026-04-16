export async function main(): Promise<void> {
  console.log('Discord Steam Feed Bot')
  console.log('Phase 1 setup complete!')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
