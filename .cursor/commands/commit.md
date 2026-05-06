# Generate Semantic Commit & Push

Create a well-formatted semantic commit message and push to remote:

1. Analyze all changed files in the working directory
2. Review conversation context for intent and purpose
3. Generate a semantic commit message following conventional commits:
   - Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style`
   - Format: `type(scope): description`
   - Example: `feat(onboarding): add country selection screen`
4. Include scope based on affected area (e.g., `onboarding`, `map`, `auth`, `lib`)
5. Extract and include ticket/issue number if mentioned in conversation
6. Show the proposed commit message and ask for approval
7. After approval:
   - Stage all changes
   - Create the commit with the generated message
   - Push to remote branch (current branch)
   - Confirm push was successful and show remote branch status
