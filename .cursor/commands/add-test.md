# Add Test Files

Generate test files for code that lacks test coverage.

## Instructions:
1. Analyze the target file(s):
   - If specific file mentioned, focus on that file
   - If no file specified, analyze all changed files without tests
   - Check for existing test files (`*.test.tsx` or `*.test.ts`)
2. For each file without tests:
   - Read the source code and understand its structure
   - Identify all exported components, hooks, and functions
   - Determine dependencies and required mocks
3. Generate test file using Jest + React Native Testing Library:
   - Mock expo-router, Supabase, AsyncStorage, and native modules as needed
   - Follow Arrange-Act-Assert pattern
   - Test each exported function/component
   - Include edge cases and error scenarios
4. Follow naming conventions:
   - Variables: `inputX`, `mockX`, `actualX`, `expectedX`
   - Files: `<ModuleName>.test.tsx` or `<moduleName>.test.ts`
   - Test descriptions: Clear and descriptive
5. Ask for permission before creating the test file
6. Show the generated test content for review

## Examples:
- `/add-test` - Add tests for all changed files without tests
- `/add-test Home.tsx` - Add tests for a specific file
