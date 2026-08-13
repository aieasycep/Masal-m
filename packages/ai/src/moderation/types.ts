export interface ModerationVerdict {
  safe: boolean;
  /** Machine-readable category when unsafe (e.g. "violence", "adult_theme"). */
  category?: string;
}

export interface ContentModerator {
  readonly name: string;
  /** Pre-check: is this user-supplied story idea appropriate for a children's story? */
  checkStoryIdea(idea: string, language: 'tr' | 'en'): Promise<ModerationVerdict>;
  /** Post-check: is this generated story text safe for the given audience? */
  checkStoryText(text: string, language: 'tr' | 'en'): Promise<ModerationVerdict>;
}
