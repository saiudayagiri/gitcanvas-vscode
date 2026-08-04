import { defineConfig } from "@vscode/test-cli";
import { execFileSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// A throwaway git repo so the branches TreeView smoke test has something real to read —
// created fresh on every test run rather than committed as a fixture.
const workspaceFolder = mkdtempSync(path.join(tmpdir(), "gitcanvas-test-"));
const git = (...args) => execFileSync("git", args, { cwd: workspaceFolder, stdio: "ignore" });
const write = (file, content) => execFileSync("sh", ["-c", `printf '%s' ${JSON.stringify(content)} > ${file}`], { cwd: workspaceFolder });

git("init", "-q", "-b", "main");
git("config", "user.email", "test@example.com");
git("config", "user.name", "Test User");

write("README.md", "hello\n");
git("add", "README.md");
git("commit", "-q", "-m", "initial commit");

git("checkout", "-q", "-b", "feature/one");
write("feature.txt", "feature work\n");
git("add", "feature.txt");
git("commit", "-q", "-m", "add feature");

git("checkout", "-q", "main");
git("branch", "feature/two");

// leave some real, uncommitted working-tree state too — status parsing needs exercising
write("README.md", "hello\nmodified\n");
write("untracked.txt", "new file\n");

export default defineConfig({
  files: "out/test/**/*.test.js",
  workspaceFolder,
});
