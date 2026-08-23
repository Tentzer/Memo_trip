# Comprehensive Peer Code Review

Simulate a thorough human-style code review (pre-PR validation).

## Focus: Architecture, Design & Best Practices

### Architecture & Design:
- Verify patterns match existing codebase conventions
- Evaluate separation of concerns (screens vs components vs hooks vs lib)
- Review module structure and file organization
- Assess impact on navigation and deep linking

### Code Maintainability:
- Code readability and clarity
- Proper naming conventions (PascalCase components, camelCase functions)
- Function complexity (keep under 20 statements)
- File size (under 300 lines)
- TypeScript types are accurate and complete

### React Native Best Practices:
- Component composition and reusability
- Proper hook usage and custom hook extraction
- NativeWind styling consistency
- FlatList/SectionList for lists
- Reanimated for animations
- expo-router navigation conventions

### Supabase Patterns:
- Error handling on all Supabase calls
- Auth state managed via listeners
- RLS policies trusted for authorization
- No sensitive data in client code

### Security Assessment:
- No hardcoded API keys or secrets
- Input validation before database writes
- Deep link handler validation
- Sensitive data handling

### Performance:
- Memoization where appropriate
- Virtualized lists for dynamic data
- Image caching with expo-image
- No JS thread blocking

### Output:
- Prioritized recommendations (must-fix, should-fix, nice-to-have)
- Specific examples of how to fix each issue
- Overall code quality assessment

**Target time: 2-3 minutes**
**Use before: Creating Pull Request**
