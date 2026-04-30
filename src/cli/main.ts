import { bootstrapCliRuntime } from "./runtime";

const runtime = bootstrapCliRuntime(process.argv.slice(2));
const { runCli } = await import("./program");

const exitCode = await runCli(process.argv.slice(2), runtime);
process.exit(exitCode);
