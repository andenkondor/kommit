#!/usr/bin/env zx

$.quiet = true;

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

const templates = [
  {
    content: "{{commitType}}({{ticketNumber}}): ",
    vimOptions: ["+startinsert!"],
    keywords: ["scoped"],
  },
  {
    content: "{{ticketNumber}} - ",
    vimOptions: ["+startinsert!"],
    keywords: ["plain"],
  },
  {
    content: "{{commitType}}: ",
    vimOptions: ["+startinsert!"],
    keywords: ["plain"],
  },
  {
    content: "{{commitType}}(<scope>): ",
    vimOptions: [...["-c", "norm da>"], "+startinsert"],
    keywords: ["scoped"],
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

async function getTemplate(ticketNumber) {
  const typedTemplates = CONVENTIONAL_COMMITS.flatMap((cc) =>
    templates
      .filter(({ content }) => content.includes("{{commitType}}"))
      .map((t) => ({
        ...t,
        content: t.content.replace("{{commitType}}", cc),
        keywords: t.keywords ? [...t.keywords, cc] : [cc],
      })),
  );

  const untypedTemplates = templates.filter(
    ({ content }) => !content.includes("{{commitType}}"),
  );

  const allTemplates = [...untypedTemplates, ...typedTemplates]
    .filter(
      ({ content }) =>
        Boolean(ticketNumber) === content.includes("{{ticketNumber}}"),
    )
    .map((t) => ({
      ...t,
      content: t.content.replace("{{ticketNumber}}", ticketNumber),
    }))
    .map((o, index) => ({ ...o, id: index }));

  const renderFzfLine = ({ id, content, keywords }) => {
    return `${id}${FZF_DELIMITER}${content.padEnd(20)}${FZF_DELIMITER}${keywords?.join(" ").padEnd(50 + content.padEnd(20).length)}`;
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
    "--nth=2",
    "--prompt=> ",
    "--reverse",
    "--with-nth=2..3",
    ...["--delimiter", FZF_DELIMITER],
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
    .map((s) => (Boolean(s) ? `# ${s}` : s))
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

async function captureUserInput(filePath, { vimOptions }) {
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
    .filter((l) => Boolean(l))
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

    if (!Boolean(argv.debug)) {
      await $`git commit -n --message ${commitMessage}`;
    } else {
      echo(commitMessage);
    }
  } finally {
    await cleanUpCallback();
  }
}

await main();
