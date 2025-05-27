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
staged_changes=$(git diff --cached --name-status | sed $'s/\t/    /g')
if [ -z "$staged_changes" ]; then
    echo "Error: No staged changes found."
    echo "Please stage your changes using 'git add' before running this script."
    exit 1
fi

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

# Get the last commit message
last_commit_msg=$(git log -1 --pretty=%B)

# Create temporary file with metadata
temp_file=$(mktemp)
cat > "$temp_file" << EOF
$commit_prefix

# --- Metadata ---
# Current branch:
# $branch_name
# Last commit message:
# $last_commit_msg
#
# Changes:
# $staged_changes
EOF

# Open editor for commit message
nvim +startinsert! "$temp_file"

# Check if message is empty (only contains the prefix)
if [ "$(gsed -n '1p' "$temp_file")" = "$commit_prefix" ]; then
    echo "Error: Commit message is empty, commit aborted."
    rm "$temp_file"
    exit 1
fi

# Extract just the commit message (everything before the metadata separator)
commit_msg=$(gsed -n '1,/^# --- Metadata/p' "$temp_file" | gsed '$d')

# Write to actual commit message file
commit_msg_file=$(git rev-parse --show-toplevel)/.git/COMMIT_EDITMSG
echo "$commit_msg" > "$commit_msg_file"

# Clean up temp file
rm "$temp_file"

# Commit
git commit -n -F "$commit_msg_file"
echo "Commit created successfully!"
