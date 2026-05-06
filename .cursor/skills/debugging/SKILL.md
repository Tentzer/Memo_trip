---
name: debugging
description: Systematic debugging methodology for Expo/React Native issues, crashes, and unexpected behavior.
---

# Debugging Methodology

Systematic approach to root cause analysis and issue resolution.

## Debugging Process

### 1. Capture the Error
- Error message and full stack trace
- Reproduction steps
- Platform context (iOS, Android, or both)
- Recent code changes (`git diff`)

### 2. Analyze and Isolate
- Parse stack trace to identify failure location
- Check recent commits that might have introduced the issue
- Identify the scope: component, navigation, data, or native

### 3. Form Hypotheses
- Based on error message and context
- Consider common causes for this error type
- Prioritize most likely causes

### 4. Test Hypotheses
- Add strategic debug logging (`console.log` only)
- Never modify logic while debugging
- Inspect variable states at key points
- Use React DevTools or Expo debugger if available

### 5. Implement Fix
- Fix the root cause, not symptoms
- Minimal change that addresses the issue
- No fallbacks or workarounds
- No timeouts to solve race conditions

### 6. Verify Solution
- Confirm original error is resolved
- Test on both platforms if relevant
- Check for regressions in related screens

## Common React Native Issues

### Render & Component Errors
- **White screen**: Check for uncaught errors in component tree; add error boundaries
- **Hook violations**: Verify hooks aren't called conditionally or in loops
- **Stale closures**: Check `useEffect`/`useCallback` dependency arrays
- **Missing keys**: Verify `keyExtractor` on FlatList / unique keys on list items

### Navigation (expo-router)
- **Screen not found**: Check file placement in `app/` directory matches expected route
- **Params undefined**: Verify `useLocalSearchParams` types and that params are passed
- **Layout errors**: Check `_layout.tsx` exports a valid layout component

### Styling (NativeWind)
- **Classes not applying**: Verify NativeWind is configured in `babel.config.js`
- **Platform differences**: Check platform-specific Tailwind utilities
- **Dynamic classes**: Ensure template literals are not splitting class names

### Supabase
- **Auth failures**: Check token expiry, refresh flow, and listener setup
- **Query errors**: Verify table names, column names, RLS policies
- **Realtime issues**: Check subscription filters and channel setup

### Native & Platform
- **Build failures**: Check native dependency linking and Expo config plugins
- **Permission errors**: Verify `app.json` permissions and runtime permission requests
- **Performance**: Profile with React DevTools; check for JS thread blocking

## Debug Logging

```typescript
console.log('[ScreenName] Variable state:', variable);
console.log('[ScreenName] Props:', JSON.stringify(props, null, 2));
```

## Key Principles

- Fix root causes, never symptoms
- Never use fallbacks or workarounds
- Never use timeouts to solve race conditions
- Always find deterministic root cause
- One problem at a time
- Remove debug logging after issue is resolved

## Verification Checklist

- [ ] Error message captured and understood
- [ ] Stack trace analyzed
- [ ] Reproduction steps identified
- [ ] Root cause isolated
- [ ] Minimal fix implemented
- [ ] Both platforms checked (if applicable)
- [ ] No regressions introduced
- [ ] Debug logging removed
