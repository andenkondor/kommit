#!/bin/zsh

staged_changes=$(git diff --cached --name-only)

if [ -z "$staged_changes" ]; then
  echo "No staged changes."
  exit 1
fi

conventional_commits=("feat" "fix" "chore" "test" "build" "docs" "ci" "refactor" "perf" "revert" "style")
chosen_conventional_commit=$(printf "%s\n" "${conventional_commits[@]}" | fzf --exact --height 40% --border --ansi)
[ -z "$chosen_conventional_commit" ] && exit 1

scope=$(git rev-parse --abbrev-ref HEAD | gsed -n 's|^\([^/]*/\)\?\([a-zA-Z]\+-[0-9]\+\).*|\2|p')

if [ -z "$scope" ]
then
      full_commit_message_prefix=$chosen_conventional_commit": "
else
      full_commit_message_prefix=$chosen_conventional_commit($scope):" "
fi

commit_editmsg_file=$(git rev-parse --show-toplevel)/.git/COMMIT_EDITMSG

echo $full_commit_message_prefix > $commit_editmsg_file
nvim  +startinsert! $commit_editmsg_file
[ -s $commit_editmsg_file ] && git commit -n -F $commit_editmsg_file || echo "Commit message is empty, commit aborted."
