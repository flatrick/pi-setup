# Design: MCP Overflow Management

## Architecture Overview

The `OverflowManager` is a processing layer that sits between the `ServerClient` and `pi`'s tool response handler. Every tool result passes through it before being returned to the agent.

```
┌────────────────────────────┐
│        ServerClient         │
│  (receives raw MCP result) │
└─────────────┬──────────────┘
              │ raw result
              ▼
┌────────────────────────────┐
│       OverflowManager       │  <-- Size gate
│  ┌──────────────────────┐  │
│  │   SizeChecker        │  │
│  └────────┬─────────────┘  │
│           │ exceeds limit?  │
│  ┌────────▼─────────────┐  │
│  │   FileStore          │  │  writes to .pi/mcp/
│  └────────┬─────────────┘  │
│           │ file path       │
│  ┌────────▼─────────────┐  │
│  │  ReferenceBuilder    │  │  constructs reference message
│  └──────────────────────┘  │
└─────────────┬──────────────┘
              │ result or reference message
              ▼
         pi agent context
```

## Components

### 1. OverflowManager
- **Responsibilities**:
    - Receives every tool result from `ServerClient`.
    - Delegates size checking to `SizeChecker`.
    - Orchestrates file storage and reference message construction when a result exceeds the limit.
    - Returns the original result unchanged when within the limit.
- **Maps to**: Requirement: Size Detection & Offloading; Requirement: Local File Management.

### 2. SizeChecker
- **Responsibilities**:
    - Measures the character length of a tool result string.
    - Compares against a configurable threshold (default: 4,000 characters).
    - Returns a boolean indicating whether offloading is required.
- **Maps to**: Requirement: Size Detection & Offloading.

### 3. FileStore
- **Responsibilities**:
    - Ensures the `.pi/mcp/<server_name>/` directory exists, creating it if necessary.
    - Writes full result content to a file named `<ISO-timestamp>.txt` within that directory.
    - Returns the absolute file path of the written file.
- **Maps to**: Requirement: Local File Management.

### 4. ReferenceBuilder
- **Responsibilities**:
    - Constructs the standardized reference message returned to the agent.
    - Message format: *"The result for [tool_name] was too large and has been saved to [file path]. You can ask me to read specific parts of this file."*
- **Maps to**: Requirement: Size Detection & Offloading.

## Data Flow

1. `ServerClient` receives a raw tool result and calls `OverflowManager.process(serverId, toolName, result)`.
2. `SizeChecker.exceeds(result)` returns `true` or `false`.
3. **Within limit**: `OverflowManager` returns the original `result` unchanged.
4. **Over limit**:
    a. `FileStore.write(serverId, result)` saves the content and returns the file path.
    b. `ReferenceBuilder.build(toolName, filePath)` constructs the reference message.
    c. `OverflowManager` returns the reference message in place of the raw result.

## Behavioral Descriptions

### "Large result is offloaded and a reference returned"
*Corresponds to Success Criteria scenario 1 in proposal.md.*
- When `SizeChecker.exceeds()` returns `true`, the manager MUST NOT return the raw result.
- `FileStore` MUST create the target directory if absent and write the full content.
- The returned string MUST contain the absolute file path and the tool name.

### "Small result passes through unchanged"
*Corresponds to Success Criteria scenario 2 in proposal.md.*
- When `SizeChecker.exceeds()` returns `false`, the manager MUST return the original `result` string with no modification.
- `FileStore` MUST NOT be invoked.

### "Agent can access offloaded content on demand"
*Corresponds to Success Criteria scenario 3 in proposal.md.*
- The file path embedded in the reference message MUST be a valid, readable path within `.pi/mcp/`.
- The file content MUST exactly match the original tool result.
