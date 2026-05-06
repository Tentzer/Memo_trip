# Lint Changed Files

Run linter on modified files:

1. Identify all modified files (`git diff --name-only`)
2. Run ESLint via Expo: `npx expo lint`
3. Show linting errors and warnings with file locations
4. Auto-fix issues when possible (`npx expo lint --fix`)
5. Show summary:
   - Fixed issues count
   - Remaining errors
   - Remaining warnings
6. Provide guidance on how to fix remaining issues
