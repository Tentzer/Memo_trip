---
name: code-review
description: Peer code review checklist for Expo/React Native pre-PR validation.
---

# Code Review Checklist

Simulate a thorough human-style code review (pre-PR validation).

## When Invoked

1. Run `git diff` to see recent changes
2. Focus on modified files
3. Apply the checklist below

## Architecture & Design

- Verify patterns match existing codebase conventions
- Check separation of concerns (screens vs components vs hooks vs lib)
- Review module structure and file organization
- Assess impact on navigation tree and deep links

## Code Maintainability

- Code readability and clarity
- Proper naming conventions (PascalCase components, camelCase functions)
- Function complexity (keep under 20 statements)
- File size (under 300 lines)
- TypeScript types are accurate and avoid `any`

## React Native Specifics

- Component composition and reusability
- Proper use of hooks (correct dependency arrays, no rules violations)
- FlatList/SectionList for dynamic lists (not `.map()` in ScrollView)
- Memoization where appropriate (`React.memo`, `useCallback`, `useMemo`)
- NativeWind classes used consistently; no unnecessary StyleSheet usage
- Animations use Reanimated worklets, not JS thread

## Expo Router Patterns

- Screens placed correctly in `app/` directory
- Layouts use `_layout.tsx` convention
- Navigation uses `router.push/replace` or `<Link>`
- Route params are typed

## Supabase Integration

- Errors from Supabase calls are handled (not silently ignored)
- Auth state managed via listeners
- No sensitive data or keys exposed in client code
- RLS policies relied on for authorization

## Security Assessment

- No hardcoded API keys or secrets
- Input validation before Supabase writes
- Sensitive data not stored in AsyncStorage unencrypted
- Deep link handlers validated

## Performance

- Large lists use virtualized components
- Images use `expo-image` with proper caching
- Heavy computations offloaded or memoized
- No unnecessary re-renders from unstable references

## Output Format

Provide feedback organized by priority:

**Critical Issues (must fix)**
- Security vulnerabilities
- Logic errors
- Breaking changes

**Warnings (should fix)**
- Code quality issues
- Missing error handling
- Performance concerns

**Suggestions (nice to have)**
- Refactoring opportunities
- Best practice improvements

Include specific examples of how to fix each issue.
