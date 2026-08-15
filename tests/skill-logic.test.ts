import { describe, expect, it } from "vitest";

import { matchSkills } from "../lib/skill-logic";

describe("本地技能匹配", () => {
  const skills = [
    { id: "mcp", name: "MCP 工具编排", description: "安全调用远程工具", keywords: ["mcp", "工具"], enabled: true },
    { id: "shell", name: "受限终端安全执行", description: "白名单命令沙盒", keywords: ["终端", "shell", "沙盒"], enabled: true },
    { id: "off", name: "已停用技能", description: "不应进入任务", keywords: ["工具"], enabled: false },
  ];

  it("按关键词匹配启用技能并排除停用技能", () => {
    expect(matchSkills(skills, "请使用 MCP 工具处理终端任务").map((skill) => skill.id)).toEqual(["mcp", "shell"]);
  });

  it("在没有匹配关键词时不返回技能", () => {
    expect(matchSkills(skills, "整理一段普通文本")).toEqual([]);
  });
});
