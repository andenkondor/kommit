#!/usr/bin/env zx

$.quiet = true;

const CONTENT_WIDTH = 60;
const KEY_WORDS_WIDTH = 75;

const FZF_DELIMITER = "\t\t";
const CONVENTIONAL_COMMITS = [
  "feat",
  "fix",
  "chore",
  "test",
  "build",
  "docs",
  "ci",
  "refactor",
  "perf",
  "revert",
  "style",
];

const TICKET_NUMBER = "{{ticketNumber}}";
const COMMIT_TYPE = "{{commitType}}";

const templates = [
  {
    content: `${COMMIT_TYPE}(${TICKET_NUMBER}): `,
    vimOptions: ["+startinsert!"],
    keywords: ["scoped"],
  },
  {
    content: `${TICKET_NUMBER} - `,
    vimOptions: ["+startinsert!"],
    keywords: ["plain"],
  },
  {
    content: `${COMMIT_TYPE}: `,
    vimOptions: ["+startinsert!"],
    keywords: ["plain"],
  },
  {
    content: `${COMMIT_TYPE}(<scope>): `,
    vimOptions: [...["-c", "norm da>"], "+startinsert"],
    keywords: ["scoped"],
  },
  {
    // https://github.com/ohmyzsh/ohmyzsh/blob/788eaa5930eeafceb0cc43f338b0bacf7a2e36a8/plugins/git/git.plugin.zsh#L365
    content: "--wip-- [skip ci]",
    keywords: ["wip"],
    always: true,
  },
];

const currentTmpFiles = [];

function createTempFile(content) {
  const filePath = tmpfile("kommit", content);
  currentTmpFiles.push(filePath);
  return filePath;
}

async function getAndVerifyStagedChanges() {
  const stagedChanges =
    await $`${["git", "diff", "--cached", "--name-status"]}`.lines();

  if (!stagedChanges?.length) {
    echo(chalk.red("no staged changes"));
    process.exit(1);
  }

  return stagedChanges;
}

async function getStaticTemplates() {
  const ticketNumber = await getTicketNumber();

  const conventionalTemplates = CONVENTIONAL_COMMITS.flatMap((cc) =>
    templates
      .filter(({ content }) => content.includes(COMMIT_TYPE))
      .map((t) => ({
        ...t,
        content: t.content.replace(COMMIT_TYPE, cc),
        keywords: [cc, ...t.keywords],
      })),
  );

  const nonConventionalTemplates = templates.filter(
    ({ content }) => !content.includes(COMMIT_TYPE),
  );

  return [...nonConventionalTemplates, ...conventionalTemplates]
    .filter(
      ({ content, always }) =>
        Boolean(ticketNumber) === content.includes(TICKET_NUMBER) || always,
    )
    .map((t) => ({
      ...t,
      content: t.content.replace(TICKET_NUMBER, ticketNumber),
      keywords: [...(t.keywords ?? [])],
    }));
}

async function getReflogTemplates() {
  return (await $`${["git", "reflog"]}`)
    .lines()
    .map((l) => {
      const match = l.match(
        /^(\w+)\s+([^\s]+):\scommit(?:\s\([^)]+\))?:\s(.*)/,
      );

      return match
        ? {
            content: match[3],
            keywords: [
              // hash
              match[1],
              // symbolic
              match[2],
            ],
          }
        : undefined;
    })
    .filter(Boolean);
}

async function getLogTemplates() {
  return (await $`git log --pretty=format:"%h|%s"`).lines().map((l) => {
    const [hash, ...messageParts] = l.split("|");

    return {
      content: messageParts[0],
      keywords: [hash],
    };
  });
}

function renderFzfLine({ id, content, keywords }, { isHeader }) {
  const truncateWithDotsAndPad = (string, length, direction) => {
    if (!string) {
      return "";
    }

    const dots = "...";
    if (string.length >= length) {
      string = string.slice(0, length - dots.length) + dots;
    }

    return direction === "left"
      ? string.padStart(length)
      : string.padEnd(length);
  };

  const contentFragment = isHeader ? "Content" : content;
  const keywordsFragment = isHeader ? "Keywords" : keywords?.join(" ");

  const fragments = [
    ...((isHeader && []) || [id]),
    truncateWithDotsAndPad(contentFragment, CONTENT_WIDTH, "right"),
    truncateWithDotsAndPad(keywordsFragment, KEY_WORDS_WIDTH, "right"),
  ];

  return fragments.join(FZF_DELIMITER);
}

