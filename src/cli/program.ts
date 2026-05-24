import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { getSettings, saveSettings } from "@/server/config/settings-store";
import { ensureDatabaseMigrations } from "@/server/db/migrations";
import {
  parseYoutubeCookiesText,
  validateYoutubeCookiesFile,
  validateYoutubeCookiesText,
  type CookieInputFormat,
  type YoutubeCookieValidation
} from "@/server/media/youtube-cookies";
import type { YoutubeLiveReadiness, YoutubeLiveProbeStep } from "@/server/media/ytdlp";
import { registerPipelineJobs } from "@/server/pipeline/register";
import { configPath, createUploadId, ensureStorageLayout, uploadPath } from "@/server/storage/paths";
import { writePrivateTextFile } from "@/server/storage/private-file";
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDER_TASKS,
  buildProviderConfig,
  normalizeOpenAICompatibleBaseUrl,
  providerSupportsCapability,
  type AIProviderTask
} from "@/shared/constants/ai-providers";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";
import { campaignBatchConfigSchema, campaignContentTypeSchema } from "@/shared/schemas/campaign";
import { sourceTypeSchema } from "@/shared/schemas/primitives";
import { sessionConfigSchema } from "@/shared/schemas/session";
import { aiProviderConfigSchema, type AIProviderConfig, type AppSettings } from "@/shared/schemas/settings";
import type { CliRuntime } from "./runtime";
import {
  buildCustomAISettings,
  buildTaskProviderAISettings,
  getProviderChoicesForTask,
  buildSingleProviderAISettings,
  isSetupProviderChoice,
  isTaskProviderChoice,
  type SetupProviderChoice
} from "./setup-config";
import { formatMissingPathMessage, resolveUserPath } from "./path-utils";
import {
  badge,
  brand,
  cliBanner,
  command as commandText,
  danger,
  dim,
  info,
  keyValue,
  nextSteps,
  pathText,
  section,
  shouldUseColor,
  shortId,
  table,
} from "./ui";

type CliContext = {
  args: string[];
  runtime: CliRuntime;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  yes: boolean;
  color: boolean;
  caller: ReturnType<typeof appRouter.createCaller>;
};

type ParsedGlobalOptions = {
  args: string[];
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  yes: boolean;
  noColor: boolean;
  color: boolean;
};

type ParsedOptions = {
  positionals: string[];
  options: Record<string, string | boolean | string[]>;
};

type CliIssueRow = { severity: string; area: string; message: string };
type CliHighlightRow = { title: string; startTime: number; endTime: number; status: string };
type CliClipRow = { title: string; status: string; masterPath: string | null };
type CliJobRow = { id: string; status: string; progress: number; sessionId: string };
type CliJobEventRow = { id: string; message: string };
type CliWatchedJobRow = {
  id: string;
  status: string;
  progress: number;
  events: CliJobEventRow[];
  errorJson?: string | null;
};
type CliSessionJobRow = { id: string; status: string; progress: number };
type CliSessionWithJobsRow = { id: string; jobs: CliSessionJobRow[] };
type CliCampaignListRow = { id: string; name: string; channelUrl: string | null; videos: unknown[] };
type CliSessionListRow = {
  id: string;
  status: string;
  stage: string;
  highlights: unknown[];
  clips: unknown[];
  sourceTitle: string | null;
  sourceUrl: string | null;
};
type CliCampaignStartRow = { queuedCount: number; skippedCount: number; sessionIds: string[] };
type CliPreflightIssueRow = { message: string };
type CliPreflightReportRow = {
  ok: boolean;
  blockers: CliPreflightIssueRow[];
  warnings: CliPreflightIssueRow[];
};

const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "cancelled", "interrupted"]);
const DEFAULT_AI_CONFIG_FILE = "paunclip.ai.local.json";
const taskMap = {
  "highlight-finder": "highlightFinder",
  "caption-maker": "captionMaker",
  "hook-maker": "hookMaker",
  "youtube-title-maker": "youtubeTitleMaker"
} as const;

const aiConfigFileSchema = z.object({
  version: z.literal(1).default(1),
  aiProviders: z.object({
    highlightFinder: aiProviderConfigSchema.optional(),
    captionMaker: aiProviderConfigSchema.optional(),
    hookMaker: aiProviderConfigSchema.optional(),
    youtubeTitleMaker: aiProviderConfigSchema.optional()
  })
});

type AIConfigFile = z.infer<typeof aiConfigFileSchema>;

export async function runCli(argv: string[], runtime: CliRuntime) {
  const globals = parseGlobalOptions(argv);

  try {
    await ensureDatabaseMigrations();
    registerPipelineJobs();
    const caller = appRouter.createCaller(await createTRPCContext());
    const context: CliContext = {
      args: globals.args,
      runtime,
      json: globals.json,
      quiet: globals.quiet,
      verbose: globals.verbose,
      yes: globals.yes,
      color: globals.color,
      caller
    };

    await dispatch(context);
    return 0;
  } catch (error) {
    return handleError(error, globals);
  }
}

async function dispatch(context: CliContext) {
  const [command, subcommand, ...rest] = context.args;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printRootHelp(context);
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    output(context, { version: await getPackageVersion() }, `${brand(context.color, "PaunClip")} ${await getPackageVersion()}`);
    return;
  }

  if (command === "doctor") {
    await commandDoctor(context, [subcommand, ...rest].filter(Boolean));
    return;
  }

  if (command === "setup") {
    await commandSetup(context, subcommand, rest);
    return;
  }

  if (command === "create") {
    if (subcommand === "clips") {
      await commandCreateClips(context, rest);
      return;
    }
    if (subcommand === "campaign") {
      await commandCreateCampaign(context, rest);
      return;
    }
    throw new CliInputError("Unknown create command. Try `paunclip create --help`.");
  }

  if (command === "render") {
    await commandRender(context, [subcommand, ...rest].filter(Boolean));
    return;
  }

  if (command === "campaign") {
    await commandCampaign(context, subcommand, rest);
    return;
  }

  if (command === "sessions") {
    await commandSessions(context, subcommand, rest);
    return;
  }

  if (command === "session") {
    await commandSession(context, subcommand, rest);
    return;
  }

  if (command === "jobs") {
    await commandJobs(context, subcommand, rest);
    return;
  }

  if (command === "job") {
    await commandJob(context, subcommand, rest);
    return;
  }

  if (command === "config") {
    await commandConfig(context, subcommand, rest);
    return;
  }

  throw new CliInputError(`Unknown command: ${command}. Try \`paunclip --help\`.`);
}

async function commandDoctor(context: CliContext, argv: string[]) {
  if (hasHelp(argv)) {
    printDoctorHelp(context);
    return;
  }
  const parsed = parseOptions(argv);
  const youtubeUrl = stringOption(parsed, "youtube-url", "") || stringOption(parsed, "url", "");
  const [runtime, health, preflight] = await Promise.all([
    context.caller.settings.runtimeInfo(),
    context.caller.settings.health(),
    context.caller.settings.preflight({
      sourceType: "youtube",
      operation: "create",
      config: sessionConfigSchema.parse({}),
      hasTranscript: false
    })
  ]);
  const youtubeReadiness = youtubeUrl
    ? await context.caller.settings.youtubeReadiness({ url: youtubeUrl })
    : undefined;

  output(
    context,
    { runtime, health, preflight, youtubeReadiness },
    formatDoctorReport(context, runtime, health, preflight, youtubeReadiness)
  );
}

async function commandSetup(context: CliContext, subcommand: string | undefined, argv: string[]) {
  if (!subcommand || subcommand === "all") {
    if (hasHelp(argv)) {
      printSetupHelp(context);
      return;
    }
    await runSetupWizard(context);
    return;
  }

  if (hasHelp([subcommand, ...argv])) {
    printSetupHelp(context);
    return;
  }

  const parsed = parseOptions(argv);
  if (subcommand === "ai") {
    await setupAI(context, parsed, { interactiveLabel: true });
    return;
  }
  if (subcommand === "cookies") {
    if (parsed.positionals[0] === "validate-live") {
      await setupCookiesValidateLive(
        context,
        parsed.positionals[1] || stringOption(parsed, "youtube-url", "") || stringOption(parsed, "url", "")
      );
      return;
    }
    await setupCookies(context, parsed, { askFirst: false });
    return;
  }
  if (subcommand === "output") {
    await setupOutput(context, parsed);
    return;
  }
  if (subcommand === "check") {
    await commandDoctor(context, argv);
    return;
  }

  throw new CliInputError(`Unknown setup command: ${subcommand}. Try \`paunclip setup --help\`.`);
}

async function runSetupWizard(context: CliContext) {
  ensureInteractive(context, "Run `paunclip setup ai --provider groq --api-key-env GROQ_API_KEY --yes` for non-interactive setup.");
  if (context.json) {
    throw new CliInputError("Interactive setup cannot use --json. Try `paunclip setup check --json`.");
  }

  const [runtime, health] = await Promise.all([
    context.caller.settings.runtimeInfo(),
    context.caller.settings.health()
  ]);

  console.error(
    [
      cliBanner(context.color),
      dim(context.color, "Guided setup for AI providers, YouTube cookies, output folders, and readiness."),
      "",
      section(context.color, "Profile"),
      keyValue(context.color, "Profile", pathText(context.color, context.runtime.profilePath)),
      keyValue(context.color, "Storage", pathText(context.color, runtime.storageRoot)),
      keyValue(context.color, "Output", pathText(context.color, runtime.outputDirectory)),
      keyValue(context.color, "Database", pathText(context.color, runtime.databasePath)),
      "",
      section(context.color, "Current Status"),
      keyValue(context.color, "FFmpeg", health.tools.ffmpeg.ok ? badge(context.color, "ready") : badge(context.color, "missing")),
      keyValue(context.color, "FFprobe", health.tools.ffprobe.ok ? badge(context.color, "ready") : badge(context.color, "missing")),
      keyValue(context.color, "yt-dlp", health.tools.ytdlp.ok ? badge(context.color, "ready") : badge(context.color, "missing")),
      keyValue(context.color, "Cookies", health.cookies.ok ? badge(context.color, "ready") : badge(context.color, health.cookies.severity)),
      ""
    ].join("\n")
  );

  if (await promptConfirm(context, "Set up AI provider now?", true)) {
    await setupAI(context, { positionals: [], options: {} }, { interactiveLabel: false });
  }
  await setupCookies(context, { positionals: [], options: {} }, { askFirst: true });
  await setupOutput(context, { positionals: [], options: {} });

  console.error("");
  await commandDoctor(context, []);
  console.error("");
  console.error(nextSteps(context.color, [
    'paunclip create clips "https://youtube.com/watch?v=..." --clips 3',
    'paunclip create campaign "My Campaign" "https://youtube.com/@channel"'
  ]));
}

async function setupAI(
  context: CliContext,
  parsed: ParsedOptions,
  options: { interactiveLabel: boolean }
) {
  const action = parsed.positionals[0];
  if (!action) {
    if (
      hasOption(parsed, "provider") ||
      hasOption(parsed, "api-key") ||
      hasOption(parsed, "api-key-env") ||
      hasOption(parsed, "base-url") ||
      hasOption(parsed, "model") ||
      context.yes
    ) {
      await setupAIQuick(context, parsed, options);
      return;
    }
    await setupAIDashboard(context, options);
    return;
  }

  if (action === "quick") {
    await setupAIQuick(
      context,
      { positionals: parsed.positionals.slice(1), options: parsed.options },
      options
    );
    return;
  }

  if (action === "task") {
    await setupAITask(context, parsed, parsed.positionals[1], options);
    return;
  }

  if (action === "validate") {
    await setupAIValidate(context, parsed.positionals[1]);
    return;
  }

  throw new CliInputError("Usage: paunclip setup ai [task|quick|validate]");
}

