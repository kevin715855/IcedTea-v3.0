import { readFileSync } from 'fs'
import { prisma } from './src/lib/prisma'

function loadEnv() {
  try {
    const text = readFileSync('.env', 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
      }
    }
  } catch {}
}
loadEnv()

async function main() {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='checkins' AND indexdef LIKE '%cancelled_at IS NULL%'`
  )
  console.log(JSON.stringify(rows, null, 2))
  await prisma.$disconnect()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
