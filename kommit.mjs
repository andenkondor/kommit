#!/usr/bin/env zx

$.quiet = true;

const CONTENT_WIDTH = 60;
const TYPE_WIDTH = 20;
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
    vimOptions: [...["-c", "norm da>"], "+startinsert!"],
    keywords: ["scoped"],
  },
  {
    content: "--wip-- [skip ci]",
    type: "wip",
    always: true,
  },
];

async function getAndVerifyStagedChanges() {
  const stagedChanges = await $`git diff --cached --name-status`.lines();

  if (!stagedChanges?.length) {
    echo(chalk.red("no staged changes"));
    process.exit(1);
  }

  return stagedChanges;
}

function getPredefinedTemplates(ticketNumber) {
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
      type: t.type ?? "template",
    }));
}

async function getReflogTemplates() {
  return (await $`git reflog`)
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
            type: "reflog",
          }
        : undefined;
    })
    .filter(Boolean);
}

async function getLogTemplates() {
  return (await $`git log --pretty=format:"%h|%d|%s"`).lines().map((l) => {
    const [hash, refNames, ...messageParts] = l.split("|");

    return {
      content: messageParts[0],
      keywords: [hash, refNames.trim().replace(/^\(|\)$/g, "")],
      type: "log",
    };
  });
}

async function getTemplate(ticketNumber) {
  const allTemplates = [
    ...getPredefinedTemplates(ticketNumber),
    ...(await getLogTemplates()),
    ...(await getReflogTemplates()),
  ].map((o, index) => ({ ...o, id: index }));

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

  const renderFzfLine = ({ id, content, type, keywords }, { isHeader }) => {
    const contentFragment = isHeader ? "Content" : content;
    const typeFragment = isHeader
      ? "Type"
      : type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    const keywordsFragment = isHeader
      ? "Keywords"
      : keywords?.join(" ").toLowerCase();

    const fragments = [
      ...((isHeader && []) || [id]),
      truncateWithDotsAndPad(contentFragment, CONTENT_WIDTH, "right"),
      truncateWithDotsAndPad(typeFragment, TYPE_WIDTH, "right"),
      truncateWithDotsAndPad(keywordsFragment, KEY_WORDS_WIDTH, "right"),
    ];

    return fragments.join(FZF_DELIMITER);
  };

  const chosenTemplateId = await $({
    input: allTemplates.map(renderFzfLine).join("\n"),
  })`${[
    "fzf",
    "--accept-nth=1",
    "--border",
    "--color=fg:#d0d0d0,fg+:#d0d0d0,bg:#121212,bg+:#262626",
    "--color=hl:#5f87af,hl+:#5fd7ff,info:#afaf87,marker:#87ff00",
    "--color=prompt:#d7005f,spinner:#af5fff,pointer:#af5fff,header:#87afaf",
    "--exact",
    "--height=~100%",
    "--highlight-line",
    "--no-ignore-case",
    "--no-sort",
    "--nth=2..3",
    "--prompt=> ",
    "--reverse",
    "--with-nth=2..4",
    ...["--delimiter", FZF_DELIMITER],
    ...["--header", renderFzfLine({}, { isHeader: true })],
  ]}
`.text();

  return allTemplates.find(({ id }) => id === +chosenTemplateId);
}

async function getTemplateWithMetadata({ content }, stagedChanges) {
  const metadata = [
    "Files changed:",
    ...stagedChanges,
    "",
    ...(await $`git diff --staged --no-ext-diff`).lines(),
  ]
    .map((s) => (s ? `# ${s}` : s))
    .join("\n");

  return `${content}\n\n${metadata}`;
}

async function getTicketNumber() {
  const branchName = argv.debug ?? (await $`git branch --show-current`.text());
  return branchName.match(/^\w+\/((?:\w+?-)?\d+)/)?.[1];
}

async function createMessageFile(withContent) {
  const messageFilePath = await tmpfile("kommit", withContent);

  const cleanUpCallback = () => $`rm ${messageFilePath}`;

  return [messageFilePath, cleanUpCallback];
}

async function captureUserInput(filePath, { vimOptions = [] }) {
  const getLastModified = async () => (await $`stat -f %m ${filePath}`).text();

  const lastModifiedBaseline = await getLastModified();
  await $.spawnSync("nvim", [filePath, ...vimOptions], {
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
  const ticketNumber = await getTicketNumber();
  const template = await getTemplate(ticketNumber);
  const templateWithMetadata = await getTemplateWithMetadata(
    template,
    stagedChanges,
  );
  const [messageFilePath, cleanUpCallback] =
    await createMessageFile(templateWithMetadata);
  try {
    const commitMessage = await captureUserInput(messageFilePath, template);

    if (!argv.debug) {
      await $`git commit -n --message ${commitMessage}`;
    } else {
      echo(commitMessage);
    }
  } finally {
    await cleanUpCallback();
  }
}

await main();
