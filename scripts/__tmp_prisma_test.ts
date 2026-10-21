import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const admin = await prisma.users.create({
    data: { username: 'adm_dup_test', password_hash: 'x', role: 'admin' },
  })
  const staff = await prisma.users.create({
    data: {
      username: 'stf_dup_test',
      password_hash: 'x',
      role: 'staff',
      is_active: true,
      valid_until: null,
    },
  })
  const session = await prisma.sessions.create({
    data: {
      name: 'dup test',
      starts_at: new Date('2026-10-21T00:00:00Z'),
      ends_at: new Date('2026-10-22T00:00:00Z'),
      created_by: admin.id,
    },
  })
  const c1 = await prisma.checkins.create({
    data: { session_id: session.id, student_code: '20230001', scanned_by: staff.id },
  })
  console.log('created checkin', c1.id)
  try {
    await prisma.checkins.create({
      data: { session_id: session.id, student_code: '20230001', scanned_by: staff.id },
    })
    console.log('NO ERROR - duplicate allowed!')
  } catch (e: any) {
    console.log('ERROR code:', e.code, 'message:', e.message)
  }
  await prisma.checkins.deleteMany({ where: { session_id: session.id } })
  await prisma.sessions.delete({ where: { id: session.id } })
  await prisma.users.deleteMany({
    where: { username: { in: ['adm_dup_test', 'stf_dup_test'] } },
  })
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