async function setupAIDashboard(
  context: CliContext,
  options: { interactiveLabel: boolean }
) {
  ensureInteractive(context, "Run `paunclip setup ai quick --provider groq --api-key-env GROQ_API_KEY --yes` for non-interactive setup.");
  const settings = await getSettings();
  console.error(
    [
      options.interactiveLabel ? cliBanner(context.color) : "",
      section(context.color, "AI Setup"),
      "Choose one task to configure. JSON config is still available as advanced mode.",
      "",
      formatCurrentAITaskSummary(context, settings),
      ""
    ].filter(Boolean).join("\n")
  );

  const action = await promptSelect(
    context,
    "What do you want to configure?",
    [
      { value: "task:highlightFinder", label: "Highlight Finder", description: "Chat model that finds moments." },
      { value: "task:captionMaker", label: "Caption Maker", description: "Audio transcription model." },
      { value: "task:hookMaker", label: "Hook Maker", description: "TTS model and voice." },
      { value: "task:youtubeTitleMaker", label: "YouTube Title Maker", description: "Chat model for titles." },
      { value: "quick", label: "Recommended quick setup", description: "Use Groq/OpenAI defaults for all tasks." },
      { value: "validate", label: "Validate all", description: "Check current provider/model/key readiness." },
      { value: "exit", label: "Exit", description: "Leave AI settings unchanged." }
    ],
    "task:highlightFinder"
  );

  if (action.startsWith("task:")) {
    await setupAITask(context, { positionals: [], options: {} }, action.slice("task:".length), options);
    return;
  }
  if (action === "quick") {
    await setupAIQuick(context, { positionals: [], options: {} }, options);
    return;
  }
  if (action === "validate") {
    await setupAIValidate(context);
    return;
  }
  output(context, { skipped: true }, "AI setup unchanged.");
}

async function setupAIQuick(
  context: CliContext,
  parsed: ParsedOptions,
  options: { interactiveLabel: boolean }
) {
  const provider = await resolveSetupProvider(context, parsed);
  if (provider === "skip") {
    output(context, { skipped: true }, "AI setup skipped. Run `paunclip setup ai` when you are ready.");
    return;
  }

  const current = await getSettings();
  const apiKey = await resolveSetupApiKey(context, parsed, provider);
  let result: ReturnType<typeof buildSingleProviderAISettings> | ReturnType<typeof buildCustomAISettings>;

  if (provider === "groq" || provider === "openai") {
    result = buildSingleProviderAISettings(current, { provider, apiKey });
  } else {
    const customInput = await resolveCustomProviderInput(context, parsed, apiKey);
    result = buildCustomAISettings(current, customInput);
  }

  const shouldValidate = !hasOption(parsed, "skip-validate");
  const validation = shouldValidate
    ? await validateAIProviderEntries(context, result.settings, result.configuredTasks)
    : [];
  const failed = validation.filter((item) => !item.ok);

  if (failed.length > 0) {
    const rendered = formatAIValidation(context, validation);
    if (!context.json && !context.quiet) {
      console.error(rendered);
    }
    const canSaveAnyway = process.stdin.isTTY && !context.yes
      ? await promptConfirm(context, "Validation failed. Save these settings anyway and fix later?", false)
      : false;
    if (!canSaveAnyway) {
      throw new CliInputError(
        `AI setup validation failed. ${failed.map((item) => `${item.task}: ${item.message}`).join(" ")}`
      );
    }
  }

  const saved = await saveSettings(result.settings);
  const text = [
    options.interactiveLabel ? cliBanner(context.color) : "",
    section(context.color, "AI Provider Setup"),
    `Provider configured: ${providerLabel(provider)}`,
    formatAITaskSummary(context, saved, result.configuredTasks, result.skippedTasks),
    validation.length ? "" : dim(context.color, "Validation skipped. Run `paunclip setup check` when you are ready."),
    validation.length ? formatAIValidation(context, validation) : ""
  ].filter(Boolean).join("\n");

  output(
    context,
    {
      aiProviders: maskSettingsForCli(saved).aiProviders,
      configuredTasks: result.configuredTasks,
      skippedTasks: result.skippedTasks,
      validation
    },
    text
  );
}

async function setupAITask(
  context: CliContext,
  parsed: ParsedOptions,
  taskInput: string | undefined,
  options: { interactiveLabel: boolean }
) {
  const task = normalizeTask(taskInput);
  const current = await getSettings();
  const previous = current.aiProviders[task];
  const provider = await resolveTaskSetupProvider(context, parsed, task);
  const baseUrl = provider === "custom" ? await resolveTaskBaseUrl(context, parsed, task) : undefined;
  const defaults = buildProviderConfig(provider, task, {
    ...previous,
    baseUrl: baseUrl || previous.baseUrl
  });
  const apiKey = await resolveSetupApiKey(context, parsed, provider);
  const model =
    stringOption(parsed, "model", "") ||
    defaults.model ||
    (context.yes ? "" : await promptText(context, `${taskLabel(task)} model`, defaults.model));
  if (!model) {
    throw new CliInputError(`${taskLabel(task)} model is empty.`);
  }

  const voice =
    task === "hookMaker"
      ? stringOption(parsed, "voice", "") ||
        defaults.ttsVoice ||
        (context.yes ? "" : await promptText(context, "Hook Maker voice", defaults.ttsVoice ?? ""))
      : undefined;

  if (task === "hookMaker" && !voice) {
    throw new CliInputError("Hook Maker voice is empty. Use --voice or run the interactive wizard.");
  }

  const result = buildTaskProviderAISettings(current, {
    task,
    provider,
    apiKey,
    model,
    baseUrl,
    ttsVoice: voice,
    ttsFormat: stringOption(parsed, "format", defaults.ttsFormat ?? "mp3") as AIProviderConfig["ttsFormat"]
  });

  const shouldValidate = !hasOption(parsed, "skip-validate");
  const validation = shouldValidate ? await validateAIProviderEntries(context, result.settings, [task]) : [];
  const failed = validation.filter((item) => !item.ok);
  if (failed.length > 0) {
    if (!context.json && !context.quiet) {
      console.error(formatAIValidation(context, validation));
    }
    throw new CliInputError(
      `AI task validation failed. ${failed.map((item) => `${item.task}: ${item.message}`).join(" ")}`
    );
  }

  const saved = await saveSettings(result.settings);
  output(
    context,
    {
      task,
      aiProviders: maskSettingsForCli(saved).aiProviders,
      validation
    },
    [
      options.interactiveLabel ? cliBanner(context.color) : "",
      section(context.color, `${taskLabel(task)} Setup`),
      `${taskLabel(task)} configured with ${providerLabel(provider)}.`,
      formatAITaskSummary(context, saved, [task], []),
      validation.length ? formatAIValidation(context, validation) : dim(context.color, "Validation skipped.")
    ].filter(Boolean).join("\n")
  );
}

async function setupAIValidate(context: CliContext, taskInput?: string) {
  const settings = await getSettings();
  const tasks = taskInput ? [normalizeTask(taskInput)] : [...AI_PROVIDER_TASKS];
  const validation = await validateAIProviderEntries(context, settings, tasks);
  output(context, { validation }, formatAIValidation(context, validation));
}

async function setupCookies(
  context: CliContext,
  parsed: ParsedOptions,
  options: { askFirst: boolean }
) {
  let file = stringOption(parsed, "path", "");
  if (!file && parsed.positionals[0]) {
    file = parsed.positionals[0];
  }

  if (!file) {
    ensureInteractive(context, "Run `paunclip setup cookies --path ./cookies.txt --yes` for non-interactive setup.");
    if (options.askFirst) {
      const wantsCookies = await promptConfirm(context, "Add YouTube cookies now?", false);
      if (!wantsCookies) {
        output(context, { skipped: true }, "Cookies setup skipped. You can add them later with `paunclip setup cookies`.");
        return;
      }
    }
    file = await promptText(context, "Cookie file path", "");
  }

  if (!file.trim()) {
    output(context, { skipped: true }, "Cookies setup skipped.");
    return;
  }

  const result = await saveCookieFileReferenceOrConversion(file.trim());
  output(
    context,
    result,
    [
      result.converted
        ? `Cookies converted to private Netscape file: ${pathText(context.color, result.cookies.youtubePath ?? result.storedPath)}`
        : `Cookies linked from: ${pathText(context.color, result.cookies.youtubePath ?? result.storedPath)}`,
      formatCookieValidation(context, result.originalPath, result.validation)
    ].join("\n")
  );
}

async function setupCookiesValidateLive(context: CliContext, youtubeUrl: string) {
  if (!youtubeUrl.trim()) {
    throw new CliInputError("Usage: paunclip setup cookies validate-live <youtube-url>");
  }
  const settings = await getSettings();
  if (!settings.cookies.youtubePath) {
    throw new CliInputError("YouTube cookies are not configured. Run `paunclip setup cookies` first.");
  }
  const staticValidation = await validateYoutubeCookiesFile(settings.cookies.youtubePath);
  const readiness = await context.caller.settings.youtubeReadiness({ url: youtubeUrl.trim() });
  output(
    context,
    { staticValidation, readiness },
    [
      formatCookieValidation(context, settings.cookies.youtubePath, staticValidation),
      "",
      formatYoutubeLiveReadiness(context, readiness)
    ].join("\n")
  );
}

async function setupOutput(context: CliContext, parsed: ParsedOptions) {
  let target = stringOption(parsed, "path", "");
  if (!target && parsed.positionals[0]) {
    target = parsed.positionals[0];
  }

  const runtime = await context.caller.settings.runtimeInfo();
  if (!target) {
    ensureInteractive(context, "Run `paunclip setup output --path ./output --yes` for non-interactive setup.");
    console.error(keyValue(context.color, "Current output", pathText(context.color, runtime.outputDirectory)));
    const keep = await promptConfirm(context, "Keep this output folder?", true);
    if (keep) {
      output(context, { outputDirectory: runtime.outputDirectory }, `Output folder kept: ${runtime.outputDirectory}`);
      return;
    }
    target = await promptText(context, "New output folder", runtime.outputDirectory);
  }

  const settings = await context.caller.settings.updateOutputDirectory(target);
  const nextRuntime = await context.caller.settings.runtimeInfo();
  output(
    context,
    { outputDirectory: settings.outputDirectory, resolvedOutputDirectory: nextRuntime.outputDirectory },
    [
      section(context.color, "Output Folder"),
      keyValue(context.color, "Saved", pathText(context.color, settings.outputDirectory)),
      keyValue(context.color, "Resolved", pathText(context.color, nextRuntime.outputDirectory))
    ].join("\n")
  );
}

