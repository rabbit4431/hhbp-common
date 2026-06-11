---
name: finishing-a-feature-branch
description: Verify a single worktree's tests pass, then present the user with disposition options (merge into baseline / open a GitLab MR / keep the branch / discard), execute the chosen option, then clean up the worktree. Use whenever the user says "ship this branch", "merge this branch", "finish this branch", "I'm done with this feature", or whenever multi-branch-merge invokes it once per worktree in dependency order. Single-worktree scope — the multi-service version is orchestrated by the caller.
---

# Finishing a Feature Branch

<when_to_use>
- Direct: "ship this," "merge this branch," "I'm done with this branch"
- Invoked by `multi-branch-merge` once per worktree
- The current directory is a git worktree (not the main checkout)

If invoked in the main checkout instead of a worktree, surface that to the user and request the worktree path — this skill assumes worktree isolation.
</when_to_use>

<context>
Finishing has four reasonable outcomes (merge into baseline / open GitLab MR / keep / discard) and only one wrong outcome: shipping a broken build. The workflow below makes the build check the precondition for offering any disposition, then asks the user which outcome they want, then executes — confirming once more on destructive actions because those can't be undone.

The team uses GitLab for version control. The primary finish action is a local `git merge --no-ff` of the feature branch into the iteration baseline branch in the main workspace. No GitLab MR is required for individual feature branches.

The baseline branch name comes from `feature-state.json` field `baseline_branch` (e.g. `feature-2606-<slug>`). If not present in state, fall back to the current branch of the main workspace.
</context>

<output_contract>
- Merge into baseline option: merge commit hash printed; worktree removed; local branch deleted
- GitLab MR option: MR URL printed; worktree removed
- Keep option: worktree left in place; no further action
- Discard option: worktree removed; branch deleted with `--force`; no remote push

In every option except Keep, the worktree is gone after this skill runs.
</output_contract>

<workflow>
Use TodoWrite.

### Step 1: Verify the current directory is a worktree

```bash
git rev-parse --git-dir
git rev-parse --git-common-dir
```

If those return the same path, this is the main checkout, not a worktree. Stop and report to the user.

### Step 2: Verify tests pass

```bash
./mvnw verify
```

The build must be green before disposition is offered. If the build fails:
- Print the failure
- Stop — do not proceed to disposition
- Suggest: "Fix the failure, then run me again."

Disposition options are not shown on a red build.

### Step 3: Verify the branch is committed

```bash
git status --porcelain
```

If there are uncommitted changes, stop and tell the user. They commit or stash; this skill won't decide for them.

### Step 4: Show a summary

Read `feature-state.json` to get `baseline_branch`. If not present, fall back to the current branch of the main workspace:
```bash
MAIN=$(git worktree list | head -1 | awk '{print $1}')
BASELINE_BRANCH=$(jq -r '.baseline_branch // empty' "$FEATURE_STATE_JSON" 2>/dev/null \
  || git -C "$MAIN" branch --show-current)
```

```
Branch: feature/PROJ-1234
Baseline: feature-2606-loyalty-discount
Commits ahead of baseline: 7
Files changed: 12
Tests: 47 passing, 0 failing
```

Use `git log --oneline "$BASELINE_BRANCH"..HEAD` for commit count, `git diff --stat "$BASELINE_BRANCH"` for files changed.

### Step 5: Ask for disposition

If the caller passed a `disposition` parameter (e.g., `multi-branch-merge` always specifies "merge"), skip the prompt and go to Step 6 with the chosen option.

Otherwise present four options:

> What would you like to do with this branch?
>
> 1. **Merge into baseline** — merge into `<baseline-branch>` in the main workspace (local, no remote MR)
> 2. **Open a GitLab MR** — push to remote and create an MR targeting `<baseline-branch>`
> 3. **Keep the branch** — leave the worktree as-is for now
> 4. **Discard** — delete the worktree and branch; the work is gone

### Step 6: Execute the disposition

#### Option 1: Merge into baseline

```bash
BRANCH=$(git branch --show-current)
MAIN=$(git worktree list | head -1 | awk '{print $1}')

cd "$MAIN"
git checkout "$BASELINE_BRANCH"
git merge --no-ff "$BRANCH" -m "Merge $BRANCH into $BASELINE_BRANCH"
```

If the merge has conflicts, stop and report. Manual resolution is the user's call; auto-resolution loses work.

Record the merge commit hash (`git rev-parse HEAD`). Proceed to Step 7.

#### Option 2: Open a GitLab MR

```bash
git push -u origin HEAD
glab mr create --title "<title>" --description "<body>" --target-branch "$BASELINE_BRANCH" --source-branch $(git branch --show-current)
```

Title and body: from commit messages for direct invocation:
- Title: most recent commit subject (refine as needed)
- Body: bullet list of commits + a `## Test plan` section noting `./mvnw verify` passes

Record the MR URL. Proceed to Step 7.

#### Option 3: Keep

Print: "Worktree kept at `<path>`. Branch `<branch>` is ahead of `<baseline>` by N commits. Run me again later to merge or discard."

Do not proceed to Step 7. The worktree stays.

#### Option 4: Discard

Discard is destructive — confirm once more. Ask: "This will permanently delete <N> commits. Type 'discard' to confirm."

Proceed to Step 7 only after the user types `discard`.

### Step 7: Cleanup (Merge / GitLab MR / Discard only)

```bash
BRANCH=$(git branch --show-current)
WORKTREE=$(git rev-parse --show-toplevel)
MAIN=$(git worktree list | head -1 | awk '{print $1}')

cd "$MAIN"
git worktree remove "$WORKTREE"

if [[ "$DISPOSITION" == "discard" ]]; then
  git branch -D "$BRANCH"
else
  git branch -d "$BRANCH"
fi
```

For "merge into baseline", `git branch -d` succeeds because the branch is now an ancestor of the baseline. For "GitLab MR", the remote still has the branch so local delete is safe; if `git branch -d` fails because the MR is not yet merged, use `-D` — the remote copy is preserved.

### Step 8: Report

```
Disposition: <Merge | GitLab MR | Keep | Discard>
Branch: <branch-name>
Merged into: <baseline-branch>   (Merge only)
Merge commit: <sha>              (Merge only)
MR: <url>                        (GitLab MR only)
Worktree: <removed | kept>
```

If invoked by `multi-branch-merge`, also append the result to `MERGE_PLAN.md`.
</workflow>

<anti_patterns>
Prefer the left, not the right:

| Prefer | Over |
|---|---|
| Build green → disposition offered | Disposition offered on a red build |
| Stop on merge conflict, user resolves | Auto-resolve to keep going |
| Confirm "discard" with typed keyword | Single-click destructive action |
| Verify uncommitted changes before worktree remove | Remove and lose uncommitted work |
| Refuse if not in a worktree | Run from main checkout and remove someone's branch |
| Read `baseline_branch` from feature-state.json | Hard-code `origin/main` as merge target |
| `git merge --no-ff` into baseline | `git rebase` + force push |
</anti_patterns>

<output_format>
Invoked by another skill: just the Step 8 report block.

Invoked by the user directly: same block, plus the Step 4 summary up front.
</output_format>
