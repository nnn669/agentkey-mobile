export type SandboxFile = {
  path: string;
  content: string;
};

export type SandboxWorkspace = {
  cwd: string;
  files: SandboxFile[];
};

export type SandboxCommandResult = {
  command: string;
  exitCode: number;
  output: string;
  ok: boolean;
};

export type SandboxCommandProposal = {
  command: string;
  reason: string;
};

export const SANDBOX_ALLOWED_COMMANDS = ["help", "pwd", "ls", "cat", "echo", "grep", "date"] as const;

const blockedSyntax = /[;&|`$><\\\n\r]/;

export function createSandboxWorkspace(): SandboxWorkspace {
  return {
    cwd: "/workspace",
    files: [
      { path: "README.md", content: "# AgentKey 虚拟工作区\n\n这里只包含演示文件。沙盒不会访问设备文件、网络、环境变量或密钥。" },
      { path: "context.txt", content: "当前会话：AgentKey 受限终端\n权限：只读虚拟工作区\n网络：已禁用" },
      { path: "tools.txt", content: "允许命令：help, pwd, ls, cat, echo, grep, date" },
    ],
  };
}

function result(command: string, ok: boolean, output: string, exitCode = ok ? 0 : 1): SandboxCommandResult {
  return { command, ok, output, exitCode };
}

function validatePath(rawPath: string, workspace: SandboxWorkspace) {
  const normalized = rawPath.replace(/^\.\//, "").trim();
  if (!normalized || normalized.startsWith("/") || normalized.includes("..") || normalized.includes("\\")) return undefined;
  return workspace.files.find((file) => file.path === normalized);
}

export function isSandboxCommandAllowed(command: string) {
  const trimmed = command.trim();
  if (!trimmed || blockedSyntax.test(trimmed)) return false;
  const [program] = trimmed.split(/\s+/, 1);
  return (SANDBOX_ALLOWED_COMMANDS as readonly string[]).includes(program.toLowerCase());
}

export function executeSandboxCommand(command: string, workspace: SandboxWorkspace, now = new Date()): SandboxCommandResult {
  const trimmed = command.trim();
  if (!trimmed) return result(command, false, "未提供命令。");
  if (blockedSyntax.test(trimmed)) return result(trimmed, false, "命令包含管道、重定向、变量、命令替换或换行等受限语法，已拒绝执行。");
  const [program = "", ...args] = trimmed.split(/\s+/);
  const normalizedProgram = program.toLowerCase();
  if (!(SANDBOX_ALLOWED_COMMANDS as readonly string[]).includes(normalizedProgram)) {
    return result(trimmed, false, `“${program}” 不在白名单中。允许：${SANDBOX_ALLOWED_COMMANDS.join(", ")}`);
  }

  if (normalizedProgram === "help") return result(trimmed, true, `受限命令：${SANDBOX_ALLOWED_COMMANDS.join(", ")}\n不会执行系统进程、网络请求或设备文件操作。`);
  if (normalizedProgram === "pwd") return args.length ? result(trimmed, false, "pwd 不接受参数。") : result(trimmed, true, workspace.cwd);
  if (normalizedProgram === "date") return args.length ? result(trimmed, false, "date 不接受参数。") : result(trimmed, true, now.toISOString());
  if (normalizedProgram === "ls") return args.length ? result(trimmed, false, "ls 仅支持查看虚拟工作区根目录。") : result(trimmed, true, workspace.files.map((file) => file.path).join("\n") || "（虚拟工作区为空）");
  if (normalizedProgram === "echo") return result(trimmed, true, args.join(" "));

  if (normalizedProgram === "cat") {
    if (args.length !== 1) return result(trimmed, false, "cat 需要且仅需要一个虚拟文件路径。")
    const file = validatePath(args[0], workspace);
    return file ? result(trimmed, true, file.content) : result(trimmed, false, "文件不存在，或路径超出虚拟工作区。")
  }

  if (args.length < 2) return result(trimmed, false, "grep 需要提供文本和一个虚拟文件路径。")
  const [needle, ...pathParts] = args;
  const file = validatePath(pathParts.join(" "), workspace);
  if (!file) return result(trimmed, false, "文件不存在，或路径超出虚拟工作区。")
  const matches = file.content.split("\n").map((line, index) => ({ line, index: index + 1 })).filter((item) => item.line.toLowerCase().includes(needle.toLowerCase()));
  return result(trimmed, true, matches.length ? matches.map((item) => `${item.index}:${item.line}`).join("\n") : "（未找到匹配文本）");
}

export function deriveSandboxCommandProposal(prompt: string): SandboxCommandProposal | undefined {
  const explicit = prompt.match(/(?:\/shell|终端(?:执行|运行|命令)?|shell)\s*[:：]\s*([^\n]+)/i)?.[1]?.trim();
  if (explicit && isSandboxCommandAllowed(explicit)) return { command: explicit, reason: "模型根据任务中的显式终端请求提出白名单命令。" };

  const normalized = prompt.toLowerCase();
  if (normalized.includes("查看虚拟工作区") || normalized.includes("列出沙盒文件")) return { command: "ls", reason: "模型请求查看受限虚拟工作区。" };
  if (normalized.includes("读取沙盒说明") || normalized.includes("查看沙盒说明")) return { command: "cat README.md", reason: "模型请求读取虚拟工作区说明。" };
  return undefined;
}
