#!/bin/zsh

# Exit on error
set -e

# Constants
CONVENTIONAL_COMMITS=(
    "feat"     # New feature
    "fix"      # Bug fix
    "chore"    # Maintenance tasks
    "test"     # Adding or modifying tests
    "build"    # Build system or external dependencies
    "docs"     # Documentation changes
    "ci"       # CI configuration changes
    "refactor" # Code changes that neither bug fixes nor new features
    "perf"     # Performance improvements
    "revert"   # Reverting changes
    "style"    # Code style changes
)

# Helper function to show usage
show_usage() {
    echo "Usage: kommit"
    echo "Interactive git commit with conventional commit types"
    echo
    echo "This script helps create conventional commit messages"
    echo "by providing an interactive interface to select commit types"
    echo "and automatically adding ticket numbers from branch names."
}

# Check if help is requested
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_usage
    exit 0
fi

# Check for staged changes
staged_files=$(git diff --cached --name-only)
if [ -z "$staged_files" ]; then
    echo "Error: No staged changes found."
    echo "Please stage your changes using 'git add' before running this script."
    exit 1
fi

# Select commit type using fzf
echo "Select commit type:"
commit_type=$(printf "%s\n" "${CONVENTIONAL_COMMITS[@]}" | fzf --exact --height 40% --border --ansi)
if [ -z "$commit_type" ]; then
    echo "Error: No commit type selected."
    exit 1
fi

# Extract ticket number from branch name
# feat/ABC-123 -> ABC-123
branch_name=$(git branch --show-current)
ticket_number=$(echo "$branch_name" | gsed -n 's|^\([^/]*/\)\?\([a-zA-Z]\+-[0-9]\+\).*|\2|p')

# Construct commit message prefix
if [ -z "$ticket_number" ]; then
    commit_prefix="${commit_type}: "
else
    commit_prefix="${commit_type}(${ticket_number}): "
fi

# Prepare commit message file
commit_msg_file=$(git rev-parse --show-toplevel)/.git/COMMIT_EDITMSG
echo "$commit_prefix" > "$commit_msg_file"

# Open editor for commit message
nvim +startinsert! "$commit_msg_file"

# Commit if message is not empty
if [ -s "$commit_msg_file" ]; then
    git commit -n -F "$commit_msg_file"
    echo "Commit created successfully!"
else
    echo "Error: Commit message is empty, commit aborted."
    exit 1
fi
