# Safe Rollback

Analyze and safely revert changes:

1. Show current uncommitted changes
2. Show recent commits on current branch (last 5-10)
3. Ask what needs to be reverted:
   - Specific files
   - Last commit
   - Multiple commits
   - All uncommitted changes
4. Verify the rollback won't break dependencies or other projects
5. Execute the rollback safely:
   - `git restore` for uncommitted changes
   - `git revert` for published commits
   - `git reset` for local commits
6. Confirm what was rolled back and current state

