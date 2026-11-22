# Nhaav Git recovery plan (inspection only)

Status: **nothing staged, committed, pushed, reset, cleaned, or renamed by this
plan.** Repository metadata is untouched.

Verified: 2026-11-04, from the root `Maritime` working tree.

Machine-readable evidence in `ops/git-recovery/`:

| File | Contents |
|---|---|
| `staged-renames.tsv` | All 225 staged entries, one row each: status, source, destination, whether the destination exists in the worktree, whether the source is in `HEAD`, whether the destination is in the index, group. |
| `unstaged-status.tsv` | The 20 worktree deletions and 114 worktree modifications. |
| `unstaged-numstat.tsv` | Per-file added/deleted line counts for the 114 modified files. |
| `root-head-tracked.txt` | All 298 paths tracked by `HEAD`. |
| `root-untracked.txt` | All untracked root paths (dependencies ignored). |
| `nested-backend-source.txt` | 280 backend source/config files (dependencies, caches, uploads excluded). |
| `nested-frontend-source.txt` | 195 frontend source/config files (`node_modules`, `dist`, agent assets excluded). |
| `nested-*-untracked.txt` | Every untracked file in each nested repo, including dependency trees. |
| `nested-*-status.txt` | Raw porcelain status for the nested repos. |

## 1. Verified repository state

| Repository | History | Remote | State |
|---|---|---|---|
| Root `Maritime` | Existing history; `HEAD` = `e011ccb` | `origin` GitHub | 225 staged entries, 20 worktree deletions, 114 worktree modifications, untracked files |
| `nhaav-backend` | **No commits** (`main` unborn) | none | 602 untracked files; 280 source/config after excluding `.venv`, caches, uploads |
| `nhaav-frontend` | **No commits** (`main` unborn) | none | 17,301 untracked files; 195 source/config after excluding `node_modules`, `dist`, `.freebuff`, `.local-assets` |

Root index summary: **225 files, +106/−20**. Worktree diff: **134 tracked
paths, +12,183/−6,466** (20 deleted, 114 modified) plus untracked files.

The three nested-repository `.git` directories are **empty repositories with no
commits**. They contain no recoverable history, so Git cannot restore anything
from them. Recovery for nested files depends on the filesystem and the local
archive, not on those repositories.

## 2. Every staged entry, classified

There are **222 renames** and **3 additions**. There are **no pure staged
deletions**: every staged `D` in `git status` is the source side of a rename.

| Group | Staged renames | Staged additions |
|---|---:|---:|
| `nhaav-backend/**` | 100 | 3 (`tests/vendor/expected.json`, `filled.docx`, `filled.pdf`) |
| `nhaav-frontend/**` | 122 | 0 |
| Root files (`.stitch` designs) | 3 | 0 |
| **Total** | **222** | **3** |

Rename similarity: 221 at 100% and one at 74% (`nhaav-backend/requirements.txt`).
The complete one-row-per-file mapping is `ops/git-recovery/staged-renames.tsv`.

All 222 source paths still exist in `HEAD`, and all 222 destination blobs exist
in the index. Recovering either representation is possible without touching the
worktree.

## 3. The 20 worktree deletions (staged rename destinations missing on disk)

These files are present in the index through the staged rename and present at
their old `horizon-frontend/...` paths in `HEAD`, but are absent from the
current worktree. None is imported by the current router; `Login` and `Register`
resolve to `pages/Login` and `pages/Register`, and `apiClient.ts` replaces
`services/api.ts`.

| Missing destination | Old path in `HEAD` | Current use |
|---|---|---|
| `nhaav-frontend/original_landing.html` | `horizon-frontend/original_landing.html` | unused static prototype |
| `nhaav-frontend/register.html` | `horizon-frontend/register.html` | replaced by React route |
| `src/pages/Authentication/Login/index.tsx` | same under `horizon-frontend` | replaced by `src/pages/Login` |
| `src/pages/Authentication/Register/index.tsx` | same under `horizon-frontend` | replaced by `src/pages/Register` |
| `src/pages/Documents/OCRResults/index.tsx` | same | unused |
| `src/pages/Documents/Upload/index.tsx` | same | unused |
| `src/pages/Marketplace/BrowseServices/index.tsx` | same | unused |
| `src/pages/Marketplace/Categories.tsx` | same | unused |
| `src/pages/Marketplace/Categories/index.tsx` | same | unused |
| `src/pages/Marketplace/SearchResults.tsx` | same | unused |
| `src/pages/Network/GlobalInfrastructure/index.tsx` | same | unused |
| `src/pages/Network/ServiceCoverage/index.tsx` | same | unused |
| `src/pages/OCRResult/index.tsx` | same | unused |
| `src/pages/Procurement/ProcurementRequests/index.tsx` | same | unused |
| `src/pages/Procurement/PurchaseOrders/index.tsx` | same | unused |
| `src/pages/Procurement/Quotes/index.tsx` | same | unused |
| `src/pages/Profile/Company/index.tsx` | same | unused |
| `src/pages/Profile/Settings/index.tsx` | same | unused |
| `src/pages/Upload/index.tsx` | same | unused |
| `src/services/api.ts` | same | replaced by `src/services/apiClient.ts` |

