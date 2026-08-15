export type SkillMatchCandidate = {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  enabled: boolean;
};

export type SkillExportEntry = {
  name: string;
  description: string;
  category: string;
  keywords: string[];
  instructions: string;
};

export type SkillPackage = {
  version: "agentkey.skills.v1";
  exportedAt: string;
  skills: SkillExportEntry[];
};

export type SkillPackageParseResult =
  | { ok: true; data: SkillPackage }
  | { ok: false; error: string };

const SKILL_PACKAGE_VERSION = "agentkey.skills.v1" as const;
const MAX_SKILLS_PER_PACKAGE = 100;

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function redactText(value: string) {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[已脱敏密钥]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}\b/gi, "Bearer [已脱敏]")
    .replace(/\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "$1=[已脱敏]");
}

function sanitizeText(value: string, maximumLength: number) {
  return redactText(value.trim()).slice(0, maximumLength);
}

function sanitizeSkill(entry: SkillExportEntry): SkillExportEntry {
  return {
    name: sanitizeText(entry.name, 120),
    description: sanitizeText(entry.description, 1200),
    category: sanitizeText(entry.category, 60) || "未分类",
    keywords: entry.keywords.map((keyword) => sanitizeText(keyword, 60)).filter(Boolean).slice(0, 12),
    instructions: sanitizeText(entry.instructions, 3000),
  };
}

export function createSkillPackage<T extends SkillExportEntry & { builtIn?: boolean }>(skills: T[], exportedAt = new Date().toISOString()): SkillPackage {
  return {
    version: SKILL_PACKAGE_VERSION,
    exportedAt,
    skills: skills
      .filter((skill) => !skill.builtIn && skill.name.trim() && skill.description.trim())
      .map((skill) => sanitizeSkill(skill)),
  };
}

export function parseSkillPackage(raw: string): SkillPackageParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "技能包文件不是有效的 JSON。" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "技能包内容格式不正确。" };
  }

  const candidate = parsed as Partial<SkillPackage>;
  if (candidate.version !== SKILL_PACKAGE_VERSION) {
    return { ok: false, error: "无法识别的 AgentKey 技能包版本。" };
  }
  if (typeof candidate.exportedAt !== "string" || !candidate.exportedAt.trim() || !Number.isFinite(Date.parse(candidate.exportedAt))) {
    return { ok: false, error: "技能包缺少有效的导出时间。" };
  }
  if (!Array.isArray(candidate.skills)) {
    return { ok: false, error: "技能包缺少技能列表。" };
  }
  if (candidate.skills.length > MAX_SKILLS_PER_PACKAGE) {
    return { ok: false, error: `单次最多导入 ${MAX_SKILLS_PER_PACKAGE} 项技能。` };
  }

  const skills: SkillExportEntry[] = [];
  for (const rawSkill of candidate.skills) {
    if (!rawSkill || typeof rawSkill !== "object" || Array.isArray(rawSkill)) {
      return { ok: false, error: "技能包中包含无效技能项。" };
    }
    const skill = rawSkill as Partial<SkillExportEntry>;
    if (typeof skill.name !== "string" || !skill.name.trim() || typeof skill.description !== "string" || !skill.description.trim()) {
      return { ok: false, error: "每项技能都需要名称和说明。" };
    }
    if (!Array.isArray(skill.keywords) || skill.keywords.some((keyword) => typeof keyword !== "string")) {
      return { ok: false, error: "每项技能都需要字符串关键词列表。" };
    }
    skills.push(sanitizeSkill({
      name: skill.name,
      description: skill.description,
      category: typeof skill.category === "string" ? skill.category : "未分类",
      keywords: skill.keywords,
      instructions: typeof skill.instructions === "string" ? skill.instructions : "",
    }));
  }

  return { ok: true, data: { version: SKILL_PACKAGE_VERSION, exportedAt: candidate.exportedAt, skills } };
}

export function matchSkills<T extends SkillMatchCandidate>(skills: T[], prompt: string, limit = 3): T[] {
  const query = normalize(prompt);
  if (!query) return [];

  return skills
    .filter((skill) => skill.enabled)
    .map((skill) => {
      const searchable = [skill.name, skill.description, ...skill.keywords].map(normalize).filter(Boolean);
      const score = searchable.reduce((total, phrase) => total + (query.includes(phrase) ? Math.max(2, phrase.length) : 0), 0);
      return { skill, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name, "zh-CN"))
    .slice(0, Math.max(1, limit))
    .map((item) => item.skill);
}
