import { runCli } from "./cli.js";

runCli(process.argv.slice(2)).then((result) => {
  process.exitCode = result.exitCode;
});