async function commandCreateClips(context: CliContext, argv: string[]) {
  if (hasHelp(argv)) {
    printCreateClipsHelp(context);
    return;
  }
  const parsed = parseOptions(argv);
  const source = parsed.positionals[0];
  if (!source) {
    throw new CliInputError("Missing source. Usage: paunclip create clips <youtube-url|video-path>");
  }

  const isYoutube = /^https?:\/\//i.test(source);
  const config = sessionConfigSchema.parse({
    targetClipCount: numberOption(parsed, "clips", 3),
    prompt: stringOption(parsed, "prompt", await readPromptFile(parsed)),
    language: stringOption(parsed, "language", "id"),
    captionStyleId: stringOption(parsed, "caption-style", "karaoke"),
    clipLength: stringOption(parsed, "clip-length", "auto"),
    contentPreset: stringOption(parsed, "content-preset", "auto"),
    reframeMode: stringOption(parsed, "reframe", "auto_fast"),
    autoHook: booleanPair(parsed, "hook", "no-hook", true),
    renderMode: hasOption(parsed, "auto-render") ? "auto" : "review",
    processingStart: parseTimeOption(parsed, "processing-start", 0),
    processingEnd: parseOptionalTimeOption(parsed, "processing-end"),
    manualTranscriptSrt: await readOptionalFile(parsed, "srt"),
    promptMode: "single_video"
  });
  const sourceType = sourceTypeSchema.parse(isYoutube ? "youtube" : "upload");
  await assertCliPreflight(context, {
    sourceType,
    operation: "create",
    config,
    hasTranscript: Boolean(config.manualTranscriptSrt)
  });

  const input = isYoutube
    ? {
        sourceType,
        sourceUrl: source,
        config
      }
    : {
        sourceType,
        uploadId: await importLocalVideo(source),
        config
      };

  const result = await context.caller.session.create(input);
  const queueOnly = hasOption(parsed, "queue");
  if (!queueOnly) {
    await waitForJob(context, result.job.id);
  }
  const session = await context.caller.session.getById(result.session.id);

  output(
    context,
    {
      type: "session_created",
      sessionId: result.session.id,
      jobId: result.job.id,
      status: session?.status,
      stage: session?.stage,
      next: [`paunclip render ${result.session.id} --all`]
    },
    formatSessionSummary(context, session, [`paunclip render ${result.session.id} --all`])
  );
}

async function commandRender(context: CliContext, argv: string[]) {
  if (hasHelp(argv)) {
    printRenderHelp(context);
    return;
  }
  const parsed = parseOptions(argv);
  const sessionId = parsed.positionals[0];
  if (!sessionId) {
    throw new CliInputError("Missing session id. Usage: paunclip render <sessionId>");
  }
  const session = await context.caller.session.getById(sessionId);
  if (!session) {
    throw new CliInputError(`Session not found: ${sessionId}`);
  }
  await assertCliPreflight(context, {
    sourceType: sourceTypeSchema.parse(session.sourceType),
    operation: "render",
    config: sessionConfigSchema.parse(session.config),
    hasTranscript: Boolean(session.transcriptJson)
  });

  const highlightIds = resolveHighlightSelection(session.highlights, parsed);
  const result = await context.caller.session.renderSelected({
    sessionId,
    ...(highlightIds ? { highlightIds } : {})
  });
  if (!hasOption(parsed, "queue")) {
    await waitForJob(context, result.job.id);
  }
  const updated = await context.caller.session.getById(sessionId);
  output(
    context,
    {
      type: "render_started",
      sessionId,
      jobId: result.job.id,
      status: updated?.status,
      clips: updated?.clips ?? []
    },
    formatSessionSummary(context, updated)
  );
}

async function commandCreateCampaign(context: CliContext, argv: string[]) {
  if (hasHelp(argv)) {
    printCreateCampaignHelp(context);
    return;
  }
  const parsed = parseOptions(argv);
  const name = parsed.positionals[0];
  const channelUrl = parsed.positionals[1];
  if (!name || !channelUrl) {
    throw new CliInputError("Usage: paunclip create campaign <name> <youtube-channel-or-playlist>");
  }

  const campaign = await context.caller.campaign.create({
    name,
    channelUrl,
    config: sessionConfigSchema.parse({
      targetClipCount: numberOption(parsed, "clips", 3),
      prompt: stringOption(parsed, "prompt", ""),
      language: stringOption(parsed, "language", "id"),
      captionStyleId: stringOption(parsed, "caption-style", "karaoke"),
      clipLength: stringOption(parsed, "clip-length", "auto"),
      autoHook: booleanPair(parsed, "hook", "no-hook", true),
      promptMode: "campaign_batch"
    })
  });

  const fetchLimit = optionalNumberOption(parsed, "fetch");
  let fetched = null;
  if (fetchLimit) {
    fetched = await context.caller.campaign.fetchVideos({
      campaignId: campaign.id,
      limit: fetchLimit,
      contentType: campaignContentTypeSchema.parse(stringOption(parsed, "type", "videos"))
    });
  }

  output(
    context,
    {
      type: "campaign_created",
      campaignId: campaign.id,
      fetchedCount: fetched?.videos.length ?? 0,
      next: [
        `paunclip campaign fetch ${campaign.id} --limit 20`,
        `paunclip campaign videos ${campaign.id}`,
        `paunclip campaign start ${campaign.id} --videos 1,2,3 --clips 3`
      ]
    },
    [
      `Campaign created: ${campaign.name}`,
      `ID: ${campaign.id}`,
      fetched ? `Fetched videos: ${fetched.videos.length}` : "Fetched videos: 0",
      `Next: paunclip campaign fetch ${campaign.id} --limit 20`
    ].join("\n")
  );
}

async function commandCampaign(context: CliContext, subcommand: string | undefined, argv: string[]) {
  if (!subcommand || hasHelp([subcommand, ...argv])) {
    printCampaignHelp(context);
    return;
  }
  const parsed = parseOptions(argv);

  if (subcommand === "list") {
    const campaigns = await context.caller.campaign.list();
    output(
      context,
      { campaigns },
      formatCampaignList(context, campaigns)
    );
    return;
  }

  if (subcommand === "show") {
    const campaign = await requireCampaign(context, parsed.positionals[0]);
    output(context, { campaign }, formatCampaign(context, campaign));
    return;
  }

  if (subcommand === "fetch") {
    const campaignId = parsed.positionals[0];
    if (!campaignId) throw new CliInputError("Usage: paunclip campaign fetch <campaignId>");
    const campaign = await context.caller.campaign.fetchVideos({
      campaignId,
      limit: numberOption(parsed, "limit", numberOption(parsed, "fetch", 10)),
      contentType: campaignContentTypeSchema.parse(stringOption(parsed, "type", "videos"))
    });
    output(context, { campaign }, `Fetched ${campaign?.videos.length ?? 0} videos.`);
    return;
  }

  if (subcommand === "videos") {
    const campaign = await requireCampaign(context, parsed.positionals[0]);
    output(context, { videos: campaign.videos }, formatCampaignVideos(context, campaign.videos));
    return;
  }

  if (subcommand === "start") {
    const campaignId = parsed.positionals[0];
    if (!campaignId) throw new CliInputError("Usage: paunclip campaign start <campaignId> --videos 1,2,3");
    const campaign = await requireCampaign(context, campaignId);
    const videoIds = resolveCampaignVideoSelection(campaign.videos, stringOption(parsed, "videos", ""));
    const clipsPerVideo = numberOption(parsed, "clips", 3);
    const batchConfig = campaignBatchConfigSchema.partial().parse({
      clipsPerVideo,
      prompt: stringOption(parsed, "prompt", ""),
      language: stringOption(parsed, "language", "id"),
      captionStyleId: stringOption(parsed, "caption-style", "karaoke"),
      clipLength: stringOption(parsed, "clip-length", "auto"),
      autoHook: booleanPair(parsed, "hook", "no-hook", true),
      renderMode: hasOption(parsed, "auto-render") ? "auto" : "review"
    });
    await assertCliPreflight(context, {
      sourceType: "youtube",
      operation: "campaign",
      config: sessionConfigSchema.parse({
        targetClipCount: batchConfig.clipsPerVideo,
        prompt: batchConfig.prompt,
        language: batchConfig.language,
        captionStyleId: batchConfig.captionStyleId,
        clipLength: batchConfig.clipLength,
        autoHook: batchConfig.autoHook,
        renderMode: batchConfig.renderMode,
        contentPreset: batchConfig.contentPreset,
        reframeMode: batchConfig.reframeMode,
        promptMode: "campaign_batch"
      }),
      hasTranscript: false
    });
    const result = await context.caller.campaign.startBatch({
      campaignId,
      videoIds,
      perVideoClipCounts: parsePerVideoClipCounts(parsed),
      batchConfig
    });
    if (!hasOption(parsed, "queue")) {
      for (const job of result.jobs) {
        await waitForJob(context, job.job.id);
      }
    }
    output(
      context,
      result,
      formatCampaignStartResult(context, result)
    );
    return;
  }

  if (subcommand === "watch") {
    const campaign = await requireCampaign(context, parsed.positionals[0]);
    output(context, { campaign }, formatCampaign(context, campaign));
    return;
  }

  throw new CliInputError(`Unknown campaign command: ${subcommand}`);
}

async function commandSessions(context: CliContext, subcommand: string | undefined, argv: string[]) {
  if (!subcommand || subcommand === "list") {
    const sessions = await context.caller.session.list();
    output(
      context,
      { sessions },
      formatSessionList(context, sessions)
    );
    return;
  }
  if (hasHelp([subcommand, ...argv])) {
    printSessionHelp(context);
    return;
  }
  throw new CliInputError(`Unknown sessions command: ${subcommand}`);
}

async function commandSession(context: CliContext, subcommand: string | undefined, argv: string[]) {
  if (!subcommand || hasHelp([subcommand, ...argv])) {
    printSessionHelp(context);
    return;
  }
  const parsed = parseOptions(argv);
  const sessionId = parsed.positionals[0];
  if (!sessionId) throw new CliInputError(`Usage: paunclip session ${subcommand} <sessionId>`);

  if (subcommand === "show") {
    const session = await context.caller.session.getById(sessionId);
    output(context, { session }, formatSessionSummary(context, session));
    return;
  }

  if (subcommand === "logs") {
    const session = await context.caller.session.getById(sessionId);
    type SessionLogEvent = { createdAt: Date; type: string; message: string };
    type SessionLogJob = { id: string; events: SessionLogEvent[] };
    type SessionLogOutputEvent = SessionLogEvent & { jobId: string };
    const jobs = session?.jobs as SessionLogJob[] | undefined;
    const events: SessionLogOutputEvent[] =
      jobs?.flatMap((job: SessionLogJob) =>
        job.events.map((event: SessionLogEvent) => ({ ...event, jobId: job.id }))
      ) ?? [];
    output(
      context,
      { events },
      events
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((event) => `${event.createdAt.toISOString()} [${event.type}] ${event.message}`)
        .join("\n") || "No logs."
    );
    return;
  }

  if (subcommand === "retry") {
    const result = await context.caller.session.retry(sessionId);
    await waitForJob(context, result.job.id);
    output(context, result, `Retried session ${sessionId}`);
    return;
  }

  if (subcommand === "cancel") {
    const session = await context.caller.session.getById(sessionId);
    const latest = session?.jobs[0];
    if (!latest) throw new CliInputError("Session has no job to cancel.");
    const job = await context.caller.job.cancel(latest.id);
    output(context, { job }, `Cancelled job ${job.id}`);
    return;
  }

  throw new CliInputError(`Unknown session command: ${subcommand}`);
}

async function commandJobs(context: CliContext, subcommand: string | undefined, argv: string[]) {
  if (!subcommand || subcommand === "list") {
    const sessions = (await context.caller.session.list()) as CliSessionWithJobsRow[];
    const jobs: CliJobRow[] = sessions.flatMap((session) =>
      session.jobs.map((job) => ({ ...job, sessionId: session.id }))
    );
    output(
      context,
      { jobs },
      formatJobList(context, jobs)
    );
    return;
  }
  if (hasHelp([subcommand, ...argv])) {
    printJobHelp(context);
    return;
  }
  throw new CliInputError(`Unknown jobs command: ${subcommand}`);
}

async function commandJob(context: CliContext, subcommand: string | undefined, argv: string[]) {
  if (!subcommand || hasHelp([subcommand, ...argv])) {
    printJobHelp(context);
    return;
  }
  const parsed = parseOptions(argv);
  const jobId = parsed.positionals[0];
  if (!jobId) throw new CliInputError(`Usage: paunclip job ${subcommand} <jobId>`);

  if (subcommand === "watch") {
    await waitForJob(context, jobId);
    const job = await context.caller.job.byId(jobId);
    output(context, { job }, job ? `${job.id} ${job.status} ${job.progress}%` : "Job not found");
    return;
  }

  if (subcommand === "cancel") {
    const job = await context.caller.job.cancel(jobId);
    output(context, { job }, `Cancelled job ${job.id}`);
    return;
  }

  throw new CliInputError(`Unknown job command: ${subcommand}`);
}

