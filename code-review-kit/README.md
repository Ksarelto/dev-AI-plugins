# Code Review Kit

A combined plugin with a code review agent and security review skill.

## Components

| Component | Name | Description |
|-----------|------|-------------|
| Agent | `code-reviewer` | Thorough review for bugs, readability, maintainability |
| Skill | `security-review` | Security-focused vulnerability and auth checks |

## Usage

- Delegate to the **code-reviewer** agent from the agent picker for general PR reviews
- The **security-review** skill triggers automatically when reviewing auth, API, or input-handling code
