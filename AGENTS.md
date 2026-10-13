# AGENTS.md

## Project Overview

This project is a web port of the classic DOS game **Zeliard**.

- The game currently works 100%.
- The codebase is written in pure, strict TypeScript.
- Existing game behavior is the baseline of correctness.
- Preserve the original game's mechanics, timing, controls, physics, rendering, audio, and progression unless the task explicitly requires changing them.

## Core Principles

1. **Preserve working behavior.** Treat the existing implementation as the source of truth. Never rewrite working systems merely to make them look cleaner or more modern.
2. **Make the smallest effective change.** Prefer targeted fixes over refactoring, architectural changes, abstractions, or broad cleanup.
3. **Understand before modifying.** Trace the relevant code paths and identify dependencies before making changes.
4. **Respect existing architecture.** Follow established project conventions and reuse existing abstractions when appropriate. Do not introduce new frameworks, libraries, or architectural patterns without explicit justification.
5. **Verify every change.** Use the available checks and tests appropriate to the change. Distinguish verified results from assumptions.
6. **Keep scope under control.** Do not modify unrelated files, reformat unrelated code, or fix unrelated issues opportunistically.
7. **Human ownership of changes.** The project owner reviews every code change and performs all Git commits.

## Absolute Prohibitions

### 1. Never Commit to Git

**Committing to Git is strictly forbidden.**

- Never execute `git commit`, including through scripts, hooks, agents, or other tools.
- Never amend, create, or otherwise modify commits.
- Never use commands or automation that commit changes implicitly.
- Do not push changes or rewrite Git history.
- Do not stage changes with `git add` unless explicitly authorized by the project owner.
- Do not discard, reset, revert, or overwrite the project owner's existing changes.
- Do not use destructive Git commands to clean up the working tree.
- Never assume that an existing modification is yours or safe to remove.

The project owner personally reviews every code change and performs all commits.

You may inspect Git status, diffs, and history when useful. Leave all modifications in the working tree for review.

### 2. Strict Comment Policy

**Default: write no comments. A comment must justify its own existence.**

Follow the exact brief below. It must be communicated verbatim to every sub-agent before it starts work.

> It is strictly FORBIDDEN to write comments based on the principle that "a comment is useful if the information is correct and relevant."
>
> Adopt this approach: there is no comment by default; a comment must justify its own existence.

This policy applies to all code and documentation contexts in which comments may be introduced, including TypeScript, tests, configuration files, and generated or auxiliary code.

Additional requirements:

- Do not add comments merely to explain what the code does.
- Do not add comments that paraphrase function names, variable names, types, expressions, or control flow.
- Do not add comments merely because a function or algorithm is nontrivial.
- Prefer clear naming, straightforward control flow, and appropriate types over explanatory comments.
- Do not add TODO, FIXME, or similar annotations without explicit justification and authorization.
- When modifying existing code, do not add comments as a side effect of refactoring.
- Do not remove or rewrite existing comments indiscriminately. Evaluate them individually when the task requires touching them.
- If a comment appears necessary, first determine whether the code can communicate the same information without it.
- Add a comment only when its specific, non-obvious information cannot reasonably be expressed in the code itself and the comment's value clearly outweighs its maintenance cost.

**Sub-agent requirement:** Before delegating any task, send every sub-agent the exact brief quoted above. Do not paraphrase, shorten, or omit it. Ensure the sub-agent understands and follows the policy.

## TypeScript Requirements

- Use TypeScript exclusively for project implementation code.
- Preserve strict TypeScript settings and existing compiler guarantees.
- Do not introduce `any`, unsafe type assertions, or non-null assertions merely to bypass type errors.
- Do not weaken compiler settings to make a change compile.
- Do not suppress type errors or introduce `@ts-ignore`, `@ts-nocheck`, or equivalent workarounds without explicit authorization.
- Prefer precise types, discriminated unions, and existing domain models where appropriate.
- Handle nullable values and exceptional states explicitly.
- Avoid unnecessary type duplication, generic abstractions, and speculative generalization.
- Follow the repository's existing module system, naming conventions, and formatting rules.
- Do not introduce JavaScript implementation files or a new build system without explicit authorization.