async function commandConfig(context: CliContext, subcommand: string | undefined, argv: string[]) {
  if (!subcommand || hasHelp([subcommand, ...argv])) {
    printConfigHelp(context);
    return;
  }
  const parsed = parseOptions(argv);

  if (subcommand === "init") {
    const settings = await getSettings();
    output(context, { runtime: context.runtime, settings: maskSettingsForCli(settings) }, `Initialized ${context.runtime.profilePath}`);
    return;
  }

  if (subcommand === "show") {
    const settings = await getSettings();
    output(context, maskSettingsForCli(settings), JSON.stringify(maskSettingsForCli(settings), null, 2));
    return;
  }

  if (subcommand === "doctor") {
    await commandDoctor(context, argv);
    return;
  }

  if (subcommand === "presets" && parsed.positionals[0] === "list") {
    output(context, { presets: DEFAULT_CAPTION_PRESETS }, DEFAULT_CAPTION_PRESETS.map((preset) => `${preset.id}  ${preset.name}`).join("\n"));
    return;
  }

  if (subcommand === "output") {
    await commandConfigOutput(context, parsed);
    return;
  }

  if (subcommand === "cookies") {
    await commandConfigCookies(context, parsed);
    return;
  }

  if (subcommand === "ai") {
    await commandConfigAi(context, parsed);
    return;
  }

  if (subcommand === "logs") {
    const action = parsed.positionals[0];
    if (action !== "open") {
      throw new CliInputError("Usage: paunclip config logs open");
    }
    const opened = await context.caller.settings.openLogsDirectory();
    output(context, opened, `Opened: ${opened.path}`);
    return;
  }

  if (subcommand === "provider") {
    await commandConfigProvider(context, parsed);
    return;
  }

  throw new CliInputError(`Unknown config command: ${subcommand}`);
}

async function commandConfigOutput(context: CliContext, parsed: ParsedOptions) {
  const action = parsed.positionals[0];
  if (action === "set") {
    const target = parsed.positionals[1];
    if (!target) throw new CliInputError("Usage: paunclip config output set <path>");
    const settings = await context.caller.settings.updateOutputDirectory(target);
    output(context, { outputDirectory: settings.outputDirectory }, `Output folder: ${settings.outputDirectory}`);
    return;
  }
  if (action === "path") {
    const runtime = await context.caller.settings.runtimeInfo();
    output(context, { outputDirectory: runtime.outputDirectory }, runtime.outputDirectory);
    return;
  }
  if (action === "open") {
    const opened = await context.caller.settings.openOutputDirectory();
    output(context, opened, `Opened: ${opened.path}`);
    return;
  }
  throw new CliInputError("Usage: paunclip config output <set|path|open>");
}

async function commandConfigCookies(context: CliContext, parsed: ParsedOptions) {
  const action = parsed.positionals[0];
  if (action === "detect") {
    const file = parsed.positionals[1];
    if (!file) throw new CliInputError("Usage: paunclip config cookies detect <file>");
    const absolute = resolveUserPath(file);
    const text = await fs.readFile(absolute, "utf8");
    const parsedCookies = parseYoutubeCookiesText(text);
    output(
      context,
      {
        path: absolute,
        format: parsedCookies.format,
        cookieCount: parsedCookies.cookies.length,
        needsConversion: parsedCookies.needsConversion
      },
      formatCookieDetection(context, absolute, parsedCookies.format, parsedCookies.cookies.length, parsedCookies.needsConversion)
    );
    return;
  }
  if (action === "validate") {
    const file = parsed.positionals[1];
    if (!file) throw new CliInputError("Usage: paunclip config cookies validate <file>");
    const absolute = resolveUserPath(file);
    const text = await fs.readFile(absolute, "utf8");
    const validation = validateYoutubeCookiesText(text);
    output(context, { path: absolute, validation }, formatCookieValidation(context, absolute, validation));
    return;
  }
  if (action === "set" || action === "import") {
    const file = parsed.positionals[1];
    if (!file) throw new CliInputError(`Usage: paunclip config cookies ${action} <file>`);
    const result = await saveCookieFileReferenceOrConversion(file);
    output(
      context,
      result,
      [
        result.converted
          ? `Cookies converted to Netscape format: ${result.cookies.youtubePath}`
          : `Cookies linked from: ${result.cookies.youtubePath}`,
        formatCookieValidation(context, result.originalPath, result.validation)
      ].join("\n")
    );
    return;
  }
  if (action === "status") {
    const settings = await getSettings();
    const validation = await validateYoutubeCookiesFile(settings.cookies.youtubePath);
    output(
      context,
      { cookies: settings.cookies, validation },
      settings.cookies.youtubePath
        ? formatCookieValidation(context, settings.cookies.youtubePath, validation)
        : "Cookies not configured. Run `paunclip config cookies set <file>`."
    );
    return;
  }
  if (action === "clear") {
    const current = await getSettings();
    await saveSettings({
      ...current,
      cookies: { youtubePath: null, lastUpdated: null }
    });
    output(context, { ok: true }, "Cookies cleared");
    return;
  }
  throw new CliInputError("Usage: paunclip config cookies <detect|validate|set|import|status|clear>");
}

async function commandConfigAi(context: CliContext, parsed: ParsedOptions) {
  const action = parsed.positionals[0];
  if (action === "init") {
    const target = resolveAIConfigPath(parsed.positionals[1]);
    await ensureWritableTarget(target, hasOption(parsed, "force"));
    const settings = await getSettings();
    await writeJsonFile(target, buildAIConfigTemplate(settings, false));
    output(
      context,
      {
        path: target,
        next: [
          `nano ${target}`,
          parsed.positionals[1]
            ? `paunclip config ai apply ${target} --validate`
            : "paunclip config ai apply --validate"
        ]
      },
      [
        `AI config template created: ${target}`,
        "Edit this JSON with nano, Notepad, or your editor, then apply it:",
        `  ${commandText(context.color, `nano "${target}"`)}`,
        `  ${commandText(context.color, parsed.positionals[1] ? `paunclip config ai apply "${target}" --validate` : "paunclip config ai apply --validate")}`
      ].join("\n")
    );
    return;
  }

  if (action === "apply") {
    const file = resolveAIConfigPath(parsed.positionals[1]);
    const loaded = await readAIConfigFile(file);
    const current = await getSettings();
    const merged = mergeAIConfigIntoSettings(current, loaded);
    const validation = hasOption(parsed, "validate")
      ? await validateAIProviderEntries(context, merged, Object.keys(loaded.aiProviders))
      : [];
    if (validation.some((item) => !item.ok) && !hasOption(parsed, "force")) {
      throw new CliInputError(
        `AI config validation failed. Fix the JSON, or re-run with --force. ${validation
          .filter((item) => !item.ok)
          .map((item) => `${item.task}: ${item.message}`)
          .join(" ")}`
      );
    }
    const saved = await saveSettings(merged);
    output(
      context,
      { aiProviders: maskSettingsForCli(saved).aiProviders, validation },
      [
        "AI provider config applied.",
        validation.length ? formatAIValidation(context, validation) : "Tip: run with --validate to test provider/model/key readiness.",
        "Future provider edits: run `paunclip config ai edit`, then `paunclip config ai apply --validate`."
      ].join("\n")
    );
    return;
  }

  if (action === "validate") {
    const file = resolveAIConfigPath(parsed.positionals[1]);
    const loaded = await readAIConfigFile(file);
    const current = await getSettings();
    const merged = mergeAIConfigIntoSettings(current, loaded);
    const validation = await validateAIProviderEntries(context, merged, Object.keys(loaded.aiProviders));
    output(context, { validation }, formatAIValidation(context, validation));
    return;
  }

  if (action === "edit") {
    const target = resolveAIConfigPath(parsed.positionals[1]);
    try {
      await fs.access(target);
    } catch {
      await writeJsonFile(target, buildAIConfigTemplate(await getSettings(), false));
    }
    const editor = chooseEditorCommand();
    if (hasOption(parsed, "dry-run")) {
      output(
        context,
        { path: target, editor },
        [
          `AI config file: ${pathText(context.color, target)}`,
          `Editor command: ${commandText(context.color, [editor.command, ...editor.args, target].join(" "))}`
        ].join("\n")
      );
      return;
    }
    const result = spawnSync(editor.command, [...editor.args, target], {
      stdio: "inherit",
      windowsHide: false
    });
    if (result.error) {
      throw new CliInputError(`Could not open editor: ${result.error.message}. File path: ${target}`);
    }
    if (typeof result.status === "number" && result.status !== 0) {
      throw new CliInputError(`Editor exited with code ${result.status}. File path: ${target}`);
    }
    output(
      context,
      { path: target },
      [
        `AI config edited: ${target}`,
        nextSteps(context.color, ["paunclip config ai apply --validate"])
      ].join("\n")
    );
    return;
  }

  if (action === "show") {
    const settings = await getSettings();
    output(context, { aiProviders: maskSettingsForCli(settings).aiProviders }, JSON.stringify({ version: 1, aiProviders: maskSettingsForCli(settings).aiProviders }, null, 2));
    return;
  }

  if (action === "export") {
    const target = parsed.positionals[1];
    if (!target) throw new CliInputError("Usage: paunclip config ai export <file> [--include-secrets] [--force]");
    const absolute = path.resolve(target);
    await ensureWritableTarget(absolute, hasOption(parsed, "force"));
    const settings = await getSettings();
    const includeSecrets = hasOption(parsed, "include-secrets");
    await writeJsonFile(absolute, buildAIConfigTemplate(settings, includeSecrets));
    output(
      context,
      { path: absolute, includeSecrets },
      includeSecrets
        ? `AI config exported with secrets: ${absolute}`
        : `AI config exported without API keys: ${absolute}`
    );
    return;
  }

  throw new CliInputError("Usage: paunclip config ai <init|edit|apply|validate|show|export>");
}

async function commandConfigProvider(context: CliContext, parsed: ParsedOptions) {
  const action = parsed.positionals[0];
  if (!action || action === "help") {
    output(
      context,
      { help: "config provider" },
      [
        cliBanner(context.color),
        section(context.color, "AI Providers"),
        "Recommended flow:",
        `  ${commandText(context.color, "paunclip setup ai")}`,
        "",
        dim(context.color, "`config provider set` is kept for old scripts. Advanced JSON is available with `paunclip config ai edit`.")
      ].join("\n")
    );
    return;
  }
  if (action === "list") {
    const settings = await getSettings();
    output(
      context,
      { aiProviders: maskSettingsForCli(settings).aiProviders },
      Object.entries(maskSettingsForCli(settings).aiProviders)
        .map(([task, config]) => `${task}  ${config.provider}  ${config.model || "(no model)"}`)
        .join("\n")
    );
    return;
  }

  if (action === "set") {
    const task = normalizeTask(parsed.positionals[1]);
    const current = await getSettings();
    const previous = current.aiProviders[task];
    const apiKey = resolveApiKey(parsed, previous.apiKey);
    const config = aiProviderConfigSchema.parse(
      cleanProviderConfig({
        ...previous,
        provider: stringOption(parsed, "provider", previous.provider),
        baseUrl: stringOption(parsed, "base-url", previous.baseUrl),
        model: stringOption(parsed, "model", previous.model),
        apiKey,
        systemMessage: stringOption(parsed, "system-message", previous.systemMessage ?? ""),
        ttsVoice: stringOption(parsed, "voice", previous.ttsVoice ?? ""),
        ttsFormat: stringOption(parsed, "format", previous.ttsFormat ?? ""),
        ttsSpeed: optionalNumberOption(parsed, "speed") ?? previous.ttsSpeed
      })
    );
    const settings = await context.caller.settings.updateProvider({ task, config });
    output(context, { aiProviders: settings.aiProviders }, `${task} updated`);
    return;
  }

  if (action === "validate") {
    const task = normalizeTask(parsed.positionals[1]);
    const settings = await getSettings();
    const result = await context.caller.settings.validateProvider({
      task,
      config: settings.aiProviders[task]
    });
    output(context, result, result.ok ? `${task} ready` : `${task} failed: ${result.message}`);
    return;
  }

  throw new CliInputError("Usage: paunclip config provider <list|set|validate>");
}

