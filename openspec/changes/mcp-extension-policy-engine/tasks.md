# Tasks: MCP Policy Engine

## 1. Types & Config Schema
- [ ] Define `PolicyVerdict { allowed: boolean; reason: string }` type.
- [ ] Define `PolicyConfig` type matching the `.mcp.json` `policy` block (`allow_list`, `deny_patterns`, `global_validator`, `tool_validators`).

**Definition of Done**: Types are defined and exported; no runtime logic yet.

## 2. AllowDenyCheck
- [ ] Implement `AllowDenyCheck.evaluate(toolName, policy)`:
    - [ ] Deny if `allow_list` is defined and `toolName` is not present in it.
    - [ ] Deny if `toolName` matches any entry in `deny_patterns`.
    - [ ] Allow otherwise.
- [ ] Write unit tests: explicit deny match; not in allow_list; in allow_list passes; no list defined passes.

**Definition of Done**: All four unit test conditions pass. *(Scenario: "Explicitly denied tool is blocked")*

## 3. RegexCheck
- [ ] Implement `RegexCheck.evaluate(toolArguments, policy)`:
    - [ ] Serialize `toolArguments` to a JSON string.
    - [ ] Test against each pattern in the policy's forbidden argument regex list.
    - [ ] Return deny on first match.
- [ ] Write unit tests: matching pattern denies; non-matching allows; empty pattern list allows.

**Definition of Done**: All three unit test conditions pass. *(Scenario: "Forbidden argument regex blocks a call")*

## 4. ScriptRunner
- [ ] Implement `ScriptRunner.run(scriptCommand, toolName, toolArguments)`:
    - [ ] Spawn the script as a child process.
    - [ ] Write `{ "tool": toolName, "arguments": toolArguments }` to `stdin`.
    - [ ] Apply a hard 3-second timeout; kill process and return fail-safe deny on expiry.
    - [ ] Parse `stdout` as `PolicyVerdict`; treat parse errors as deny.
- [ ] Write unit tests: approval passes; denial propagates reason; timeout returns deny; crash returns deny.

**Definition of Done**: All four unit test conditions pass. *(Scenarios: "Global validator approval", "Global validator denial", "Script timeout triggers fail-safe")*

## 5. PolicyEngine (Orchestrator)
- [ ] Implement `PolicyEngine.evaluate(serverId, toolName, toolArguments)`:
    - [ ] Load `PolicyConfig` for the given `serverId`.
    - [ ] Run evaluators in order: `AllowDenyCheck` → `RegexCheck` → `ScriptRunner` (global, then tool-specific).
    - [ ] Short-circuit and return the deny verdict on the first failure.
- [ ] Write integration tests covering each denial path and the full-pass path.

**Definition of Done**: Integration tests confirm short-circuit behavior and all five Success Criteria scenarios are covered.

## 6. Wiring
- [ ] Intercept tool calls in `MCPManager` before dispatch to `ServerClient`.
- [ ] Call `PolicyEngine.evaluate()`; on deny, surface the `reason` to the user via `ctx.ui.notify` and abort the call.
- [ ] Replace the pass-through stub installed by `mcp-extension` with this implementation.
- [ ] Write end-to-end test confirming a denied tool call never reaches the transport.

**Definition of Done**: Denied call is blocked at the policy gate and the reason is shown to the user. *(Scenario: "Explicitly denied tool is blocked")*
