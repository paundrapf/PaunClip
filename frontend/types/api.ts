export interface ProgressState {
  status: string;
  progress: number;
  task_type: string | null;
  session_id: string | null;
  campaign_id: string | null;
  is_running: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  channel_url?: string;
  channel_id?: string;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
  session_count?: number;
  completed_session_count?: number;
  failed_session_count?: number;
  last_activity?: string | null;
  sync_state?: {
    last_synced_at?: string | null;
    last_error?: string | null;
  };
}

export interface CampaignQueueVideo {
  video_id: string;
  title: string;
  video_url: string;
  thumbnail_url: string;
  published_at: string;
  channel_name: string;
  duration_seconds: number;
  status: string;
  last_error: string | null;
  session_id: string;
  session_dir: string;
  updated_at: string;
}

export interface ChannelFetchSnapshot {
  campaign_id: string;
  channel_url: string;
  channel_id: string;
  fetched_at: string | null;
  last_error: string | null;
  videos: CampaignQueueVideo[];
}

export interface CampaignDetailPayload {
  campaign: Campaign;
  channel_fetch: ChannelFetchSnapshot;
  num_clips: number;
}

export interface CampaignMutationResponse {
  status: string;
  campaign?: Campaign;
  campaigns?: Campaign[];
  detail?: CampaignDetailPayload;
  message?: string;
}

export interface StartTaskResponse {
  status: string;
  message?: string;
}

export interface SessionSummary {
  session_id: string;
  session_dir: string;
  session_manifest_path: string;
  campaign_id?: string | null;
  campaign_label?: string | null;
  status: string;
  stage: string;
  title: string;
  channel: string;
  highlight_count: number;
  selected_highlight_count: number;
  clip_job_count: number;
  has_clips: boolean;
  created_at?: string;
  updated_at?: string;
  last_error?: string | null;
  is_legacy_session: boolean;
}

export interface HighlightEditor {
  tts_voice?: string;
  caption_mode?: string;
  caption_override?: string;
  tracking_mode?: string;
  source_credit_enabled?: boolean;
  watermark_preset?: string;
  hook_enabled?: boolean;
  captions_enabled?: boolean;
}

export interface WorkspaceHighlight {
  highlight_id: string;
  title: string;
  description?: string;
  hook_text?: string;
  start_time?: string;
  end_time?: string;
  time_range?: string;
  duration_seconds?: number | null;
  selected?: boolean;
  clip_status?: string | null;
  editor: HighlightEditor;
}

export interface OutputClipRecord {
  clip_id: string;
  title: string;
  hook_text: string;
  duration: number | null;
  folder: string;
  revision_label: string;
  status: string;
  master_path: string;
  data_path: string;
}

export interface WorkspaceSessionSummary {
  session_id: string;
  session_dir: string;
  campaign_id?: string | null;
  campaign_label?: string | null;
  status: string;
  stage: string;
  last_error?: string | null;
  video_path?: string | null;
  srt_path?: string | null;
  video_info: {
    title?: string | null;
    channel?: string | null;
  };
  workspace_state: {
    active_highlight_id?: string | null;
    add_hook?: boolean;
    add_captions?: boolean;
  };
  is_legacy_session: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface QueueSummary {
  total: number;
  queued: number;
  rendering: number;
  completed: number;
  failed: number;
  dirty: number;
}

export interface WorkspacePayload {
  session: WorkspaceSessionSummary;
  origin_label: string;
  back_label: string;
  workspace_state: WorkspaceSessionSummary["workspace_state"];
  source_rows: [string, string][];
  provider_summary: string;
  editor_defaults: HighlightEditor;
  editor_defaults_hint: string;
  highlights: WorkspaceHighlight[];
  default_selected_ids: string[];
  queue_summary: QueueSummary;
  output_clips: OutputClipRecord[];
}

export interface AIProviderConfig {
  base_url?: string;
  api_key?: string;
  model?: string;
  system_message?: string;
  tts_voice?: string;
}

export interface AIProviderSettings {
  _provider_type?: string;
  highlight_finder?: AIProviderConfig;
  caption_maker?: AIProviderConfig;
  hook_maker?: AIProviderConfig;
  [key: string]: unknown;
}

export interface ProviderTypeResponse {
  provider_type: string;
}

export interface CampaignListResponse {
  campaigns: Campaign[];
}

export interface SessionListResponse {
  sessions: SessionSummary[];
}

export interface CampaignDetailResponse {
  status: string;
  detail?: CampaignDetailPayload;
  message?: string;
}

export interface WorkspaceResponse {
  status: string;
  workspace?: WorkspacePayload;
  message?: string;
}

export interface ValidateProviderResponse {
  status: string;
  message?: string;
}

export interface ModelListResponse {
  models: string[];
}