async function saveCookieFileReferenceOrConversion(file: string) {
  const absolute = resolveUserPath(file);
  let text: string;
  try {
    text = await fs.readFile(absolute, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new CliInputError(
        formatMissingPathMessage(file, absolute, [
          "~/Cookies/youtube-cookies.txt",
          "./Cookies/youtube-cookies.txt",
          process.platform === "win32"
            ? "C:\\Users\\you\\Downloads\\youtube-cookies.txt"
            : "/home/you/Downloads/youtube-cookies.txt"
        ])
      );
    }
    throw error;
  }
  const parsed = parseYoutubeCookiesText(text);
  const validation = validateYoutubeCookiesText(text);
  if (!validation.ok && validation.severity === "error") {
    throw new CliInputError(validation.message);
  }

  const current = await getSettings();
  const storedPath = parsed.needsConversion ? configPath("cookies.txt") : absolute;
  if (parsed.needsConversion) {
    await writePrivateTextFile(storedPath, parsed.netscapeText);
  }

  const next = await saveSettings({
    ...current,
    cookies: {
      youtubePath: storedPath,
      lastUpdated: new Date().toISOString()
    }
  });

  return {
    originalPath: absolute,
    storedPath,
    converted: parsed.needsConversion,
    format: parsed.format,
    cookies: next.cookies,
    validation
  };
}

function formatCookieDetection(
  context: CliContext,
  filePath: string,
  format: CookieInputFormat,
  count: number,
  needsConversion: boolean
) {
  return [
    section(context.color, "Cookie File"),
    keyValue(context.color, "Path", pathText(context.color, filePath)),
    keyValue(context.color, "Format", format),
    keyValue(context.color, "Cookies", String(count)),
    keyValue(context.color, "Action", needsConversion ? "Will convert to Netscape cookies.txt" : "Can be referenced directly")
  ].join("\n");
}

function formatCookieValidation(context: CliContext, filePath: string, validation: YoutubeCookieValidation) {
  return [
    section(context.color, "Cookies"),
    keyValue(context.color, "Path", pathText(context.color, filePath)),
    keyValue(context.color, "Format", validation.format ?? "unknown"),
    `${badge(context.color, validation.severity)} ${validation.message}`,
    keyValue(context.color, "YouTube cookies", String(validation.stats.youtubeCookies)),
    keyValue(context.color, "Auth cookies", String(validation.stats.authCookies)),
    keyValue(context.color, "Secure cookies", String(validation.stats.secureCookies)),
    validation.stats.expiredCookies ? keyValue(context.color, "Expired cookies", String(validation.stats.expiredCookies)) : "",
    validation.advice.length ? nextSteps(context.color, validation.advice) : ""
  ].filter(Boolean).join("\n");
}

