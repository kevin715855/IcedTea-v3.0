import { prisma } from '../src/lib/prisma'
import { hashPassword, PASSWORD_MIN_LENGTH, validatePassword } from '../src/lib/password'

async function main() {
  const username = process.env.ADMIN_USERNAME
  const password = process.env.ADMIN_PASSWORD
  const validUntil = process.env.ADMIN_VALID_UNTIL
    ? new Date(process.env.ADMIN_VALID_UNTIL)
    : null

  if (!username || !password) {
    console.error('ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required')
    process.exit(1)
  }

  const passwordCheck = validatePassword(password)
  if (!passwordCheck.valid) {
    console.error(passwordCheck.error)
    process.exit(1)
  }

  const existing = await prisma.users.findUnique({ where: { username } })
  if (existing) {
    console.error(`User ${username} already exists`)
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)

  const admin = await prisma.users.create({
    data: {
      username,
      password_hash: passwordHash,
      role: 'admin',
      is_active: true,
      valid_until: validUntil,
      created_by: null,
    },
  })

  console.log(`Created admin account: id=${admin.id} username=${admin.username}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
