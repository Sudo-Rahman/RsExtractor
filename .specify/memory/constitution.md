<!--
  SYNC IMPACT REPORT
  ==================================================
  Version change: (new) -> 1.0.0
  This is the initial ratification of the MediaFlow constitution.

  Modified principles: N/A (initial creation)

  Added sections:
    - Core Principles (4 principles: Code Quality, Testing Standards,
      UX Consistency, Performance Requirements)
    - Quality Gates (new section defining validation checkpoints)
    - Development Workflow (new section defining process requirements)
    - Governance (amendment procedure, versioning, compliance)

  Removed sections:
    - Template placeholders SECTION_2 and SECTION_3 replaced with
      concrete sections.
    - Template PRINCIPLE_5 removed (user requested 4 principles).

  Templates requiring updates:
    - .specify/templates/plan-template.md         -> no update needed
    - .specify/templates/spec-template.md          -> no update needed
    - .specify/templates/tasks-template.md         -> no update needed
    - .specify/templates/checklist-template.md     -> no update needed
    - .specify/templates/agent-file-template.md    -> no update needed
    - .specify/templates/commands/                 -> directory empty

  Follow-up TODOs: None. All placeholders resolved.
  ==================================================
-->

# MediaFlow Constitution

## Core Principles

### I. Code Quality

Every code change MUST satisfy the project's strict type-checking and
style conventions before merge. This principle exists because MediaFlow
spans two languages (TypeScript and Rust) and a reactive UI framework;
inconsistency in any layer compounds into user-visible defects.

- **TypeScript strict mode is non-negotiable.** `pnpm check` MUST pass
  with zero errors and zero warnings. The `any` type is prohibited
  except at JSON deserialization boundaries with an accompanying type
  assertion.
- **Rust code MUST compile with zero warnings.** All Tauri commands
  MUST return `Result<T, String>` and use early-return validation via
  `shared/validation.rs`.
- **Naming, import order, and file conventions** defined in AGENTS.md
  are authoritative. Deviations MUST be corrected before a commit is
  accepted.
- **Svelte 5 rune stores** MUST use module-level `$state` exported as
  object literals with getters/methods. Classes and legacy Svelte stores
  are prohibited.
- **Error handling** MUST use `logAndToast` (frontend) or `map_err`
  with descriptive messages (backend). Silent failures are prohibited;
  every recoverable error MUST surface a user-visible notification or a
  log entry.
- **Complexity MUST be justified.** New abstractions, additional crates,
  or npm packages require documented rationale. Prefer reusing existing
  shadcn-svelte components and project utilities before introducing new
  dependencies.

**Rationale**: A multimedia desktop app processing real user files has
zero tolerance for silent data corruption or ambiguous error states.
Strict typing and disciplined conventions catch defects at build time
rather than at the user's expense.

### II. Testing Standards

Tests MUST target critical, pure, testable functions. Testing effort
is concentrated where it yields the highest defect-prevention value:
data transformations, parsing, validation, and formatting logic.

- **Rust unit tests** MUST exist for every function listed in the
  AGENTS.md "Priority test targets" table. Tests reside in a
  `#[cfg(test)] mod tests` block at the bottom of the containing file.
- **Test isolation**: Tests MUST NOT depend on FFmpeg, network access,
  or the Tauri runtime. Functions requiring `AppHandle` or filesystem
  access MUST use temporary files or be excluded from unit testing.
- **Frontend validation gate**: `pnpm check` is the sole frontend
  validation command. No frontend test framework is in use; type
  checking IS the test gate for the UI layer.
- **New pure functions** added to any module MUST include at least one
  test covering the happy path and one covering an error/edge case.
- **Test naming** MUST be descriptive:
  `fn <function_name>_<scenario>_<expected>()` (e.g.,
  `fn format_srt_time_zero_returns_midnight()`).
- **Cargo test MUST pass** (`cargo test --manifest-path
  src-tauri/Cargo.toml`) with zero failures before any Rust change is
  committed.

**Rationale**: MediaFlow processes subtitle timing, OCR text matching,
and codec format mapping where off-by-one or format errors silently
corrupt output files. Targeted unit tests on pure functions provide
the highest ROI without the brittleness of integration tests against
external tools.

### III. User Experience Consistency

The UI MUST present a coherent, predictable experience across all
eight tool views. Users switching between Extract, Merge, Translation,
Rename, AudioToSubs, VideoOcr, Info, and Settings MUST encounter
consistent interaction patterns.

- **All UI text MUST be in English.** No mixed-language strings.
- **shadcn-svelte components are the sole UI primitive library.**
  Custom components MUST be checked against existing `$lib/components/ui`
  before creation. Duplicating existing component functionality is
  prohibited.
- **Error feedback MUST use `logAndToast`** with structured `source`,
  `title`, and `details` fields. Raw `alert()`, `console.error()` to
  the user, or silent swallowing of errors are prohibited.
