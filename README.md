# Kommit

Kommit is a simple command-line tool that helps you create conventional commit messages for your Git repositories.

## Features

- Automatically checks for staged changes before committing
- Provides an interactive selection of conventional commit types using fzf
- Extracts ticket/issue numbers from branch names to use as scope
- Opens your editor to complete the commit message
- Aborts the commit if the message is empty

## Requirements

- Git
- zsh
- fzf (for interactive selection)
- gsed (GNU sed)
- nvim (or modify the script to use your preferred editor)

## Installation

1. Clone this repository or download the `kommit.zsh` file
2. Make the script executable:
   ```
   chmod +x kommit.zsh
   ```
3. Add the script to your PATH or create an alias in your `.zshrc`:
   ```
   alias kommit="/path/to/kommit.zsh"
   ```

## Usage

1. Stage your changes with `git add`
2. Run the kommit script:
   ```
   kommit.zsh
   ```
   or if you set up an alias:
   ```
   kommit
   ```
3. Select a conventional commit type from the list
4. Complete your commit message in the editor
5. Save and exit to finalize the commit

## How It Works

Kommit follows the [Conventional Commits](https://www.conventionalcommits.org/) specification to structure your commit messages. It automatically extracts ticket/issue numbers from your branch name (if available) to use as the scope.

For example, if your branch is named `feature/JIRA-123-add-new-feature`, kommit will extract `JIRA-123` as the scope, resulting in a commit message like:

```
feat(JIRA-123): Your commit message here
```

## Supported Conventional Commit Types

- feat: A new feature
- fix: A bug fix
- chore: Routine tasks, maintenance, etc.
- test: Adding or refactoring tests
- build: Changes to build system or dependencies
- docs: Documentation only changes
- ci: Changes to CI configuration
- refactor: Code changes that neither fix bugs nor add features
- perf: Performance improvements
- revert: Reverting a previous commit
- style: Changes that don't affect code meaning (formatting, etc.)
