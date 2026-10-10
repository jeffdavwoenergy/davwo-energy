/** Suggested Ask ANI™ questions when a Solar/Battery/Fleet device is selected. */
export const DEVICE_PROMPTS: Record<"solar" | "battery" | "fleet", string[]> = {
  fleet: ["Which vehicles won't be ready tomorrow?", "What's wrong with the fleet?", "When should we charge tonight?"],
  solar: ["How are the solar panels doing?", "Which arrays need attention?", "How much are we exporting?"],
  battery: ["How is the battery doing?", "What's the battery plan tonight?", "Is the battery saving money?"],
};
