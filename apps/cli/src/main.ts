import { runCli } from "./cli.js";

const result = runCli(process.argv.slice(2));
process.exitCode = result.exitCode;
