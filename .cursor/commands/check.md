# Quick Static Analysis

Perform fast, automated analysis of changed files (pre-commit validation).

## Focus: Automated Checks & Rule Compliance

### Code Quality:
- Identify potential bugs and logic errors
- Detect code smells and anti-patterns
- Check for unused variables and dead code
- Verify proper error handling

### Type Safety:
- TypeScript compliance and type correctness
- Missing type declarations
- Unsafe type assertions or `any` usage

### React Native Patterns:
- Proper hook usage (dependency arrays, rules of hooks)
- FlatList/SectionList for dynamic lists
- NativeWind class usage consistency
- No JS thread blocking in render path

### Performance:
- Unnecessary re-renders from unstable references
- Missing memoization on expensive computations
- Large inline objects or arrays in props

### Workspace Rules Compliance:
- No hardcoded configuration (must use env variables)
- No timeouts or time-based race condition solutions
- Proper error handling throughout
- File size under 300 lines

### Output:
- Clear list of issues with severity (critical/warning/info)
- File and line number references
- Quick-fix suggestions where applicable
- Overall readiness score

**Target time: < 30 seconds**
**Use before: Committing code**
