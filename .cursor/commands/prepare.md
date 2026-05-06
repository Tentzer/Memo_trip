# Complete Pre-Commit Workflow

Run all checks before committing:

1. Execute `/check` command and wait for results
2. If issues found, pause and ask if you want to fix them
3. Run linter on changed files (`npx expo lint`)
4. Show comprehensive summary of all checks:
   - Code quality issues found and fixed
   - Linter warnings/errors
5. Execute `/review` command
6. Confirm readiness to commit with overall pass/fail status, pause for approval
7. Execute `/commit` command
8. Execute `/pr` command
