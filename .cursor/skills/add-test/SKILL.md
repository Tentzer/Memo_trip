---
name: add-test
description: Generate test files for React Native components and utilities. Use when adding tests for Expo/React Native code.
---

# Add Test Methodology

Generate test files for code that lacks test coverage.

## Process

1. **Analyze Target Files**
   - Check for existing test files (`*.test.tsx` or `*.test.ts`)
   - Read the source code and understand its structure
   - Identify all exported components, hooks, and functions
   - Determine dependencies and required mocks

2. **Identify File Type**
   - React Native Components: Use Jest with React Native Testing Library
   - Custom Hooks: Use `renderHook` from Testing Library
   - Utility Functions: Simple unit tests with Arrange-Act-Assert
   - Supabase Services: Mock Supabase client, test logic around calls

3. **Generate Test Structure**
   - Proper imports and test setup
   - Mocks for navigation, Supabase, async storage, etc.
   - Test cases for each exported function/component
   - Edge cases and error scenarios

## Naming Conventions

- Variables: `inputX`, `mockX`, `actualX`, `expectedX`
- Files: `<ModuleName>.test.tsx` or `<moduleName>.test.ts`
- Describe blocks: Component or function name
- Test names: Clear descriptions of behavior

## Test Template

### React Native Component

```typescript
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ComponentName } from './ComponentName';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

describe('ComponentName', () => {
  it('should render correctly', () => {
    render(<ComponentName />);
    expect(screen.getByText('Expected Text')).toBeTruthy();
  });

  it('should handle press event', () => {
    const mockOnPress = jest.fn();
    render(<ComponentName onPress={mockOnPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });
});
```

### Utility / Service

```typescript
import { myFunction } from './myFunction';

describe('myFunction', () => {
  it('should return expected result for valid input', () => {
    const input = { key: 'value' };
    const expected = { result: 'success' };
    const actual = myFunction(input);
    expect(actual).toEqual(expected);
  });

  it('should throw on invalid input', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

## Common Mocks for This Project

- `expo-router`: navigation, params
- `@supabase/supabase-js`: auth, database queries
- `expo-location`: location permissions and coords
- `react-native-maps`: MapView
- `@react-native-async-storage/async-storage`: storage

## Key Principles

- Follow Arrange-Act-Assert pattern
- Test each exported function/component
- Use test doubles for external dependencies
- Include edge cases and error scenarios
- Follow existing test patterns in the codebase