async function readAIConfigFile(file: string) {
  const absolute = path.resolve(file);
  let json: unknown;
  try {
    json = JSON.parse(await fs.readFile(absolute, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new CliInputError(
        `Config file not found: ${absolute}. Run \`paunclip setup\` for guided setup, or \`paunclip config ai init <file>\` for advanced JSON.`
      );
    }
    throw new CliInputError(`Could not read AI config JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return aiConfigFileSchema.parse(json);
  } catch (error) {
    throw new CliInputError(`Invalid AI config JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function buildAIConfigTemplate(settings: AppSettings, includeSecrets: boolean): AIConfigFile {
  return {
    version: 1,
    aiProviders: Object.fromEntries(
      AI_PROVIDER_TASKS.map((task) => [
        task,
        {
          ...settings.aiProviders[task],
          apiKey: includeSecrets ? settings.aiProviders[task].apiKey : ""
        }
      ])
    ) as AIConfigFile["aiProviders"]
  };
}

function mergeAIConfigIntoSettings(settings: AppSettings, configFile: AIConfigFile): AppSettings {
  const aiProviders = { ...settings.aiProviders };
  for (const task of AI_PROVIDER_TASKS) {
    const incoming = configFile.aiProviders[task];
    if (!incoming) {
      continue;
    }
    const previous = settings.aiProviders[task];
    aiProviders[task] = aiProviderConfigSchema.parse(
      cleanProviderConfig({
        ...incoming,
        apiKey: incoming.apiKey || previous.apiKey
      })
    );
  }
  return { ...settings, aiProviders };
}

async function validateAIProviderEntries(
  context: CliContext,
  settings: AppSettings,
  tasks: string[]
) {
  const knownTasks = tasks
    .map((task) => normalizeTask(task))
    .filter((task, index, array) => array.indexOf(task) === index);
  const results: Array<{ task: string; ok: boolean; message: string }> = [];
  for (const task of knownTasks) {
    try {
      const result = await context.caller.settings.validateProvider({
        task,
        config: settings.aiProviders[task]
      });
      results.push({ task, ok: result.ok, message: result.message });
    } catch (error) {
      results.push({
        task,
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return results;
}

function formatAIValidation(context: CliContext, validation: Array<{ task: string; ok: boolean; message: string }>) {
  if (validation.length === 0) {
    return "No provider entries found in JSON.";
  }
  return table(
    validation.map((item) => [
      badge(context.color, item.ok ? "ready" : "failed"),
      item.task,
      item.message
    ]),
    { headers: ["Status", "Task", "Message"], color: context.color }
  );
}

async function ensureWritableTarget(filePath: string, force: boolean) {
  if (force) {
    return;
  }
  try {
    await fs.access(filePath);
    throw new CliInputError(`File already exists: ${filePath}. Use --force to overwrite it.`);
  } catch (error) {
    if (error instanceof CliInputError) {
      throw error;
    }
  }
}

async function writeJsonFile(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writePrivateTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function waitForJob(context: CliContext, jobId: string) {
  let lastEventId = "";
  while (true) {
    const job = (await context.caller.job.byId(jobId)) as CliWatchedJobRow | null;
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    if (!context.json && !context.quiet) {
      const events = job.events.filter((event: CliJobEventRow) => event.id !== lastEventId);
      const last = events.at(-1);
      if (last) {
        lastEventId = last.id;
        console.error(`${badge(context.color, job.status)} ${info(context.color, `${job.progress}%`)} ${last.message}`);
      }
    }
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      if (job.status === "failed") {
        throw new CliJobError(formatJobFailureMessage(context, job.errorJson, job.id));
      }
      return job;
    }
    await sleep(1000);
  }
}

function formatJobFailureMessage(context: CliContext, errorJson: string | null | undefined, jobId: string) {
  const parsed = parseJsonObject(errorJson);
  const rawMessage = typeof parsed?.message === "string" ? parsed.message : jobId;
  const message = compactCliError(rawMessage);
  const advice = Array.isArray(parsed?.advice)
    ? parsed.advice.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return [
    `Job failed: ${message}`,
    advice.length > 0 ? nextSteps(context.color, advice) : ""
  ].filter(Boolean).join("\n");
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function compactCliError(value: string) {
  const withoutDetails = value.split(" Detail terakhir:")[0] ?? value;
  return withoutDetails.length > 700 ? `${withoutDetails.slice(0, 700)}...` : withoutDetails;
}

async function assertCliPreflight(
  context: CliContext,
  input: Parameters<CliContext["caller"]["settings"]["preflight"]>[0]
) {
  const report = (await context.caller.settings.preflight(input)) as CliPreflightReportRow;
  if (!report.ok) {
    throw new CliPreflightError(report.blockers.map((issue) => issue.message).join(" "));
  }
  if (!context.json && !context.quiet && report.warnings.length > 0) {
    for (const warning of report.warnings) {
      console.error(`${badge(context.color, "warning")} ${warning.message}`);
    }
  }
  return report;
}

async function requireCampaign(context: CliContext, campaignId?: string) {
  if (!campaignId) throw new CliInputError("Missing campaign id.");
  const campaign = await context.caller.campaign.getById(campaignId);
  if (!campaign) throw new CliInputError(`Campaign not found: ${campaignId}`);
  return campaign;
}

async function importLocalVideo(source: string) {
  const absolute = path.resolve(source);
  await fs.access(absolute);
  await ensureStorageLayout();
  const uploadId = createUploadId();
  const extension = path.extname(absolute) || ".mp4";
  const target = uploadPath(uploadId, `source${extension}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(absolute, target);
  return uploadId;
}

async function resolveSetupProvider(context: CliContext, parsed: ParsedOptions): Promise<SetupProviderChoice> {
  const raw = stringOption(parsed, "provider", "").toLowerCase();
  if (raw) {
    if (!isSetupProviderChoice(raw)) {
      throw new CliInputError("Unknown setup provider. Use groq, openai, custom, or skip.");
    }
    return raw;
  }

  ensureInteractive(context, "Run `paunclip setup ai --provider groq --api-key-env GROQ_API_KEY --yes` for non-interactive setup.");
  return promptSelect<SetupProviderChoice>(
    context,
    "Choose AI provider",
    [
      { value: "groq", label: "Groq", description: "Fast chat + Whisper transcription + TTS voice." },
      { value: "openai", label: "OpenAI", description: "Official OpenAI chat + Whisper + TTS." },
      { value: "custom", label: "Custom OpenAI-compatible", description: "Good for OpenCode/local gateways; often chat-only." },
      { value: "skip", label: "Skip for now", description: "Configure later." }
    ],
    "groq"
  );
}

async function resolveTaskSetupProvider(
  context: CliContext,
  parsed: ParsedOptions,
  task: AIProviderTask
): Promise<AIProviderConfig["provider"]> {
  const raw = stringOption(parsed, "provider", "").toLowerCase();
  if (raw) {
    if (!isTaskProviderChoice(raw)) {
      throw new CliInputError("Unknown provider. Use groq, openai, custom, anthropic, or gemini.");
    }
    if (!getProviderChoicesForTask(task).includes(raw)) {
      throw new CliInputError(`${providerLabel(raw)} does not support ${taskLabel(task)}.`);
    }
    return raw;
  }

  ensureInteractive(
    context,
    `Run \`paunclip setup ai task ${taskSlug(task)} --provider groq --api-key-env GROQ_API_KEY --yes\` for non-interactive setup.`
  );
  const choices = getProviderChoicesForTask(task).map((provider) => ({
    value: provider,
    label: providerLabel(provider),
    description: providerDescription(provider, task)
  }));
  return promptSelect(context, `Choose provider for ${taskLabel(task)}`, choices, choices[0]?.value ?? "groq");
}

async function resolveTaskBaseUrl(context: CliContext, parsed: ParsedOptions, task: AIProviderTask) {
  const baseUrl = normalizeOpenAICompatibleBaseUrl(
    stringOption(parsed, "base-url", "") ||
      (context.yes ? AI_PROVIDER_PRESETS.custom.defaultBaseUrl : await promptText(context, "Custom base URL", AI_PROVIDER_PRESETS.custom.defaultBaseUrl))
  );
  if (!providerSupportsCapability({ provider: "custom", baseUrl }, task === "captionMaker" ? "transcription" : task === "hookMaker" ? "tts" : "chat")) {
    throw new CliInputError(
      `This custom endpoint looks chat-only and cannot be used for ${taskLabel(task)}. Use Groq/OpenAI for audio tasks, or set a different --base-url.`
    );
  }
  return baseUrl;
}

async function resolveSetupApiKey(
  context: CliContext,
  parsed: ParsedOptions,
  provider: AIProviderConfig["provider"] | SetupProviderChoice
) {
  const envName = stringOption(parsed, "api-key-env", "");
  if (envName) {
    const value = process.env[envName];
    if (!value) {
      throw new CliInputError(`Environment variable ${envName} is empty. Run \`paunclip setup ai\` to paste one securely.`);
    }
    return value;
  }

  const inline = stringOption(parsed, "api-key", "");
  if (inline) {
    return inline;
  }

  if (provider === "custom" && hasOption(parsed, "no-api-key")) {
    return "";
  }

  ensureInteractive(context, "Run `paunclip setup ai --provider groq --api-key-env GROQ_API_KEY --yes` for non-interactive setup.");
  const preset = provider === "skip" ? AI_PROVIDER_PRESETS.custom : AI_PROVIDER_PRESETS[provider];
  const apiKey = await promptSecret(context, `${preset.label} API key${preset.keyPlaceholder ? ` (${preset.keyPlaceholder})` : ""}`);
  if (!apiKey && provider !== "custom") {
    throw new CliInputError("API key is empty. Run `paunclip setup ai` to paste one securely.");
  }
  return apiKey;
}

async function resolveCustomProviderInput(context: CliContext, parsed: ParsedOptions, apiKey: string) {
  const baseUrl = normalizeOpenAICompatibleBaseUrl(
    stringOption(parsed, "base-url", "") ||
      (await promptIfMissing(context, "Custom base URL", AI_PROVIDER_PRESETS.custom.defaultBaseUrl))
  );
  const chatModel =
    stringOption(parsed, "model", "") ||
    (await promptIfMissing(context, "Chat model", AI_PROVIDER_PRESETS.custom.defaultsByTask.highlightFinder?.model ?? ""));

  const chatOnly = !providerSupportsCapability({ provider: "custom", baseUrl }, "transcription") ||
    !providerSupportsCapability({ provider: "custom", baseUrl }, "tts");

  let transcriptionModel = stringOption(parsed, "transcription-model", "");
  if (!transcriptionModel && !chatOnly && !context.yes && await promptConfirm(context, "Use this custom endpoint for transcription too?", false)) {
    transcriptionModel = await promptText(context, "Transcription model", AI_PROVIDER_PRESETS.custom.defaultsByTask.captionMaker?.model ?? "whisper-1");
  }

  let ttsModel = stringOption(parsed, "tts-model", "");
  let ttsVoice = stringOption(parsed, "voice", "");
  if (!ttsModel && !chatOnly && !context.yes && await promptConfirm(context, "Use this custom endpoint for hook voice/TTS too?", false)) {
    ttsModel = await promptText(context, "TTS model", AI_PROVIDER_PRESETS.custom.defaultsByTask.hookMaker?.model ?? "tts-1");
    ttsVoice = await promptText(context, "TTS voice", AI_PROVIDER_PRESETS.custom.defaultsByTask.hookMaker?.voice ?? "alloy");
  }

  if (chatOnly && !context.json && !context.quiet) {
    console.error(
      `${badge(context.color, "warning")} This custom endpoint looks chat-only. PaunClip will use it for Highlight Finder and YouTube Title Maker only.`
    );
  }

  return {
    baseUrl,
    apiKey,
    chatModel,
    transcriptionModel: transcriptionModel || undefined,
    ttsModel: ttsModel || undefined,
    ttsVoice: ttsVoice || undefined,
    ttsFormat: stringOption(parsed, "format", "mp3") as AIProviderConfig["ttsFormat"]
  };
}

async function promptIfMissing(context: CliContext, label: string, fallback: string) {
  ensureInteractive(context, `Missing ${label}. Re-run with non-interactive flags.`);
  return promptText(context, label, fallback);
}

function providerLabel(provider: AIProviderConfig["provider"] | SetupProviderChoice) {
  if (provider === "groq") return AI_PROVIDER_PRESETS.groq.label;
  if (provider === "openai") return AI_PROVIDER_PRESETS.openai.label;
  if (provider === "custom") return AI_PROVIDER_PRESETS.custom.label;
  if (provider === "anthropic") return AI_PROVIDER_PRESETS.anthropic.label;
  if (provider === "gemini") return AI_PROVIDER_PRESETS.gemini.label;
  return "Skip";
}

function providerDescription(provider: AIProviderConfig["provider"], task: AIProviderTask) {
  const capability = task === "captionMaker" ? "transcription" : task === "hookMaker" ? "TTS" : "chat";
  const preset = AI_PROVIDER_PRESETS[provider];
  return `${capability} via ${preset.defaultBaseUrl}`;
}

function taskLabel(task: AIProviderTask) {
  if (task === "highlightFinder") return "Highlight Finder";
  if (task === "captionMaker") return "Caption Maker";
  if (task === "hookMaker") return "Hook Maker";
  return "YouTube Title Maker";
}

function taskSlug(task: AIProviderTask) {
  return Object.entries(taskMap).find(([, value]) => value === task)?.[0] ?? task;
}

function formatCurrentAITaskSummary(context: CliContext, settings: AppSettings) {
  return table(
    AI_PROVIDER_TASKS.map((task) => {
      const config = settings.aiProviders[task];
      return [
        taskLabel(task),
        providerLabel(config.provider),
        config.model || "(no model)",
        task === "hookMaker" ? config.ttsVoice || "(no voice)" : "-",
        config.apiKey ? "key saved" : "no key"
      ];
    }),
    { headers: ["Task", "Provider", "Model", "Voice", "Key"], color: context.color }
  );
}

function formatAITaskSummary(
  context: CliContext,
  settings: AppSettings,
  configuredTasks: AIProviderTask[],
  skippedTasks: AIProviderTask[]
) {
  const rows = AI_PROVIDER_TASKS.map((task) => {
    const config = settings.aiProviders[task];
    const status = configuredTasks.includes(task)
      ? "ready"
      : skippedTasks.includes(task)
        ? "skipped"
        : "unchanged";
    return [
      badge(context.color, status),
      task,
      config.provider,
      config.model || "(no model)",
      task === "hookMaker" && config.ttsVoice ? config.ttsVoice : "-"
    ];
  });
  return table(rows, { headers: ["Status", "Task", "Provider", "Model", "Voice"], color: context.color });
}

function ensureInteractive(context: CliContext, hint: string) {
  if (process.stdin.isTTY && process.stderr.isTTY && !context.json) {
    return;
  }
  throw new CliInputError(`This command needs an interactive terminal. ${hint}`);
}

async function promptText(context: CliContext, label: string, fallback = "") {
  ensureInteractive(context, `Use --${label.toLowerCase().replace(/\s+/g, "-")} for non-interactive setup.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const suffix = fallback ? ` (${fallback})` : "";
    const answer = await rl.question(`${info(context.color, "?")} ${label}${suffix}: `);
    return answer.trim() || fallback;
  } finally {
    rl.close();
  }
}

async function promptConfirm(context: CliContext, label: string, fallback: boolean) {
  if (context.yes) {
    return true;
  }
  ensureInteractive(context, "Use --yes with explicit flags for non-interactive setup.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const hint = fallback ? "Y/n" : "y/N";
    const answer = (await rl.question(`${info(context.color, "?")} ${label} ${dim(context.color, `[${hint}]`)} `)).trim().toLowerCase();
    if (!answer) return fallback;
    return ["y", "yes"].includes(answer);
  } finally {
    rl.close();
  }
}

async function promptSelect<T extends string>(
  context: CliContext,
  label: string,
  choices: Array<{ value: T; label: string; description: string }>,
  fallback: T
): Promise<T> {
  ensureInteractive(context, "Use --provider for non-interactive setup.");
  const defaultIndex = Math.max(0, choices.findIndex((choice) => choice.value === fallback));
  console.error(section(context.color, label));
  choices.forEach((choice, index) => {
    const number = String(index + 1).padStart(2);
    console.error(`  ${commandText(context.color, number)} ${choice.label} ${dim(context.color, choice.description)}`);
  });
  const answer = await promptText(context, "Pick one", String(defaultIndex + 1));
  const index = Number(answer) - 1;
  if (Number.isInteger(index) && choices[index]) {
    return choices[index].value;
  }
  const byValue = choices.find((choice) => choice.value.toLowerCase() === answer.toLowerCase());
  if (byValue) {
    return byValue.value;
  }
  throw new CliInputError(`Invalid choice: ${answer}`);
}

async function promptSecret(context: CliContext, label: string) {
  ensureInteractive(context, "Use --api-key-env for non-interactive setup.");
  const stdin = process.stdin;
  const stderr = process.stderr;
  if (!stdin.setRawMode) {
    return promptText(context, label, "");
  }

  return new Promise<string>((resolve, reject) => {
    let value = "";
    const wasRaw = stdin.isRaw;

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      stderr.write("\n");
    };

    const onData = (buffer: Buffer) => {
      const text = buffer.toString("utf8");
      for (const char of text) {
        if (char === "\u0003") {
          cleanup();
          reject(new CliInputError("Setup cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value.trim());
          return;
        }
        if (char === "\u007f" || char === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stderr.write("\b \b");
          }
          continue;
        }
        value += char;
        stderr.write("*");
      }
    };

    stderr.write(`${info(context.color, "?")} ${label}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

function managedAIConfigPath() {
  return configPath(DEFAULT_AI_CONFIG_FILE);
}

function resolveAIConfigPath(file?: string) {
  return file ? path.resolve(file) : managedAIConfigPath();
}

function chooseEditorCommand() {
  const raw = process.env.VISUAL || process.env.EDITOR || (process.platform === "win32" ? "notepad" : "nano");
  const parts = raw.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [raw];
  const command = parts[0];
  const args = parts.slice(1);
  return { command, args };
}

function parseGlobalOptions(argv: string[]): ParsedGlobalOptions {
  const args: string[] = [];
  let json = false;
  let quiet = false;
  let verbose = false;
  let yes = false;
  let noColor = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--quiet") {
      quiet = true;
    } else if (arg === "--verbose") {
      verbose = true;
    } else if (arg === "--yes") {
      yes = true;
    } else if (arg === "--no-color") {
      noColor = true;
    } else if (arg === "--profile") {
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      continue;
    } else {
      args.push(arg);
    }
  }

  return { args, json, quiet, verbose, yes, noColor, color: shouldUseColor({ json, noColor }) };
}

function parseOptions(argv: string[]): ParsedOptions {
  const positionals: string[] = [];
  const options: ParsedOptions["options"] = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const withoutPrefix = arg.slice(2);
    const [key, inlineValue] = withoutPrefix.split("=", 2);
    const next = argv[index + 1];
    const value =
      inlineValue ??
      (next && !next.startsWith("--")
        ? (() => {
            index += 1;
            return next;
          })()
        : true);
    if (options[key]) {
      const existing = options[key];
      options[key] = Array.isArray(existing) ? [...existing, String(value)] : [String(existing), String(value)];
    } else {
      options[key] = value;
    }
  }
  return { positionals, options };
}

function hasHelp(argv: string[]) {
  return argv.includes("--help") || argv.includes("-h") || argv[0] === "help";
}

function hasOption(parsed: ParsedOptions, key: string) {
  return parsed.options[key] !== undefined;
}

function stringOption(parsed: ParsedOptions, key: string, fallback: string) {
  const value = parsed.options[key];
  if (value === undefined || value === true) return fallback;
  return Array.isArray(value) ? value.at(-1) ?? fallback : String(value);
}

function numberOption(parsed: ParsedOptions, key: string, fallback: number) {
  const value = optionalNumberOption(parsed, key);
  return value ?? fallback;
}

function optionalNumberOption(parsed: ParsedOptions, key: string) {
  const value = parsed.options[key];
  if (value === undefined || value === true) return undefined;
  const parsedNumber = Number(Array.isArray(value) ? value.at(-1) : value);
  if (!Number.isFinite(parsedNumber)) {
    throw new CliInputError(`Option --${key} must be a number.`);
  }
  return parsedNumber;
}

function booleanPair(parsed: ParsedOptions, yesKey: string, noKey: string, fallback: boolean) {
  if (hasOption(parsed, noKey)) return false;
  if (hasOption(parsed, yesKey)) return true;
  return fallback;
}

async function readPromptFile(parsed: ParsedOptions) {
  const promptFile = stringOption(parsed, "prompt-file", "");
  return promptFile ? await fs.readFile(path.resolve(promptFile), "utf8") : "";
}

async function readOptionalFile(parsed: ParsedOptions, key: string) {
  const file = stringOption(parsed, key, "");
  return file ? await fs.readFile(path.resolve(file), "utf8") : undefined;
}

function parseTimeOption(parsed: ParsedOptions, key: string, fallback: number) {
  return parseOptionalTimeOption(parsed, key) ?? fallback;
}

function parseOptionalTimeOption(parsed: ParsedOptions, key: string) {
  const value = stringOption(parsed, key, "");
  if (!value) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) {
    throw new CliInputError(`Invalid time value for --${key}: ${value}`);
  }
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function resolveHighlightSelection(highlights: Array<{ id: string }>, parsed: ParsedOptions) {
  if (hasOption(parsed, "all")) return highlights.map((highlight) => highlight.id);
  const ids = stringOption(parsed, "highlights", "");
  if (ids) return ids.split(",").map((id) => id.trim()).filter(Boolean);
  const indexes = stringOption(parsed, "select", "");
  if (indexes) {
    return indexes
      .split(",")
      .map((value) => Number(value.trim()) - 1)
      .filter((index) => index >= 0 && index < highlights.length)
      .map((index) => highlights[index].id);
  }
  return undefined;
}

function resolveCampaignVideoSelection(videos: Array<{ id: string; videoId: string }>, selector: string) {
  if (!selector || selector === "selected") return undefined;
  if (selector === "all") return videos.map((video) => video.id);
  return selector
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item.startsWith("yt:")) {
        const match = videos.find((video) => video.videoId === item.slice(3));
        if (!match) throw new CliInputError(`Video id not found: ${item}`);
        return match.id;
      }
      if (item.startsWith("cv:")) return item.slice(3);
      const index = Number(item) - 1;
      if (Number.isInteger(index) && videos[index]) return videos[index].id;
      throw new CliInputError(`Invalid video selector: ${item}`);
    });
}

function parsePerVideoClipCounts(parsed: ParsedOptions) {
  const value = stringOption(parsed, "per-video", "");
  if (!value) return undefined;
  return Object.fromEntries(
    value.split(",").map((entry) => {
      const [key, count] = entry.split("=");
      if (!key || !count) throw new CliInputError(`Invalid --per-video entry: ${entry}`);
      return [key.startsWith("yt:") ? key.slice(3) : key, Number(count)];
    })
  );
}

function resolveApiKey(parsed: ParsedOptions, previous: string) {
  const apiKeyEnv = stringOption(parsed, "api-key-env", "");
  if (apiKeyEnv) {
    const value = process.env[apiKeyEnv];
    if (!value) throw new CliInputError(`Environment variable ${apiKeyEnv} is empty.`);
    return value;
  }
  const apiKey = stringOption(parsed, "api-key", "");
  return apiKey || previous;
}

function cleanProviderConfig(config: Record<string, unknown>) {
  return {
    ...config,
    ...(config.systemMessage ? { systemMessage: config.systemMessage } : { systemMessage: undefined }),
    ...(config.ttsVoice ? { ttsVoice: config.ttsVoice } : { ttsVoice: undefined }),
    ...(config.ttsFormat ? { ttsFormat: config.ttsFormat } : { ttsFormat: undefined }),
    ...(config.ttsSpeed ? { ttsSpeed: config.ttsSpeed } : { ttsSpeed: undefined })
  };
}

function normalizeTask(value?: string) {
  if (!value) throw new CliInputError(`Task is required. Use one of: ${Object.keys(taskMap).join(", ")}`);
  const mapped = taskMap[value as keyof typeof taskMap] ?? value;
  if (!AI_PROVIDER_TASKS.includes(mapped as (typeof AI_PROVIDER_TASKS)[number])) {
    throw new CliInputError(`Unknown provider task: ${value}`);
  }
  return mapped as (typeof AI_PROVIDER_TASKS)[number];
}

function maskSettingsForCli<T extends { aiProviders: Record<string, AIProviderConfig> }>(settings: T) {
  return {
    ...settings,
    aiProviders: Object.fromEntries(
      Object.entries(settings.aiProviders).map(([task, config]) => [
        task,
        {
          ...config,
          apiKey: config.apiKey ? "********" : ""
        }
      ])
    )
  };
}

function formatDoctorReport(
  context: CliContext,
  runtime: Awaited<ReturnType<CliContext["caller"]["settings"]["runtimeInfo"]>>,
  health: Awaited<ReturnType<CliContext["caller"]["settings"]["health"]>>,
  preflight: Awaited<ReturnType<CliContext["caller"]["settings"]["preflight"]>>,
  youtubeReadiness?: YoutubeLiveReadiness
) {
  const color = context.color;
  const liveMediaBlocked = youtubeReadiness ? !youtubeReadiness.media.ok : false;
  const toolRows = [
    toolRow(color, "FFmpeg", health.tools.ffmpeg),
    toolRow(color, "FFprobe", health.tools.ffprobe),
    toolRow(color, "yt-dlp", health.tools.ytdlp)
  ];
  const issueRows = (preflight.issues as CliIssueRow[]).map((issue) => [
    badge(color, issue.severity),
    issue.area,
    issue.message
  ]);

  return [
    cliBanner(color),
    dim(color, "Local-first clipping runtime health check"),
    "",
    section(color, "Runtime"),
    keyValue(color, "Mode", runtime.mode),
    keyValue(color, "Profile", pathText(color, context.runtime.profilePath)),
    keyValue(color, "Storage", pathText(color, runtime.storageRoot)),
    keyValue(color, "Output", pathText(color, runtime.outputDirectory)),
    keyValue(color, "Database", pathText(color, runtime.databasePath)),
    "",
    section(color, "Tools"),
    table(toolRows, { headers: ["Status", "Tool", "Command"], color }),
    "",
    section(color, "Cookies"),
    `${badge(color, health.cookies.ok ? "ok" : health.cookies.severity)} ${health.cookies.message}`,
    youtubeReadiness ? "" : "",
    youtubeReadiness ? formatYoutubeLiveReadiness(context, youtubeReadiness) : "",
    "",
    section(color, "Preflight"),
    preflight.ok && !liveMediaBlocked
      ? `${badge(color, "ready")} PaunClip is ready to create clips.`
      : table(
          [
            ...issueRows,
            ...(liveMediaBlocked
              ? [[badge(color, "blocker"), "cookies", youtubeReadiness!.media.message ?? "YouTube media download failed."]]
              : [])
          ],
          { headers: ["Level", "Area", "Message"], color }
        ),
    preflight.ok && !liveMediaBlocked ? "" : "",
    preflight.ok && !liveMediaBlocked
      ? ""
      : nextSteps(color, [
          "paunclip setup",
          "paunclip setup ai",
          "paunclip setup cookies",
          "paunclip setup cookies validate-live <youtube-url>",
          "paunclip setup output"
        ])
  ]
    .filter(Boolean)
    .join("\n");
}

function formatYoutubeLiveReadiness(context: CliContext, readiness: YoutubeLiveReadiness) {
  const color = context.color;
  return [
    section(color, "YouTube Live Check"),
    table(
      [
        youtubeProbeRow(color, readiness.metadata),
        youtubeProbeRow(color, readiness.subtitles),
        youtubeProbeRow(color, readiness.media)
      ],
      { headers: ["Status", "Check", "Detail"], color }
    ),
    readiness.media.ok
      ? `${badge(color, "ready")} YouTube media download is available for this URL.`
      : `${badge(color, "blocker")} ${readiness.media.message ?? "YouTube media download failed."}`,
    readiness.advice.length ? nextSteps(color, readiness.advice) : ""
  ].filter(Boolean).join("\n");
}

function youtubeProbeRow(color: boolean, step: YoutubeLiveProbeStep) {
  return [
    badge(color, step.ok ? "ready" : "failed"),
    step.label,
    step.ok
      ? step.clientProfile
        ? `client: ${step.clientProfile}`
        : "ok"
      : step.message ?? step.failureKind ?? "failed"
  ];
}

function toolRow(
  color: boolean,
  name: string,
  tool: { ok: boolean; command?: string; message?: string }
) {
  return [badge(color, tool.ok ? "ready" : "missing"), name, tool.command ?? tool.message ?? "-"];
}

function formatSessionSummary(
  context: CliContext,
  session: Awaited<ReturnType<CliContext["caller"]["session"]["getById"]>> | null,
  extra: string[] = []
) {
  if (!session) return "Session not found.";
  const highlights = (session.highlights ?? []) as CliHighlightRow[];
  const clips = (session.clips ?? []) as CliClipRow[];
  const color = context.color;
  return [
    section(color, "Session"),
    keyValue(color, "ID", session.id),
    keyValue(color, "Status", `${badge(color, session.status)} ${dim(color, session.stage)}`),
    keyValue(color, "Source", session.sourceTitle ?? session.sourceUrl ?? session.sourceType),
    "",
    section(color, `Highlights (${highlights.length})`),
    highlights.length
      ? table(
          highlights.map((highlight, index) => [
            String(index + 1),
            highlight.title,
            `${highlight.startTime.toFixed(1)}s-${highlight.endTime.toFixed(1)}s`,
            badge(color, highlight.status)
          ]),
          { headers: ["#", "Title", "Range", "Status"], color }
        )
      : dim(color, "No highlights yet."),
    "",
    section(color, `Clips (${clips.length})`),
    clips.length
      ? table(
          clips.map((clip) => [clip.title, badge(color, clip.status), clip.masterPath ?? "-"]),
          { headers: ["Title", "Status", "Output"], color }
        )
      : dim(color, "No rendered clips yet."),
    extra.length ? "" : "",
    nextSteps(color, extra)
  ].join("\n");
}

function formatCampaign(
  context: CliContext,
  campaign: Awaited<ReturnType<CliContext["caller"]["campaign"]["getById"]>>
) {
  if (!campaign) return "Campaign not found.";
  const color = context.color;
  return [
    section(color, "Campaign"),
    keyValue(color, "Name", campaign.name),
    keyValue(color, "ID", campaign.id),
    keyValue(color, "Channel", campaign.channelUrl ?? "-"),
    keyValue(color, "Videos", String(campaign.videos.length)),
    "",
    formatCampaignVideos(context, campaign.videos)
  ].join("\n");
}

function formatCampaignVideos(
  context: CliContext,
  videos: Array<{
    id: string;
    videoId: string;
    title: string;
    status: string;
    durationSeconds: number | null;
    session: { status: string; _count?: { highlights: number; clips: number } } | null;
  }>
) {
  if (videos.length === 0) return dim(context.color, "No videos fetched yet.");
  return table(
    videos.map((video, index) => {
      const duration = video.durationSeconds ? `${Math.round(video.durationSeconds)}s` : "-";
      const found = video.session?._count?.highlights ?? 0;
      const clips = video.session?._count?.clips ?? 0;
      return [
        String(index + 1),
        shortId(video.id, 12),
        `yt:${video.videoId}`,
        duration,
        badge(context.color, video.session?.status ?? video.status),
        `${found}/${clips}`,
        video.title
      ];
    }),
    { headers: ["#", "ID", "YouTube", "Time", "Status", "H/C", "Title"], color: context.color }
  );
}

function formatCampaignList(
  context: CliContext,
  campaigns: Awaited<ReturnType<CliContext["caller"]["campaign"]["list"]>>
) {
  const rows = campaigns as CliCampaignListRow[];
  if (rows.length === 0) return "No campaigns yet.";
  return table(
    rows.map((campaign) => [
      shortId(campaign.id, 12),
      campaign.name,
      campaign.channelUrl ?? "-",
      String(campaign.videos.length)
    ]),
    { headers: ["ID", "Campaign", "Source", "Videos"], color: context.color }
  );
}

function formatCampaignStartResult(
  context: CliContext,
  result: Awaited<ReturnType<CliContext["caller"]["campaign"]["startBatch"]>>
) {
  const row = result as CliCampaignStartRow;
  return [
    section(context.color, "Batch queued"),
    keyValue(context.color, "Queued", String(row.queuedCount)),
    keyValue(context.color, "Skipped", String(row.skippedCount)),
    "",
    nextSteps(
      context.color,
      row.sessionIds.length
        ? row.sessionIds.map((id) => `paunclip render ${id} --all`)
        : ["paunclip campaign videos <campaignId>"]
    )
  ].join("\n");
}

function formatSessionList(
  context: CliContext,
  sessions: Awaited<ReturnType<CliContext["caller"]["session"]["list"]>>
) {
  const rows = sessions as CliSessionListRow[];
  if (rows.length === 0) return "No sessions yet.";
  return table(
    rows.map((session) => [
      shortId(session.id, 12),
      badge(context.color, session.status),
      session.stage,
      String(session.highlights.length),
      String(session.clips.length),
      session.sourceTitle ?? session.sourceUrl ?? ""
    ]),
    { headers: ["ID", "Status", "Stage", "Highlights", "Clips", "Source"], color: context.color }
  );
}

function formatJobList(
  context: CliContext,
  jobs: CliJobRow[]
) {
  if (jobs.length === 0) return "No jobs yet.";
  return table(
    jobs.map((job) => [
      shortId(job.id, 12),
      badge(context.color, job.status),
      `${job.progress}%`,
      shortId(job.sessionId, 12)
    ]),
    { headers: ["ID", "Status", "Progress", "Session"], color: context.color }
  );
}

function output(context: CliContext, jsonValue: unknown, text: string) {
  if (context.json) {
    console.log(JSON.stringify({ ok: true, ...toJsonObject(jsonValue) }, null, 2));
    return;
  }
  if (!context.quiet) {
    console.log(text);
  }
}

function toJsonObject(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

async function getPackageVersion() {
  const raw = await fs.readFile(path.resolve(process.cwd(), "package.json"), "utf8");
  return JSON.parse(raw).version as string;
}

function handleError(error: unknown, globals: Pick<ParsedGlobalOptions, "json" | "color">) {
  const code = error instanceof CliInputError ? 2 : error instanceof CliPreflightError ? 3 : error instanceof CliJobError ? 4 : 1;
  const message = error instanceof Error ? error.message : String(error);
  if (globals.json) {
    console.error(JSON.stringify({ ok: false, error: { message, code } }, null, 2));
  } else {
    console.error(`${danger(globals.color, "Error")} ${message}`);
  }
  return code;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CliInputError extends Error {}
class CliPreflightError extends Error {}
class CliJobError extends Error {}

function printRootHelp(context: CliContext) {
  output(
    context,
    { help: "root" },
    [
      cliBanner(context.color),
      dim(context.color, "Local-first AI clipping for videos, campaigns, and batch workflows."),
      "",
      section(context.color, "Usage"),
      `  ${commandText(context.color, "paunclip <command> [options]")}`,
      "",
      section(context.color, "Core commands"),
      table(
        [
          ["setup", "Guided setup for AI, cookies, output folder, and readiness."],
          ["setup ai task <task>", "Configure one AI task with provider-aware prompts."],
          ["doctor", "Check tools, storage, providers, cookies, and preflight."],
          ["create clips <source>", "Create highlights from one YouTube URL or local video."],
          ["render <sessionId>", "Render selected or all highlights into clips."],
          ["create campaign <name> <source>", "Create a campaign workspace."],
          ["campaign fetch|videos|start", "Fetch channel videos, pick candidates, queue batch clips."],
          ["session show|logs|retry|cancel", "Inspect and manage one session."],
          ["jobs list / job watch", "Watch active processing jobs."],
          ["config ai|cookies|output", "Configure AI JSON, cookies, output, and presets."]
        ],
        { headers: ["Command", "What it does"], color: context.color }
      ),
      "",
      section(context.color, "Global options"),
      table(
        [
          ["--profile <path>", "Use a specific PaunClip profile."],
          ["--json", "Machine-readable output with no color or banner."],
          ["--no-color", "Disable ANSI colors for human output."],
          ["--quiet", "Reduce output."],
          ["--verbose", "More diagnostics."],
          ["--yes", "Accept safe defaults."]
        ],
        { headers: ["Option", "Description"], color: context.color }
      ),
      "",
      section(context.color, "Examples"),
      `  ${commandText(context.color, "paunclip setup")}`,
      `  ${commandText(context.color, "paunclip setup ai task caption-maker")}`,
      `  ${commandText(context.color, "paunclip setup check")}`,
      `  ${commandText(context.color, "paunclip doctor")}`,
      `  ${commandText(context.color, "paunclip doctor --youtube-url https://youtube.com/watch?v=...")}`,
      `  ${commandText(context.color, 'paunclip create clips "https://youtube.com/watch?v=..." --clips 3')}`,
      `  ${commandText(context.color, "paunclip render <sessionId> --all")}`,
      `  ${commandText(context.color, 'paunclip create campaign "My Campaign" "https://youtube.com/@channel" --fetch 20')}`,
      `  ${commandText(context.color, "paunclip campaign start <campaignId> --videos 1,2,3 --clips 3")}`,
      `  ${commandText(context.color, "paunclip config ai edit")}`
    ].join("\n")
  );
}

function printSetupHelp(context: CliContext) {
  output(
    context,
    { help: "setup" },
    [
      cliBanner(context.color),
      section(context.color, "Setup"),
      `  ${commandText(context.color, "paunclip setup")}`,
      "",
      "Guided setup for AI provider, YouTube cookies, output folder, and readiness.",
      "",
      section(context.color, "Commands"),
      table(
        [
          ["setup", "Run the complete interactive wizard."],
          ["setup ai", "Open the task-based AI setup dashboard."],
          ["setup ai task highlight-finder", "Configure chat model for moment detection."],
          ["setup ai task caption-maker", "Configure transcription model for captions."],
          ["setup ai task hook-maker", "Configure TTS model and voice for hooks."],
          ["setup ai task youtube-title-maker", "Configure chat model for YouTube titles."],
          ["setup ai quick --provider groq", "Apply recommended defaults to every AI task."],
          ["setup ai validate [task]", "Validate all AI tasks or one task."],
          ["setup cookies", "Import or link YouTube cookies from Netscape/JSON/header formats."],
          ["setup cookies validate-live <url>", "Live-test metadata, subtitles, and media download access."],
          ["setup output", "Choose and validate the output folder."],
          ["setup check", "Run the final doctor/readiness check."]
        ],
        { headers: ["Command", "What it does"], color: context.color }
      ),
      "",
      section(context.color, "Non-interactive"),
      `  ${commandText(context.color, "paunclip setup ai quick --provider groq --api-key-env GROQ_API_KEY --yes")}`,
      `  ${commandText(context.color, "paunclip setup ai task caption-maker --provider groq --api-key-env GROQ_API_KEY --model whisper-large-v3-turbo --yes")}`,
      `  ${commandText(context.color, "paunclip setup ai task hook-maker --provider groq --api-key-env GROQ_API_KEY --model canopylabs/orpheus-v1-english --voice hannah --yes")}`,
      `  ${commandText(context.color, "paunclip setup cookies --path ./cookies.txt --yes")}`,
      `  ${commandText(context.color, "paunclip setup cookies validate-live https://youtube.com/watch?v=...")}`,
      `  ${commandText(context.color, "paunclip setup output --path ./output --yes")}`,
      `  ${commandText(context.color, "paunclip setup check --json")}`,
      "",
      dim(context.color, "Advanced JSON is still available with `paunclip config ai edit`.")
    ].join("\n")
  );
}

function printDoctorHelp(context: CliContext) {
  output(
    context,
    { help: "doctor" },
    simpleHelp(context, "Doctor", "paunclip doctor [--youtube-url <url>] [--json]", [
      "paunclip doctor",
      "paunclip doctor --youtube-url https://youtube.com/watch?v=...",
      "paunclip --json doctor --youtube-url https://youtube.com/watch?v=..."
    ])
  );
}

function printCreateClipsHelp(context: CliContext) {
  output(
    context,
    { help: "create clips" },
    simpleHelp(context, "Create Clips", "paunclip create clips <youtube-url|video-path> [options]", [
      'paunclip create clips "https://youtube.com/watch?v=..." --clips 3',
      'paunclip create clips ".\\video.mp4" --clips 5 --srt ".\\captions.srt"',
      'paunclip create clips "https://youtube.com/watch?v=..." --auto-render --no-hook'
    ])
  );
}

function printRenderHelp(context: CliContext) {
  output(context, { help: "render" }, simpleHelp(context, "Render", "paunclip render <sessionId> [--all] [--select 1,3] [--queue]", ["paunclip render <sessionId> --all"]));
}

function printCreateCampaignHelp(context: CliContext) {
  output(
    context,
    { help: "create campaign" },
    simpleHelp(context, "Create Campaign", "paunclip create campaign <name> <youtube-source> [--fetch 20] [--type videos|shorts|all]", [
      'paunclip create campaign "Launch clips" "https://youtube.com/@channel" --fetch 20'
    ])
  );
}

function printCampaignHelp(context: CliContext) {
  output(context, { help: "campaign" }, simpleHelp(context, "Campaign", "paunclip campaign <list|show|fetch|videos|start|watch>", ["paunclip campaign videos <campaignId>", "paunclip campaign start <campaignId> --videos 1,2,3 --clips 3"]));
}

function printSessionHelp(context: CliContext) {
  output(context, { help: "session" }, simpleHelp(context, "Session", "paunclip session <show|logs|retry|cancel> <sessionId>", ["paunclip session show <sessionId>", "paunclip session logs <sessionId>"]));
}

function printJobHelp(context: CliContext) {
  output(context, { help: "job" }, simpleHelp(context, "Job", "paunclip job <watch|cancel> <jobId>", ["paunclip job watch <jobId>", "paunclip job cancel <jobId>"]));
}

function printConfigHelp(context: CliContext) {
  output(
    context,
    { help: "config" },
    simpleHelp(context, "Config", "paunclip config <init|show|doctor|ai|provider|cookies|output|presets>", [
      "paunclip setup",
      "paunclip setup ai",
      "paunclip setup ai task caption-maker",
      "paunclip setup ai validate",
      "paunclip setup cookies --path cookies.txt",
      "paunclip setup cookies validate-live <youtube-url>",
      "paunclip setup output",
      "paunclip config ai edit"
    ])
  );
}

function simpleHelp(context: CliContext, title: string, usage: string, examples: string[]) {
  return [
    cliBanner(context.color),
    section(context.color, title),
    `  ${commandText(context.color, usage)}`,
    "",
    nextSteps(context.color, examples)
  ].join("\n");
}
