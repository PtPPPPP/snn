export interface SnnHarnessToolInfo {
  readonly id: string;
  readonly dshToolName: string;
  readonly title: string;
  readonly summary: string;
  readonly category: "workspace" | "document" | "spreadsheet" | "network" | "simulation";
  readonly risk: "READ" | "WRITE" | "EXTERNAL";
}

export interface SnnHarnessSkillInfo {
  readonly id: string;
  readonly name: string;
  readonly badge: string;
  readonly description: string;
  readonly instructions: string;
  readonly requiredTools: readonly string[];
}

export interface SnnHarnessPresetInfo {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly badge: string;
  readonly summary: string;
  readonly defaultSkillId: string;
  readonly starterPrompts: readonly string[];
}

export type SnnHarnessToolMeta = SnnHarnessToolInfo;
export type SnnHarnessSkill = SnnHarnessSkillInfo;
export type SnnHarnessPreset = SnnHarnessPresetInfo;

export interface SnnHarnessCatalog {
  readonly presets: readonly SnnHarnessPreset[];
  readonly skills: readonly SnnHarnessSkill[];
  readonly tools: readonly SnnHarnessToolMeta[];
}

export declare const SNN_HARNESS_TOOLS: readonly SnnHarnessToolInfo[];
export declare const SNN_HARNESS_SKILLS: readonly SnnHarnessSkillInfo[];
export declare const SNN_HARNESS_PRESETS: readonly SnnHarnessPresetInfo[];

export declare function findHarnessPreset(presetId: string | null | undefined): SnnHarnessPresetInfo | null;
export declare function findHarnessSkill(skillId: string | null | undefined): SnnHarnessSkillInfo | null;
export declare function findHarnessTool(toolNameOrId: string | null | undefined): SnnHarnessToolInfo | null;