async function askUserForTemplate() {
  const allTemplates = {
    static: await getStaticTemplates(),
    log: await getLogTemplates(),
    reflog: await getReflogTemplates(),
  };
  const files = {};

  Object.keys(allTemplates).forEach((type) => {
    allTemplates[type] = allTemplates[type].map((t, templateIndex) => ({
      ...t,
      id: `${type}:${templateIndex}`,
      type,
    }));

    files[type] = createTempFile(
      allTemplates[type].map(renderFzfLine).join("\n"),
    );
  });

  const chosenTemplateId = await $`cat ${files.static}`.pipe`${[
    "fzf",
    "--border",
    "--exact",
    "--highlight-line",
    "--no-ignore-case",
    "--no-sort",
    "--reverse",
    ...["--accept-nth", "1"],
    ...["--bind", `ctrl-d:reload(cat ${files.static})`],
    ...["--bind", `ctrl-l:reload(cat ${files.log})`],
    ...["--bind", `ctrl-r:reload(cat ${files.reflog})`],
    ...["--delimiter", FZF_DELIMITER],
    ...["--header", renderFzfLine({}, { isHeader: true })],
    ...["--height", "~100%"],
    ...["--nth", "2..3"],
    ...["--prompt", "=> "],
    ...["--with-nth", "2..4"],
    ...[
      "bg+:#262626",
      "bg:#121212",
      "fg+:#d0d0d0",
      "fg:#d0d0d0",
      "header:#87afaf",
      "hl+:#5fd7ff",
      "hl:#5f87af",
      "info:#afaf87",
      "marker:#87ff00",
      "pointer:#af5fff",
      "prompt:#d7005f",
      "spinner:#af5fff",
    ].flatMap((s) => ["--color", s]),
  ]}
`.text();

  return Object.values(allTemplates)
    .flatMap((t) => t)
    .find(({ id }) => id === chosenTemplateId.trim());
}

async function getPrefilText({ content }, stagedFiles) {
  const metadata = [
    "Files changed:",
    ...stagedFiles,
    "",
    ...(await $`${["git", "diff", "--staged", "--no-ext-diff"]}`).lines(),
  ]
    .map((s) => (s ? `# ${s}` : s))
    .join("\n");

  return `${content}\n\n${metadata}`;
}

async function getTicketNumber() {
  const branchName =
    argv.debug ?? (await $`${["git", "branch", "--show-current"]}`.text());
  return branchName.match(/^\w+\/((?:\w+?-)?\d+)/)?.[1];
}

async function letUserRefineMessage(content, { vimOptions = [] }) {
  const filePath = await createTempFile(content);

  const getLastModified = async () =>
    (await $`${["stat", "-f", "%m", filePath]}`).text();

  const lastModifiedBaseline = await getLastModified();

  const vimishEditor = (await which("nvim", { nothrow: true })) ?? "vim";

  await $.spawnSync(vimishEditor, [filePath, ...vimOptions], {
    stdio: "inherit",
  });

  if (lastModifiedBaseline === (await getLastModified())) {
    echo(chalk.red("file hasn't changed."));
    process.exit(1);
  }

  const fileContent = await fs.readFileSync(filePath, { encoding: "utf8" });
  const commitMessage = fileContent
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("#"))
    .join("\n");

  if (!commitMessage) {
    echo(chalk.red("empty commit message"));
    process.exit(1);
  }

  return commitMessage;
}

async function main() {
  const stagedChanges = await getAndVerifyStagedChanges();
  const chosenTemplate = await askUserForTemplate();
  const prefilText = await getPrefilText(chosenTemplate, stagedChanges);
  try {
    const commitMessage = await letUserRefineMessage(
      prefilText,
      chosenTemplate,
    );

    if (!argv.debug) {
      await $`${["git", "commit", "-n", "--message", commitMessage]}`;
    } else {
      echo(commitMessage);
    }
  } finally {
    await $`rm ${currentTmpFiles.join(" ")}`;
  }
}

await main();
