"use client";

import { useRef, useState } from "react";
import { CheckCircle2, EyeOff, FolderOpen, KeyRound, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";
import type { AIProviderConfig, AppSettings } from "@/shared/schemas/settings";
import { trpc } from "@/features/trpc/client";

const providerCards: Array<{
  key: keyof AppSettings["aiProviders"];
  title: string;
}> = [
  { key: "highlightFinder", title: "Highlight finder" },
  { key: "captionMaker", title: "Caption maker" },
  { key: "hookMaker", title: "Hook maker" },
  { key: "youtubeTitleMaker", title: "YouTube title maker" }
];

export function SettingsScreen() {
  const cookiesRef = useRef<HTMLInputElement>(null);
  const settings = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();
  const [active, setActive] = useState("AI providers");
  const [providerDrafts, setProviderDrafts] = useState<Partial<AppSettings["aiProviders"]>>({});
  const [outputDirectory, setOutputDirectory] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const updateProvider = trpc.settings.updateProvider.useMutation({
    onSuccess: async () => {
      setMessage("Provider saved.");
      await utils.settings.get.invalidate();
    }
  });
  const updateOutput = trpc.settings.updateOutputDirectory.useMutation({
    onSuccess: async () => {
      setMessage("Output directory saved.");
      await utils.settings.get.invalidate();
    }
  });
  const validateProvider = trpc.settings.validateProvider.useMutation({
    onSuccess: (result) => setMessage(result.message),
    onError: (error) => setMessage(error.message)
  });

  function setProviderField(
    task: keyof AppSettings["aiProviders"],
    field: keyof AIProviderConfig,
    value: string | number
  ) {
    setProviderDrafts((current) => {
      const base = current[task] ?? settings.data?.aiProviders[task];
      if (!base) {
        return current;
      }
      return {
        ...current,
        [task]: {
          ...base,
          [field]: value
        }
      };
    });
  }

  async function uploadCookies(file: File) {
    const response = await fetch("/api/settings/cookies", {
      method: "POST",
      body: await file.text()
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Cookie upload failed");
    }
    setMessage("cookies.txt saved.");
    await utils.settings.get.invalidate();
  }

  const tabs = ["AI providers", "Caption styles", "Output", "Cookies"];
  const currentOutputDirectory = outputDirectory ?? settings.data?.outputDirectory ?? "./storage/output";

  return (
    <div className="mx-auto grid min-h-screen max-w-[1360px] gap-8 px-8 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500">Settings</p>
          <h1 className="mt-1 text-2xl font-bold">BYOK configuration</h1>
        </div>
        <Badge className="border-lime-300/40 bg-lime-300 text-black">Local only</Badge>
      </header>

      {message ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-200">
          {message}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_1fr]">
        <aside className="h-max rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setActive(item)}
              className={`flex h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold ${
                active === item ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </aside>

        <div className="grid gap-6">
          {active === "AI providers" && settings.data ? (
            <section className="grid gap-4">
              <h2 className="text-lg font-semibold">AI providers</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {providerCards.map((provider) => {
                  const value = providerDrafts[provider.key] ?? settings.data.aiProviders[provider.key];
                  const busy =
                    updateProvider.isPending || validateProvider.isPending || settings.isLoading;
                  return (
                    <article
                      key={provider.key}
                      className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 place-items-center rounded-lg bg-zinc-900">
                            <KeyRound className="h-5 w-5 text-lime-300" aria-hidden="true" />
                          </span>
                          <div>
                            <h3 className="font-semibold">{provider.title}</h3>
                            <p className="text-sm text-zinc-500">{value.model || "No model"}</p>
                          </div>
                        </div>
                        <Badge>BYOK</Badge>
                      </div>
                      <SelectField
                        label="Provider"
                        value={value.provider}
                        onChange={(next) => setProviderField(provider.key, "provider", next)}
                        options={[
                          { label: "OpenAI", value: "openai" },
                          { label: "Groq", value: "groq" },
                          { label: "Anthropic", value: "anthropic" },
                          { label: "Gemini", value: "gemini" },
                          { label: "Custom", value: "custom" }
                        ]}
                      />
                      <label className="grid gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Base URL
                        </span>
                        <Input
                          value={value.baseUrl}
                          onChange={(event) => setProviderField(provider.key, "baseUrl", event.target.value)}
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          API key
                        </span>
                        <div className="relative">
                          <Input
                            value={value.apiKey}
                            onChange={(event) => setProviderField(provider.key, "apiKey", event.target.value)}
                            placeholder="sk-..."
                            className="pr-11"
                          />
                          <EyeOff className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        </div>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Model
                        </span>
                        <Input
                          value={value.model}
                          onChange={(event) => setProviderField(provider.key, "model", event.target.value)}
                        />
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busy}
                          onClick={() => updateProvider.mutate({ task: provider.key, config: value })}
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => validateProvider.mutate({ task: provider.key })}
                        >
                          Validate
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {active === "Caption styles" ? (
            <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Caption styles</h2>
                <Badge>{DEFAULT_CAPTION_PRESETS.length} presets</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                {DEFAULT_CAPTION_PRESETS.map((preset) => (
                  <div key={preset.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <div className="grid aspect-[4/3] place-items-center rounded-lg bg-zinc-800 text-center text-sm font-black uppercase">
                      <span style={{ color: preset.config.wordHighlightColor ?? preset.config.textColor }}>
                        PaunClip
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold">{preset.name}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {active === "Output" ? (
            <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="text-lg font-semibold">Output</h2>
              <label className="mt-4 grid gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Directory
                </span>
                <div className="relative">
                <Input
                    value={currentOutputDirectory}
                    onChange={(event) => setOutputDirectory(event.target.value)}
                    className="pr-11"
                  />
                  <FolderOpen className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                </div>
              </label>
              <Button
                className="mt-4"
                variant="primary"
                onClick={() => updateOutput.mutate(currentOutputDirectory)}
                disabled={updateOutput.isPending}
              >
                Save output directory
              </Button>
            </section>
          ) : null}

          {active === "Cookies" ? (
            <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <h2 className="text-lg font-semibold">Cookies</h2>
              <p className="mt-2 text-sm text-zinc-500">
                Upload Netscape-format cookies.txt for private or age-restricted YouTube videos.
              </p>
              <input
                ref={cookiesRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  uploadCookies(file).catch((error) =>
                    setMessage(error instanceof Error ? error.message : "Cookie upload failed")
                  );
                  event.currentTarget.value = "";
                }}
              />
              <div className="mt-4 flex items-center gap-3">
                <Button variant="secondary" onClick={() => cookiesRef.current?.click()}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Upload cookies.txt
                </Button>
                <Badge>{settings.data?.cookies.youtubePath ? "Configured" : "Not configured"}</Badge>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
