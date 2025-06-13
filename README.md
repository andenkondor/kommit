# Kommit

Kommit is a simple command-line tool that helps you create conventional commit messages for your Git repositories.

## Features

- Automatically checks for staged changes before committing
- Provides an interactive selection of conventional commit types using fzf
- Intelligently extracts ticket/issue number from your current branch
- Opens your editor to complete the commit message
- Aborts the commit if the message is empty
- Supports switching between different message sources (git reflog and git log) using keybindings

## Requirements

- Git
- zx
- fzf (for interactive selection)

## Installation

```
brew tap andenkondor/zapfhahn
brew install andenkondor/zapfhahn/kommit
```

## Usage

1. Stage your changes with `git add`
2. Run the kommit script:

   ```
   kommit
   ```

3. Select a conventional commit type from the list
4. Complete your commit message in the editor
5. Save and exit to finalize the commit

## How It Works

Kommit follows the [Conventional Commits](https://www.conventionalcommits.org/) specification to structure your commit messages. It intelligently extracts ticket/issue numbers from your branch name and lets you choose which pattern to use.

For example:
- If your branch is named `feature/JIRA-123-add-new-feature`, kommit will offer to use `JIRA-123` as the scope
- If your branch is named `main`, no scope will be used

The resulting commit message will look like:
```
feat(JIRA-123): <Your commit message here>
```

## Message Sources

Kommit allows you to use previous commit messages as a base for your new commit. You can switch between different sources:

- **Git Reflog**: Shows your recent commit history including all references
- **Git Log**: Shows the commit history of the current branch

Use the following keybindings to switch between sources:
- `Ctrl+R`: Switch to git reflog view
- `Ctrl+L`: Switch to git log view
- `Ctrl+D`: Return to default view

This makes it easy to reference or reuse previous commit messages while maintaining consistency in your commit history.

