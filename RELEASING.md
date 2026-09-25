# Releasing

How a release is cut, by hand, following git flow. The git-flow CLI is not used;
these are the steps it would run.

## Branches

- `main` holds releases. Every commit on it is a tagged version.
- `develop` is where features land, by pull request from `feature/*`.
- `release/x.y.z` is cut from `develop` to prepare a release, and is where the
  version number, the changelog and any last fixes go.
- `hotfix/x.y.z` is cut from `main` for a fix that cannot wait for the next
  release, and goes back into both `main` and `develop`.

## Versions

[Semantic versioning](https://semver.org/). Pre-1.0 a minor release may change
anything; a new feature is a minor bump, a fix a patch. Tags are lowercase:
`v0.3.0`.

The version is recorded in `frontend/package.json` (and its lockfile's two root
entries). The app shows it, falling back to that file when the build is not
given `APP_VERSION`.

## Cutting a release

1. **Branch** from an up-to-date `develop`, in a worktree of its own:

   ```sh
   git fetch origin
   git worktree add -b release/x.y.z ../nafin-toolbox-release origin/develop
   ln -s /home/bpfel/nafin-toolbox/.claude ../nafin-toolbox-release/.claude
   ```
2. **Bump the version** in `frontend/package.json` and both root `"version"`
   entries of `frontend/package-lock.json`.
3. **Write the changelog entry** in `CHANGELOG.md`. Lead with *Upgrading* —
   migrations that can fail, data that is not carried forward, images to
   rebuild — because an operator reads the top and stops. Then what is new, for
   users.
4. **Check the upgrade path**, which a test suite on fresh data will not:
   - Which migrations run from the last release, and can any of them fail on
     real data?
   - Does the client migrate every vault version the last release could have
     written? (`VAULT_VERSION` then, the chain in `migrateVault` now.)
   - Does an account created under the last release still work — keys, roles,
     anything that used to be created only at sign-up?
5. **Fix on the release branch** whatever that turns up, as ordinary commits.
6. **Open a pull request into `main`** and let CI pass.
7. **Squash-merge** the pull request, titled `Release x.y.z`. `main` is protected
   by a ruleset requiring linear history and refusing force-pushes. That rules
   out a merge commit, and a fast-forward too, since `develop` carries its
   feature pull requests' merge commits. A rebase-merge fails as well: GitHub
   cannot replay that many commits across merged branches. A squash is one
   commit per release on `main`, which is what `main` is for; the individual
   commits stay on `develop`, unrewritten.
8. **Tag** the squash commit on `main` and publish a GitHub release whose notes
   are the changelog entry:

   ```sh
   git fetch origin
   git tag -a vx.y.z -m "vx.y.z" origin/main
   git push origin vx.y.z
   gh release create vx.y.z --title "vx.y.z" --notes-file <entry>
   ```
9. **Bring `develop` level.** Fast-forward it to the release branch, which adds
   the release commits under their original hashes, then merge `main` back in.
   The merge changes no file — both sides hold the same tree — but it makes the
   squash commit an ancestor of `develop`, so the next release squashes from
   here rather than from the release before:

   ```sh
   git switch develop && git merge --ff-only origin/release/x.y.z
   git merge --no-edit origin/main
   git diff --quiet origin/main develop && git push origin develop
   ```
10. **Remove the release branch** and its worktree.

## Building a release

```sh
git checkout vx.y.z
APP_VERSION="$(git describe --tags)" docker compose build
docker compose up -d
```

Both images, always. Migrations are compiled into the `api` image, so restarting
without rebuilding runs none of them.
