---
name: github-versioning
description: Enforce using MCP GitHub tools for all versioning-related actions (commits, branches, PRs, tags, releases, merges). Triggers on any task involving git operations, pull requests, issue tracking, or repository management. ALWAYS prefer mcp__github__* tools over Bash git commands or gh CLI for these operations.
---

# GitHub Versioning via MCP

For **all actions related to versioning**, you MUST use the MCP GitHub tools (`mcp__github__*`) instead of Bash `git` commands or the `gh` CLI.

## Scope — use MCP GitHub tools for:

| Action | MCP tool to use |
|--------|----------------|
| Create a branch | `mcp__github__create_branch` |
| Create or update a file / commit | `mcp__github__create_or_update_file` |
| Push multiple files | `mcp__github__push_files` |
| Create a pull request | `mcp__github__create_pull_request` |
| Read a pull request | `mcp__github__pull_request_read` |
| Update a pull request | `mcp__github__update_pull_request` |
| Merge a pull request | `mcp__github__merge_pull_request` |
| List / search pull requests | `mcp__github__list_pull_requests` / `mcp__github__search_pull_requests` |
| Add a PR review | `mcp__github__pull_request_review_write` |
| Add a comment to a PR | `mcp__github__add_reply_to_pull_request_comment` |
| List branches | `mcp__github__list_branches` |
| List / get tags | `mcp__github__list_tags` / `mcp__github__get_tag` |
| List / get releases | `mcp__github__list_releases` / `mcp__github__get_latest_release` |
| Get a commit | `mcp__github__get_commit` |
| List commits | `mcp__github__list_commits` |
| Get file contents | `mcp__github__get_file_contents` |
| Delete a file | `mcp__github__delete_file` |
| Search code | `mcp__github__search_code` |

## Rules

1. **Never use `git push`, `git commit`, `gh pr create`, `gh pr merge`, or similar Bash/gh commands** for the operations listed above — use the corresponding `mcp__github__*` tool instead.
2. Before calling any MCP GitHub tool, load it with `ToolSearch` using `select:mcp__github__<tool_name>` if it has not been loaded yet.
3. For read-only local inspection (e.g., `git status`, `git diff`, `git log`) the Bash tool is acceptable, but any write/publish action must go through MCP.
4. Always confirm the target repository and branch before write operations.
