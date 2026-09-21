import "dotenv/config";
import { createPrisma } from "@/lib/db";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Client for the disposable test database. Only call when TEST_DATABASE_URL is set. */
export function testDb() {
  return createPrisma(TEST_DATABASE_URL!);
}

export async function wipe(db: ReturnType<typeof testDb>) {
  await db.adoption.deleteMany();
  await db.donor.deleteMany();
  await db.bench.deleteMany();
}
