import "server-only";
import { campaignBatchConfigSchema, type CampaignBatchConfig } from "@/shared/schemas/campaign";
import { parseJsonWithSchema } from "@/shared/schemas/primitives";
import { sessionConfigSchema, type SessionConfig } from "@/shared/schemas/session";

export function buildCampaignSessionConfig(input: {
  campaignConfigJson: string;
  batchConfig?: Partial<CampaignBatchConfig>;
  targetClipCount?: number;
}): SessionConfig {
  const storedConfig = parseJsonWithSchema(
    sessionConfigSchema,
    input.campaignConfigJson,
    sessionConfigSchema.parse({ promptMode: "campaign_batch", renderMode: "review" })
  );
  const batchConfig = campaignBatchConfigSchema.parse(input.batchConfig ?? {});

  return sessionConfigSchema.parse({
    ...storedConfig,
    autoHook: batchConfig.autoHook,
    captionStyleId: batchConfig.captionStyleId,
    renderMode: batchConfig.renderMode,
    clipLength: batchConfig.clipLength,
    language: batchConfig.language,
    prompt: batchConfig.prompt,
    targetClipCount: input.targetClipCount ?? batchConfig.clipsPerVideo,
    promptMode: "campaign_batch"
  });
}
