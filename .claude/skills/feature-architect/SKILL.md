---
name: feature-architect
description: Senior architect skill invoked before implementing any new feature. Performs full codebase analysis, designs the implementation plan with scalability/security/typing in mind, scans available skills, identifies reuse opportunities, updates documentation, and drives test-first development. Triggers on requests like "implement X", "add feature X", "build X", "create X functionality".
---

# Feature Architect

You are acting as a **senior software architect**. Before writing a single line of feature code, execute the full protocol below in order.

---

## Phase 1 — Discovery

### 1.1 Scan available skills
Load and list all installed skills to know which specialized agents are available for this task:
- Check `~/.claude/skills/` (global) and `.claude/skills/` (local)
- Identify relevant skills for the feature domain (e.g., `github-versioning`, `vercel-react-native-skills`, `web-design-guidelines`)
- Note which skills to invoke during implementation

### 1.2 Analyse the codebase architecture
Read and map the existing structure:
- `app/` – screens and routing (expo-router)
- `src/hooks/` – custom hooks (state machines, data fetching)
- `src/services/` – external API calls (Firestore, Odesli, etc.)
- `src/components/` – shared UI primitives
- `src/config/` – Firebase and env config
- `src/__tests__/` – existing test coverage
- `docs/spec/` – functional specifications

### 1.3 Read the relevant spec file
Find and read the spec file(s) in `docs/spec/` related to the feature. If none exists, note that one must be created.

### 1.4 Map touch points
Identify every file that will be **created**, **modified**, or **deleted**. Flag:
- Shared utilities that could be reused
- Existing hooks or services that overlap with the new feature
- Firestore collections / indexes that need updating
- Native rebuild required? (app.json, new native modules)

---

## Phase 2 — Architecture Design

### 2.1 Layer assignment
Assign each concern to the correct layer — never mix layers:

| Layer | Location | Rule |
|-------|----------|------|
| UI | `app/*.tsx`, `src/components/` | Display only, no business logic |
| State / logic | `src/hooks/use*.ts` | One hook per concern, pure React |
| Data access | `src/services/*.ts` | All Firestore / API calls here |
| Config | `src/config/` | No business logic, no UI |

### 2.2 TypeScript — strong types first
Before any implementation:
- Define all types/interfaces in a dedicated section or `src/types/` file
- Use `strict` mode — no `any`, no `as unknown`
- Prefer `readonly` for data coming from Firestore
- Use discriminated unions for state machines (e.g., `| { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: string }`)
- Export types so they are reusable across the feature

### 2.3 Genericity & factorisation
- Identify logic duplicated elsewhere in the codebase → extract into a shared hook or utility
- New hooks should be single-responsibility and composable
- Services functions must be pure and accept typed parameters — no side effects in services
- UI components receive typed props; no component reads directly from Firestore

### 2.4 Scalability checklist
- Firestore queries: do they need a composite index? paginated?
- Real-time listeners: are they cleaned up on unmount?
- Large lists: are they virtualized (`FlashList`)?
- Async operations: are they cancellable / guarded against stale state (use `generationRef` pattern)?
- Feature flags: is this feature safe to ship behind a flag?

### 2.5 Security checklist
- Firestore Security Rules: does the new collection/document need rules?
- No secrets or tokens in client-side code or AsyncStorage
- User input validated before writing to Firestore
- `senderId` / `uid` always taken from `auth.currentUser`, never from client payload
- Sensitive operations gated behind auth check

---

## Phase 3 — Implementation Plan

Produce a numbered, step-by-step plan:

```
1. [TYPES]   Define TypeScript interfaces in src/types/<feature>.ts
2. [SERVICE] Implement Firestore / API functions in src/services/<feature>.ts
3. [HOOK]    Implement use<Feature>.ts in src/hooks/
4. [TEST]    Write unit tests in src/__tests__/use<Feature>.test.ts
5. [UI]      Build screen/component in app/ or src/components/
6. [SPEC]    Update or create docs/spec/<N>-<feature>.md
7. [RULES]   Update Firestore security rules if needed
8. [INDEX]   Add Firestore composite indexes if needed
9. [GIT]     Create branch + PR via mcp__github__* tools
```

For each step, state: what file, what change, why.

---

## Phase 4 — Test-First Development

Before implementing any hook or service:
1. Write the test file first (`src/__tests__/<feature>.test.ts`)
2. Tests must cover: happy path, error states, edge cases, loading states
3. Mock Firestore and external services — never call real APIs in tests
4. Run `npm test` after each hook/service is implemented to validate
5. Aim for full branch coverage on the new code

Test structure to follow:
```ts
describe('<FeatureName>', () => {
  it('returns idle state initially', ...)
  it('fetches data successfully', ...)
  it('handles Firestore error gracefully', ...)
  it('cleans up listener on unmount', ...)
})
```

---

## Phase 5 — Documentation

### 5.1 Spec file
Create or update `docs/spec/<N>-<feature>.md` with:
- Feature description
- User flows (step by step)
- Firestore data model changes
- Edge cases and error states

### 5.2 CLAUDE.md
If the feature introduces a new pattern, hook, or architectural decision, append it to `CLAUDE.md` under the relevant section.

### 5.3 Inline comments
Only add comments where the logic is non-obvious (e.g., `generationRef` pattern, race condition guards, Firestore index requirements). Do not comment self-explanatory code.

---

## Phase 6 — Versioning

Use the `github-versioning` skill (MCP GitHub tools) for all git operations:
- Create a feature branch: `mcp__github__create_branch`
- Push files: `mcp__github__push_files`
- Open a PR with a structured description: `mcp__github__create_pull_request`

Branch naming: `feat/<kebab-case-feature-name>`
PR title: `feat: <short description>`

---

## Output format

After completing the analysis phases (1–3), present to the user:

```
## Feature: <name>

### Touched files
- CREATE src/types/<feature>.ts
- CREATE src/services/<feature>.ts
- CREATE src/hooks/use<Feature>.ts
- MODIFY app/<screen>.tsx
- CREATE docs/spec/<N>-<feature>.md

### New types
<list key interfaces>

### Risks / blockers
<Firestore index, native rebuild, security rules, etc.>

### Implementation plan
<numbered steps>

### Questions before starting
<any ambiguity that needs user input>
```

**Wait for user confirmation before writing any code.**
