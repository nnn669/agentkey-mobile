import { describe, expect, it } from "vitest";

import { createSkillPackage, matchSkills, parseSkillPackage } from "../lib/skill-logic";

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

describe("技能包 JSON", () => {
  const customSkill = {
    id: "skill-custom",
    name: "需求梳理",
    description: "将任务拆成可执行步骤。",
    category: "任务能力",
    keywords: ["需求", "计划"],
    instructions: "先澄清目标和边界。",
    enabled: true,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  };

  it("导出时忽略内置技能和运行时字段", () => {
    const packageData = createSkillPackage([
      customSkill,
      { ...customSkill, id: "skill-built-in", name: "内置安全", builtIn: true },
    ], "2026-08-15T00:00:00.000Z");

    expect(packageData).toMatchObject({ version: "agentkey.skills.v1", exportedAt: "2026-08-15T00:00:00.000Z" });
    expect(packageData.skills).toEqual([{
      name: "需求梳理",
      description: "将任务拆成可执行步骤。",
      category: "任务能力",
      keywords: ["需求", "计划"],
      instructions: "先澄清目标和边界。",
    }]);
    expect(packageData.skills[0]).not.toHaveProperty("id");
    expect(packageData.skills[0]).not.toHaveProperty("enabled");
  });

  it("解析有效的技能包 JSON", () => {
    const packageData = createSkillPackage([customSkill], "2026-08-15T00:00:00.000Z");
    expect(parseSkillPackage(JSON.stringify(packageData))).toEqual({ ok: true, data: packageData });
  });

  it("拒绝缺少技能列表或技能必要字段的包", () => {
    expect(parseSkillPackage(JSON.stringify({ version: "agentkey.skills.v1", exportedAt: "2026-08-15T00:00:00.000Z" }))).toEqual({ ok: false, error: "技能包缺少技能列表。" });
    expect(parseSkillPackage(JSON.stringify({ version: "agentkey.skills.v1", exportedAt: "2026-08-15T00:00:00.000Z", skills: [{ name: "缺关键词", description: "测试" }] }))).toEqual({ ok: false, error: "每项技能都需要字符串关键词列表。" });
  });

  it("拒绝非 JSON 文本", () => {
    expect(parseSkillPackage("not-json")).toEqual({ ok: false, error: "技能包文件不是有效的 JSON。" });
  });
});
