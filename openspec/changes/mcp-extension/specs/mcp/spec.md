# Specification: MCP Extension

## Description
The MCP (Model Context Protocol) extension allows `pi` to connect to external tools, data sources, and prompts through a standardized protocol. This enables `pi` to be dynamically extended with capabilities from various servers without requiring hardcoded integrations for each one.

## ADDED Requirements

### Requirement: Configuration Support
- The system SHALL support configuration from:
    - Workspace local file (`.mcp.json` in the current working directory).
    - Global config file (`~/.pi/agent/.mcp.json`).
- The configuration format SHALL be a JSON object containing `mcpServers`.
- Each server entry SHALL include:
    - `type`: (e.g., `stdio`, `http`)
    - `command` & `args`: (for `stdio`)
    - `url` & `headers`: (for `http`)
    - `env`: (optional dictionary of environment variables)

#### Scenario: Loading configuration from workspace local file
Given a `.mcp.json` file exists in the current workspace directory
When `pi` starts up
Then it should load the `mcpServers` defined in that `.mcp.json` file.

#### Scenario: Loading configuration from global config file
Given no `.mcp.json` file exists in the workspace but a `~/.pi/agent/.mcp.json` file exists
When `pi` starts up
Then it should load the `mcpServers` defined in `~/.pi/agent/.mcp.json`.

#### Scenario: Validating configuration format
Given a `.mcp.json` file with an invalid server entry (e.g., missing `type`)
When `pi` attempts to load the configuration
Then it should report a configuration error for that specific server and continue loading others.

### Requirement: Environment Variable Resolution
- Environment variables for MCP servers SHALL be resolved using the following precedence:
    1.  **Explicit Config**: Variables in the `.mcp.json` `env` block.
    2.  **Workspace File**: Variables in a local `.env` file.
    3.  **Process Environment**: Variables already exported in the shell/process.

#### Scenario: Explicit config overrides workspace .env
Given a server has an `API_KEY` defined in both `.mcp.json` `env` and a local `.env` file
When `pi` initializes the server
Then it should use the value from the `.mcp.json` `env` block.

#### Scenario: Workspace .env overrides process environment
Given a server has an `API_KEY` defined in a local `.env` file but not in `.mcp.json`
When `pi` initializes the server
Then it should use the value from the local `.env` file.

### Requirement: Server Management & Lifecycle
- The system SHALL discover and load all servers from both config sources on session start.
- Servers SHALL be initialized concurrently during `session_start`.
- Handshake (initialization) SHALL occur automatically.
- Connection status (Connected, Disconnected, Initializing, Error) SHALL be tracked.
- All active connections/processes SHALL be gracefully closed on `session_shutdown`.
- Initializations and requests SHALL have a configurable or default timeout (e.g., 10 seconds) to prevent blocking the agent's startup.

#### Scenario: Concurrent initialization of multiple servers
Given three MCP servers defined in the configuration
When `pi` starts up
Then it should initialize all three servers concurrently.

#### Scenario: Graceful shutdown of servers
Given three active MCP servers are connected
When `pi` is shut down
Then it should close all connections and processes for those servers gracefully.

#### Scenario: Handling initialization timeout
Given an MCP server that takes longer than 10 seconds to initialize
When `pi` starts up
Then it should mark the server as "Error" (or similar) after the timeout and continue starting other servers.

### Requirement: Tool Integration & Collision Prevention
- All discovered tools from all active servers SHALL be registered into the `pi` tool registry.
- Tools SHALL be prefixed with their server name to prevent name collisions (e.g., `github:create_issue`, `sqlite:query`).

#### Scenario: Tool registration with prefixing
Given a `github` MCP server provides a tool named `create_issue`
When the server is connected
Then the tool should be available in `pi` as `github:create_issue`.

#### Scenario: Preventing name collisions
Given two different servers (e.g., `github` and `gitlab`) both provide a tool named `create_issue`
When both are connected
Then they should be registered as `github:create_issue` and `gitlab:create_issue` respectively.

### Requirement: Observability & UI
- A `/mcp` command SHALL exist to:
    - List all active servers and their statuses.
    - List the tools registered for each server.
    - Show the source of environment variables for each server (e.g., "Loaded from .env").
- Connection failures or initialization errors SHALL be surfaced via `ctx.ui.notify` without preventing other servers from connecting.

#### Scenario: Listing MCP status via /mcp command
Given three MCP servers are connected
When the user runs the `/mcp` command
Then it should display the status and tools for all three servers.

#### Scenario: Notifying on connection failure
Given an MCP server fails to connect due to an invalid URL
When `pi` attempts to connect
Then it should notify the user via `ctx.ui.notify` with a descriptive error message.