Each table path is under `nhaav-frontend/` except the table’s shortened display;
the full paths are in `staged-renames.tsv` where `dest_exists=no`.

**Preservation check:** these 20 files are not lost. The content is in the index
as the rename destination and in `HEAD` at the old path. They are absent from
the current worktree by intent, not corruption.

## 4. What is preserved, and where, before any command

| Content | Preserved in | Risk if the index is committed unchanged |
|---|---|---|
| 298 old tracked files | `HEAD` | none; history retains them |
| 222 renamed destinations | index (blob content) | 20 files would be resurrected despite being deleted in the worktree |
| 114 current worktree modifications | **worktree and local archive only** (not index) | committing the index would record stale code and lose the reviewed changes from the commit |
| 3 vendor fixtures | index and worktree | none |
| 20 worktree deletions | **worktree absence only**; recoverable from index/`HEAD` | committing the index would silently restore obsolete pages |
| Root untracked files | worktree and local archive only | not in any commit yet |
| Backend source (602 files) | filesystem and local archive only | nested repo has no commit, so no Git recovery |
| Frontend source (17,301 files) | filesystem and local archive only | nested repo has no commit, so no Git recovery |
| Secrets | excluded from archive and untracked/ignored | never commit `.env`, `.env.bak-*`, `.admin-credentials.txt` |

**Do not commit the current index.** It is a pre-sweep snapshot for 20 deleted
pages and stale for 114 files. It is useful as a recovery source, not as a
release candidate.

## 5. Recovery sources and read-only commands

These are safe to run now; they only read Git objects.

```powershell
Set-Location "C:\Users\Shruti Subramanian\OneDrive\Desktop\Maritime"

# Show the old pre-rename version of a missing page
git show HEAD:horizon-frontend/src/pages/Authentication/Login/index.tsx

# Show the version currently held in the index for that rename destination
git show :nhaav-frontend/src/pages/Authentication/Login/index.tsx

# Show the 74%-similar rename diff and a sample backend rename
git diff --cached -M -- nhaav-backend/requirements.txt
git diff --cached -M -- nhaav-backend/app/main.py

# Confirm the index contains a blob for every staged destination
git ls-files -s -- nhaav-frontend/src/pages/Authentication/Login/index.tsx
```

To restore one missing page later (this writes a file, so it is **not** part of
this inspection):

```powershell
git show :nhaav-frontend/src/pages/Authentication/Login/index.tsx |
  Set-Content -NoNewline nhaav-frontend\src\pages\Authentication\Login\index.tsx
```

Recover from the old path instead with `git show
HEAD:horizon-frontend/<same-relative-path>`.

## 6. Approval-gated recovery/commit sequence (not executed)

The safe order is: prove the backup, fix ignore rules, neutralize the empty
nested metadata, unstage without touching the worktree, then stage and inspect.

1. Verify the archive checksum and test extraction (see the backup README).
2. Add ignore rules for `dist/`, `.freebuff/`, `.local-assets/`, dependency
   trees, `*.tar.gz`, and secrets; create `nhaav-frontend/.gitignore`.
3. After explicit approval, rename the two empty nested `.git` directories to
   `.git.empty-backup` (reversible; they contain no history). Without this,
   root `git add` treats them as embedded repositories.
4. After explicit approval, run plain `git reset` (mixed). This un-stages the
   rename set but **preserves every worktree file and all 114 modifications**.
   Never use `git reset --hard`, `git checkout .`, or `git clean`.
5. Review the 20 missing destinations and intentionally stage their deletion;
   do not restore obsolete pages merely because the index still has them.
6. `git add -A`, then inspect `git status --short`,
   `git diff --cached --stat`, and `git diff --cached --check`.
7. Confirm no `.env`, `*.db`, `uploads/`, `profile_brochures/`, `node_modules/`,
   `dist/`, or `*.tar.gz` is staged.
8. Commit only after the staged diff is reviewed; do not push until the commit
   is inspected.
9. Keep the old `horizon-*` paths recoverable in `HEAD`; no history rewrite is
   needed or recommended.

## 7. Ignore gaps that still need a decision

- `nhaav-frontend` has **no `.gitignore`**; `node_modules/`, `dist/`,
  `.freebuff/`, and `.local-assets/` are currently untracked but not ignored.
- Root tracks five old `horizon-frontend/dist/**` blobs in `HEAD`; the index
  renames them to `nhaav-frontend/dist/**`. Build output should not be tracked.
- `nhaav-backend` ignores `.env`, `.env.bak-*`, `*.db`, and `uploads/`; verify
  the backup’s excluded-secret list matches before any add.
- `nhaav-src-backup-pre-sweep.tar.gz` and the 9 MB hero video are untracked;
  keep the tarball out of Git, and decide whether media belongs in LFS or
  external storage.