## Game Integrity

Zeliard is an existing, working game port. Compatibility and behavioral fidelity take precedence over speculative improvements.

- Preserve game mechanics, collision behavior, movement, combat, damage, and timing.
- Preserve level layouts, progression, enemy behavior, items, and resource management.
- Preserve rendering, animation timing, screen transitions, and input semantics.
- Preserve audio behavior and synchronization where applicable.
- Avoid changes to frame timing, update order, randomization, or numerical calculations unless required by the task.
- Be cautious with floating-point arithmetic, integer conversions, coordinate systems, and timing-dependent logic.
- Avoid unrelated performance optimizations that could change behavior.
- Do not replace established implementations with approximations when doing so could alter gameplay.
- Treat apparent quirks as potentially intentional until their behavior and purpose have been investigated.

When a task requires changing observable behavior, keep the change limited to the requested behavior and verify that unrelated behavior remains intact.

## Change Management

Before modifying code:

1. Identify the requested outcome and its acceptance criteria.
2. Inspect the relevant implementation and its dependencies.
3. Check the working tree for existing user changes.
4. Identify potential behavioral risks and relevant verification steps.
5. Choose the smallest change that satisfies the task.

While modifying code:

- Avoid unrelated edits and broad refactoring.
- Preserve public interfaces unless a change explicitly requires otherwise.
- Do not add dependencies without explicit justification.
- Do not change configuration or tooling merely for convenience.
- Do not silently alter existing behavior to make tests pass.
- Do not overwrite user work.

After modifying code:

1. Review the complete diff.
2. Check for accidental changes, unnecessary complexity, and policy violations.
3. Run relevant existing tests and validation commands when available.
4. Run the TypeScript compiler or project-defined type-check command when appropriate.
5. Report checks that were run and any checks that could not be run.
6. Summarize modified files, behavioral implications, and remaining risks.

Do not claim that a change is verified unless the corresponding verification was actually performed.

## Testing and Validation

- Prefer existing project scripts and test infrastructure.
- Do not invent test commands; inspect `package.json` and repository documentation first.
- Add or modify tests only when justified by the task.
- Prefer regression tests for behavior that could be unintentionally changed.
- Do not alter production behavior solely to satisfy an incorrect or outdated test.
- Do not remove, skip, weaken, or rewrite failing tests simply to obtain a passing result.
- If automated tests cannot cover a gameplay behavior, state what remains to be verified manually.
- Do not install new tooling or dependencies without a clear need.

## Delegation and Sub-Agents

Sub-agents must follow this document and all project-owner restrictions.

Before assigning any task:

1. Provide the sub-agent with the exact comment policy brief quoted in the **Strict Comment Policy** section, verbatim.
2. Explicitly prohibit Git commits and any other prohibited Git operations.
3. Define the task scope, expected output, and relevant files.
4. Require minimal changes and preservation of existing behavior.
5. Require the sub-agent to report modified files, validation performed, and unresolved concerns.

Do not assume that a sub-agent has inherited these instructions automatically. Communicate the critical restrictions directly.

Review all sub-agent output and changes before accepting them. Delegation does not transfer responsibility for correctness or policy compliance.

## Completion Report

When a task is complete, provide a concise report containing:

- **Changes:** What changed and why.
- **Files:** Which files were modified.
- **Verification:** Which checks were actually run and their results.
- **Behavioral impact:** Any expected changes to gameplay or runtime behavior.
- **Risks:** Remaining uncertainties or manual verification requirements.

Do not commit, stage, or push changes as part of task completion. Leave the final review and commit to the project owner.

## Priority Rule

When instructions conflict, prioritize explicit project-owner instructions and absolute prohibitions. Never interpret a request for implementation, cleanup, testing, refactoring, or task completion as implicit permission to commit changes or violate the comment policy.
