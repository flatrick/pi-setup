# Specification: MCP Overflow Management

## Description
The MCP Overflow Management system protects the agent's context window from being overwhelmed by large tool results. When an MCP server returns a response that exceeds a predefined size limit, the system automatically offloads the data to a local file and provides a reference to the agent.

## ADDED Requirements

### Requirement: Size Detection & Offloading
- The system SHALL monitor the token/character length of tool results from all MCP servers.
- If a result exceeds a predefined context window limit, it SHALL be saved to a file in `.pi/mcp/<server_name>/<timestamp>.txt`.
- The agent SHALL receive a reference message instead of the full content: *"The result for [tool_name] was too large and has been saved to [file path]. You can ask me to read specific parts of this file."*

#### Scenario: Agent receives a reference message instead of the large result
Given an MCP tool returns a response exceeding the configured character limit
When `pi` processes the result
Then the agent receives a reference message containing the file path instead of the raw content, and the full content is stored at that path.

### Requirement: Local File Management
- Offloaded files SHALL be stored in the `.pi/mcp/` directory.
- Files SHALL be named using a consistent format including server name and timestamp.

#### Scenario: Offloading large tool output
Given an MCP tool returns a response exceeding the context window limit
When `pi` processes the result
Then it should save the full content to a local file and return a reference to that file in the LLM's context.
