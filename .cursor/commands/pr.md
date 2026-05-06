# Create Pull Request

Push changes and create a comprehensive PR:

1. Verify current branch and check for uncommitted changes
2. Push current branch to remote origin
3. Analyze commits since branching and conversation context
4. Generate PR title using conventional commit format
5. Generate PR description including:
   - Summary of changes
   - Affected screens and components
   - Testing notes
   - Related issues/tickets
   - Breaking changes (if any)
6. Create PR on GitHub using `gh pr create`
7. Return the PR link for review
