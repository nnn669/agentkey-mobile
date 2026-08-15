export type SkillMatchCandidate = {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  enabled: boolean;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
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
