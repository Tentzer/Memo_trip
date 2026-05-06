# Smart Test Workflow

Run tests for changed files:

1. Identify all files that have been modified
2. Find related test files (`*.test.tsx`, `*.test.ts`)
3. Run relevant tests:
   - `npx jest <test-file>` for specific tests
   - `npx jest` for all tests
4. Analyze results and coverage
5. If tests don't exist or coverage is insufficient:
   - Identify coverage gaps
   - Ask permission to create missing tests using the `/add-test` command
   - Generate test files following existing patterns
6. Show test results summary with pass/fail status
