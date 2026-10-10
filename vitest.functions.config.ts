import { defineConfig } from 'vitest/config'

/**
 * Integration tests against the Functions + Firestore emulators: npm run test:functions.
 * The callable and webhook tests run with the Firestore triggers off (the two emulators started
 * apart), so a write a test makes doesn't set off onExpenseCreated and friends; the trigger tests
 * (*.trigger.test.ts) run on their own with both emulators together (TRIGGERS=1).
 */
const triggers = process.env.TRIGGERS === '1'
export default defineConfig({
  test: {
    environment: 'node',
    include: [triggers ? 'functions/test/**/*.trigger.test.ts' : 'functions/test/**/*.emulator.test.ts'],
    testTimeout: 30000,
    fileParallelism: false,
  },
})
