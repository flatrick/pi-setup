# Proposal: MCP Overflow Management

## Description
This proposal outlines a mechanism to protect the agent's context window from being overwhelmed by large tool results. When an MCP server returns a response that exceeds a predefined size limit, this system will automatically offload the data to a local file and provide a reference to the agent.

## Goals
- **Context Window Protection**: Prevent "Context Overflow" errors when interacting with tools that return large amounts of data (e.g., directory trees, large JSON dumps, logs).
- **Seamless Experience**: The agent should be able to continue the conversation by referencing the offloaded file without needing to see the entire content at once.
- **Traceability**: Ensure all offloaded files are organized and easily discoverable within the `.pi` workspace.

## Mechanics

### 1. Size Detection
The `OverflowManager` will monitor every tool result received from an MCP server. Results will be measured against a configurable token/character limit.

### 2. Offloading Strategy
If a result exceeds the limit:
- **File Storage**: The full content is written to a file in `.pi/mcp/<server_name>/<timestamp>.txt`.
- **Reference Message**: Instead of returning the full result to the agent, the system will return a reference message:
    - *"The result for [tool_name] was too large and has been saved to [file path]. You can ask me to read specific parts of this file or provide a summary."*

### 3. Interaction Pattern
The agent's context window remains clean because it only sees the reference message. If the agent needs the data, it can request:
- A summary of the offloaded file (if the `OverflowManager` supports summarizing).
- Reading specific lines or segments of the file (via a subsequent tool call that reads the local file).

## Example Workflow
1. **User**: "Show me all the files in the production database directory."
2. **MCP Tool**: Returns 5,000 file paths.
3. **Overflow Manager**: Detects result is > 4,000 characters. Saves to `.pi/mcp/db-server/2026-06-07_1400.txt`.
4. **Agent**: "The results were too large and saved to .pi/mcp/db-server/2026-06-07_1400.txt. Would you like me to summarize them or look for something specific?"

## Success Criteria

#### Scenario: Large result is offloaded and a reference returned
Given an MCP tool returns a result exceeding the configured size limit
When `pi` processes the result
Then the full content is saved to `.pi/mcp/<server_name>/<timestamp>.txt` and the agent receives a reference message pointing to that file instead of the raw content.

#### Scenario: Small result passes through unchanged
Given an MCP tool returns a result within the size limit
When `pi` processes the result
Then the full content is passed through to the agent without modification.

#### Scenario: Agent can access offloaded content on demand
Given a result has been offloaded to a local file
When the agent requests to read a specific portion of that file
Then it can retrieve the content via a subsequent file-read tool call using the path from the reference message.

## Non-goals

- **Automatic summarization**: The `OverflowManager` returns a reference message only; it does not generate summaries of offloaded content.
- **Streaming large results in chunks**: Results are either passed through in full or offloaded entirely — no partial streaming.
- **Per-server size limits**: A single global threshold applies to all servers in this iteration.
- **Garbage collection of offloaded files**: Old `.pi/mcp/` files are not automatically cleaned up by this change.
- **Compression of offloaded files**: Files are stored as plain text.

## Risks & Unknowns
- **Summary Generation**: We need to decide if the `OverflowManager` should automatically try to generate a summary (which might itself be large) or if it strictly just provides the reference.
- **File Permissions**: Ensuring that the `.pi` directory is correctly managed and permissions allow the agent to read these files later.
