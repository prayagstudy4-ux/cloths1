/**
 * Creates the first admin user (role OWNER) in the SQLite database.
 *
 * Use after `prisma db push` has created the schema, e.g.:
 *   bun run scripts/create-admin-user.ts admin 'My Name' 'SomeStrongPass123!'
 *
 * Password hashing uses the exact same scrypt scheme as src/lib/server/auth.ts
 * (salt:hash, 64-byte key) so the app can verify logins.
 */
import { scryptSync, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const [, , username, fullName, password] = process.argv;
if (!username || !fullName || !password) {
  console.error(
    "Usage: bun scripts/create-admin-user.ts <username> <fullName> <password>"
  );
  process.exit(1);
}

function hashPassword(pwd: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pwd, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Uses TURSO_DATABASE_URL/TURSO_AUTH_TOKEN when set (e.g. to provision the
// Vercel/Turso deployment directly), otherwise the local file DB.
function makeClient(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    const adapter = new PrismaLibSQL({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }
  return new PrismaClient();
}

const db = makeClient();
try {
  const existing = await db.user.findUnique({ where: { username: username.toLowerCase() } });
  if (existing) throw new Error(`User "${username}" already exists.`);

  const user = await db.user.create({
    data: {
      username: username.toLowerCase(),
      passwordHash: hashPassword(password),
      fullName,
      role: "OWNER",
      active: true,
    },
  });
  console.log(`✔ Created admin user: ${user.username} (role=${user.role})`);
  console.log("You can now log in at /login with these credentials.");
} catch (err) {
  console.error("Failed to create user:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}