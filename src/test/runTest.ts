import * as path from "path";
import { downloadAndUnzipVSCode, runTests } from "@vscode/test-electron";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Choose VS Code version to run tests against: 'stable' | 'insiders' | '1.XX.X'
    const version = (process.env.VSCODE_TEST_VERSION ?? "stable") as
      | "stable"
      | "insiders"
      | `${number}.${number}.${number}`;
    const vscodeExecutablePath = await downloadAndUnzipVSCode(version);

    // Run the integration tests
    await runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath });
  } catch (err) {
    console.error("Failed to run tests");
    process.exit(1);
  }
}

main();
