// Runs once before the test suite. If TEST_DATABASE_URL is set, bring that
// database's schema up to date so the *.db.test.ts files can use it.
import "dotenv/config";
import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.log("TEST_DATABASE_URL not set — skipping database tests.");
    return;
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
