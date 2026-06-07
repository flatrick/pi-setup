# Agent Instructions for OpenSpec

## Overview
This repository uses Specification-Driven Development (SDD) combined with Behavior-Driven Development (BDD) to manage and implement `pi` extensions. 

## Directory Structure
Every change proposal must follow this directory structure:

```
openspec/changes/<change-id>/
├── proposal.md
├── design.md
├── tasks.md
└── specs/
    ├── <FUNCTIONNAME_1>/spec.md
    └── <FUNCTIONNAME_2>/spec.md
```

- `<change-id>`: A unique identifier for the change (e.g., `mcp-extension`).
- `<FUNCTIONNAME>`: The name of the capability or function being implemented (e.g., `mcp`, `ui`). A single change may impact multiple functions, in which case they should each have their own directory within `specs/`.

## Artifact Guidelines

### 1. Proposal (`proposal.md`)
- **Problem Statement**: Clearly state the problem being solved.
- **Requirements**: List high-level requirements for the change.
- **Success Criteria**: Must be written in BDD style (Given/When/Then scenarios) to ensure they are verifiable.
- **Non-goals**: Explicitly define what is out of scope to keep the project focused.

### 2. Design (`design.md`)
- **Architecture**: Describe the system architecture, data flow, and state management.
- **Mapping**: Map design components back to the requirements in the specification.
- **Behavioral Descriptions**: Include testable behavior descriptions that correspond directly to the BDD scenarios defined in the proposal.

### 3. Tasks (`tasks.md`)
- **Atomicity**: Break down the implementation into atomic, actionable steps.
- **Granularity**: Each task should be small enough to be completed in a single session.
- **Definition of Done**: Every major milestone must include a "Definition of Done" that references the corresponding BDD scenario(s).

### 4. Specifications (`specs/<FUNCTIONNAME>/spec.md`)
- **Requirement Format**: All requirements MUST use "SHALL" or "MUST" to describe required behaviors.
  - *Example*: "The system SHALL support configuration from..."
- **Scenario Blocks**: Each requirement MUST include at least one `#### Scenario:` block in BDD format (Given/When/Then).

## Validation
Use the following command to verify that a change proposal is fully defined and ready for implementation:
`openspec validate --strict --type change <change-id>`
