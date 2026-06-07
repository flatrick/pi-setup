# Tasks: MCP Overflow Management

## 1. SizeChecker
- [ ] Implement `SizeChecker` with a configurable character threshold (default: 4,000).
- [ ] Write unit tests: result at limit passes through; result one character over triggers offload.

**Definition of Done**: Unit tests pass for both boundary conditions. *(Scenarios: "Small result passes through unchanged", "Large result is offloaded")*

## 2. FileStore
- [ ] Implement `FileStore.write(serverId, content)`:
    - [ ] Create `.pi/mcp/<serverId>/` directory if it does not exist.
    - [ ] Write content to `<ISO-timestamp>.txt` within that directory.
    - [ ] Return the absolute file path.
- [ ] Write unit tests: correct directory structure and file naming; returns a readable path.

**Definition of Done**: Written file is present at the expected path and contains the full original content. *(Scenario: "Large result is offloaded and a reference returned")*

## 3. ReferenceBuilder
- [ ] Implement `ReferenceBuilder.build(toolName, filePath)` returning the standard reference message string.
- [ ] Write unit tests: message contains the tool name and the exact file path.

**Definition of Done**: Returned message contains both the tool name and the file path. *(Scenario: "Large result is offloaded and a reference returned")*

## 4. OverflowManager (Orchestrator)
- [ ] Implement `OverflowManager.process(serverId, toolName, result)`:
    - [ ] Delegate to `SizeChecker`; return `result` unchanged if within limit.
    - [ ] On overflow: call `FileStore`, then `ReferenceBuilder`, return reference message.
- [ ] Write integration test covering the full offload path end-to-end.
- [ ] Write integration test confirming pass-through when result is within limit.

**Definition of Done**: Integration tests pass for both paths. *(All three Success Criteria scenarios)*

## 5. Wiring
- [ ] Connect `OverflowManager` into `ServerClient` response handling path.
- [ ] Replace the pass-through stub installed by `mcp-extension` with this implementation.
- [ ] Verify end-to-end: a simulated oversized MCP response produces a reference message and a readable local file.

**Definition of Done**: Manual smoke test confirms offloaded file is created and agent receives the reference message. *(Scenario: "Agent can access offloaded content on demand")*
