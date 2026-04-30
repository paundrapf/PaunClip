import fs from "node:fs/promises";
import path from "node:path";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { getSettings, saveSettings } from "@/server/config/settings-store";
import { ensureDatabaseMigrations } from "@/server/db/migrations";
import { registerPipelineJobs } from "@/server/pipeline/register";
import { createUploadId, ensureStorageLayout, uploadPath } from "@/server/storage/paths";
import { AI_PROVIDER_TASKS } from "@/shared/constants/ai-providers";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";
import { campaignBatchConfigSchema, campaignContentTypeSchema } from "@/shared/schemas/campaign";
import { sourceTypeSchema } from "@/shared/schemas/primitives";
import { sessionConfigSchema } from "@/shared/schemas/session";
import { aiProviderConfigSchema, type AIProviderConfig } from "@/shared/schemas/settings";
import type { CliRuntime } from "./runtime";
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

const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "cancelled", "interrupted"]);
const taskMap = {
  "highlight-finder": "highlightFinder",
  "caption-maker": "captionMaker",
  "hook-maker": "hookMaker",
  "youtube-title-maker": "youtubeTitleMaker"
} as const;

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
    await commandDoctor(context, rest);
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

  output(
    context,
    { runtime, health, preflight },
    formatDoctorReport(context, runtime, health, preflight)
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
    const events = session?.jobs.flatMap((job) => job.events.map((event) => ({ ...event, jobId: job.id }))) ?? [];
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
    const sessions = await context.caller.session.list();
    const jobs = sessions.flatMap((session) => session.jobs.map((job) => ({ ...job, sessionId: session.id })));
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
  if (action === "import") {
    const file = parsed.positionals[1];
    if (!file) throw new CliInputError("Usage: paunclip config cookies import <cookies.txt>");
    const absolute = path.resolve(file);
    await fs.access(absolute);
    const current = await getSettings();
    const next = await saveSettings({
      ...current,
      cookies: {
        youtubePath: absolute,
        lastUpdated: new Date().toISOString()
      }
    });
    output(context, { cookies: next.cookies }, `Cookies imported from ${absolute}`);
    return;
  }
  if (action === "status") {
    const settings = await getSettings();
    output(context, { cookies: settings.cookies }, settings.cookies.youtubePath ? `Cookies: ${settings.cookies.youtubePath}` : "Cookies not configured");
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
  throw new CliInputError("Usage: paunclip config cookies <import|status|clear>");
}

async function commandConfigProvider(context: CliContext, parsed: ParsedOptions) {
  const action = parsed.positionals[0];
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

async function waitForJob(context: CliContext, jobId: string) {
  let lastEventId = "";
  while (true) {
    const job = await context.caller.job.byId(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    if (!context.json && !context.quiet) {
      const events = job.events.filter((event) => event.id !== lastEventId);
      const last = events.at(-1);
      if (last) {
        lastEventId = last.id;
        console.error(`${badge(context.color, job.status)} ${info(context.color, `${job.progress}%`)} ${last.message}`);
      }
    }
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      if (job.status === "failed") {
        throw new CliJobError(`Job failed: ${job.errorJson ?? job.id}`);
      }
      return job;
    }
    await sleep(1000);
  }
}

async function assertCliPreflight(
  context: CliContext,
  input: Parameters<CliContext["caller"]["settings"]["preflight"]>[0]
) {
  const report = await context.caller.settings.preflight(input);
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
  preflight: Awaited<ReturnType<CliContext["caller"]["settings"]["preflight"]>>
) {
  const color = context.color;
  const toolRows = [
    toolRow(color, "FFmpeg", health.tools.ffmpeg),
    toolRow(color, "FFprobe", health.tools.ffprobe),
    toolRow(color, "yt-dlp", health.tools.ytdlp)
  ];
  const issueRows = preflight.issues.map((issue) => [
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
    "",
    section(color, "Preflight"),
    preflight.ok
      ? `${badge(color, "ready")} PaunClip is ready to create clips.`
      : table(issueRows, { headers: ["Level", "Area", "Message"], color }),
    preflight.ok ? "" : "",
    preflight.ok
      ? ""
      : nextSteps(color, [
          "paunclip config provider list",
          "paunclip config cookies status",
          "paunclip config output path"
        ])
  ]
    .filter(Boolean)
    .join("\n");
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
  const highlights = session.highlights ?? [];
  const clips = session.clips ?? [];
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
  if (campaigns.length === 0) return "No campaigns yet.";
  return table(
    campaigns.map((campaign) => [
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
  return [
    section(context.color, "Batch queued"),
    keyValue(context.color, "Queued", String(result.queuedCount)),
    keyValue(context.color, "Skipped", String(result.skippedCount)),
    "",
    nextSteps(
      context.color,
      result.sessionIds.length
        ? result.sessionIds.map((id) => `paunclip render ${id} --all`)
        : ["paunclip campaign videos <campaignId>"]
    )
  ].join("\n");
}

function formatSessionList(
  context: CliContext,
  sessions: Awaited<ReturnType<CliContext["caller"]["session"]["list"]>>
) {
  if (sessions.length === 0) return "No sessions yet.";
  return table(
    sessions.map((session) => [
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
  jobs: Array<{ id: string; status: string; progress: number; sessionId: string }>
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
          ["doctor", "Check tools, storage, providers, cookies, and preflight."],
          ["create clips <source>", "Create highlights from one YouTube URL or local video."],
          ["render <sessionId>", "Render selected or all highlights into clips."],
          ["create campaign <name> <source>", "Create a campaign workspace."],
          ["campaign fetch|videos|start", "Fetch channel videos, pick candidates, queue batch clips."],
          ["session show|logs|retry|cancel", "Inspect and manage one session."],
          ["jobs list / job watch", "Watch active processing jobs."],
          ["config provider|cookies|output", "Configure AI, cookies, output, and presets."]
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
      `  ${commandText(context.color, "paunclip doctor")}`,
      `  ${commandText(context.color, 'paunclip create clips "https://youtube.com/watch?v=..." --clips 3')}`,
      `  ${commandText(context.color, "paunclip render <sessionId> --all")}`,
      `  ${commandText(context.color, 'paunclip create campaign "My Campaign" "https://youtube.com/@channel" --fetch 20')}`,
      `  ${commandText(context.color, "paunclip campaign start <campaignId> --videos 1,2,3 --clips 3")}`
    ].join("\n")
  );
}

function printDoctorHelp(context: CliContext) {
  output(context, { help: "doctor" }, simpleHelp(context, "Doctor", "paunclip doctor [--json]", ["paunclip doctor", "paunclip --json doctor"]));
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
  output(context, { help: "config" }, simpleHelp(context, "Config", "paunclip config <init|show|doctor|provider|cookies|output|presets>", ["paunclip config provider list", "paunclip config cookies status", "paunclip config output path"]));
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