- **Loading and progress states** MUST be communicated to the user for
  any operation exceeding 500ms. Long-running Tauri commands (FFmpeg,
  OCR, transcription) MUST emit progress events or display an
  indeterminate spinner.
- **Settings persistence** MUST use `@tauri-apps/plugin-store`. Usage
  of `localStorage`, `sessionStorage`, or cookies is prohibited.
- **Per-file metadata** MUST use `.rsext` sidecar files via Tauri
  invoke commands. No alternative persistence mechanisms are permitted
  for per-file data.
- **Drag-and-drop, keyboard navigation, and focus management** MUST
  function consistently across all views that accept file input.

**Rationale**: MediaFlow consolidates eight distinct multimedia tools
into a single application. Without enforced UX consistency, each view
becomes its own mini-application with divergent interaction patterns,
increasing cognitive load and eroding user trust.

### IV. Performance Requirements

MediaFlow processes large media files and computationally intensive
operations (OCR, transcription, FFmpeg encoding). Performance
discipline prevents the UI from becoming unresponsive and ensures
resource-efficient processing.

- **The UI thread MUST never block** on file I/O, FFmpeg invocations,
  OCR processing, or network requests. All such operations MUST execute
  via async Tauri commands.
- **Rust backend operations** MUST avoid unnecessary memory allocation.
  Large file reads MUST use streaming or buffered I/O rather than
  loading entire files into memory.
- **Reactive state updates** MUST use `$state.raw()` for large arrays
  (file lists, OCR frame results) to avoid deep-reactivity overhead.
  Map reactivity MUST use reassignment, not mutation.
- **FFmpeg and external process invocations** MUST be cancellable.
  Users MUST be able to abort long-running extractions, merges, or
  transcriptions without force-quitting the application.
- **Build output size** SHOULD be monitored. Unused dependencies MUST
  be removed. Tree-shaking and code-splitting boundaries SHOULD be
  preserved in the SvelteKit SPA configuration.
- **Startup time** MUST remain under 3 seconds on a machine meeting
  minimum system requirements. Tauri plugin initialization and store
  hydration MUST NOT block window rendering.

**Rationale**: A desktop multimedia application that freezes during
file processing or consumes excessive memory will be abandoned by
users who can fall back to CLI tools. Responsive UI during heavy
backend work is the core value proposition of a GUI wrapper.

## Quality Gates

Every code change MUST pass through these gates before being accepted:

1. **Type check gate**: `pnpm check` MUST complete with zero errors.
2. **Rust test gate**: `cargo test --manifest-path src-tauri/Cargo.toml`
   MUST complete with zero failures.
3. **Rust compilation gate**: The Rust backend MUST compile with zero
   warnings.
4. **Convention compliance gate**: Import order, naming conventions,
   file naming, and store patterns MUST conform to AGENTS.md.
5. **Commit hygiene gate**: Each commit MUST include only files modified
   for the specific task. Commit messages MUST explain "why" and "what"
   changed.

Changes that fail any gate MUST NOT be committed. Gated validation is
not optional and MUST NOT be skipped for expediency.

## Development Workflow

1. **Understand before changing**: Read existing code in the affected
   module before modifying it. Check AGENTS.md for applicable
   conventions.
2. **Validate early**: Run `pnpm check` and `cargo test` after each
   logical unit of change, not only at the end.
3. **Prefer editing over creating**: Modify existing files rather than
   creating new ones. New files require justification (new feature
   module, new store, new type namespace).
4. **Error paths first**: Implement validation and error handling before
   the happy path. Use early returns in both TypeScript and Rust.
5. **Test alongside implementation**: When adding or modifying a pure
   Rust function, write or update the corresponding test in the same
   commit.
6. **Review before commit**: Run `git status` and `git diff` to verify
   only intended changes are staged. Discard unrelated modifications.

## Governance

This constitution is the highest-authority document for MediaFlow
development practices. It supersedes informal conventions, ad-hoc
decisions, and individual preferences when conflicts arise.

- **Amendments** MUST be documented with a version bump, a dated
  changelog entry in the Sync Impact Report (HTML comment at the top
  of this file), and a rationale for the change.
- **Versioning** follows semantic versioning:
  - MAJOR: Principle removal, redefinition, or backward-incompatible
    governance change.
  - MINOR: New principle added or existing principle materially
    expanded.
  - PATCH: Clarifications, wording improvements, or non-semantic
    refinements.
- **Compliance review**: All code changes SHOULD be evaluated against
  these principles. The plan-template.md "Constitution Check" section
  MUST reference the current principles when creating implementation
  plans.
- **Runtime guidance**: AGENTS.md serves as the operational companion
  to this constitution, containing specific commands, file paths, and
  code patterns. AGENTS.md MUST remain consistent with the principles
  defined here.

**Version**: 1.0.0 | **Ratified**: 2026-02-19 | **Last Amended**: 2026-02-19
