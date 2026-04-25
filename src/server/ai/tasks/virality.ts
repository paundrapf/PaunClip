import "server-only";

export type ViralityFactors = {
  hookStrength: number;
  engagementPotential: number;
  trendingKeywords: number;
  emotionScore: number;
  pacing: number;
  durationOptimal: number;
};

export function calculateViralityScore(factors: ViralityFactors) {
  const weights: Record<keyof ViralityFactors, number> = {
    hookStrength: 0.25,
    engagementPotential: 0.2,
    trendingKeywords: 0.15,
    emotionScore: 0.2,
    pacing: 0.1,
    durationOptimal: 0.1
  };

  return Math.round(
    Object.entries(weights).reduce((score, [key, weight]) => {
      return score + factors[key as keyof ViralityFactors] * weight;
    }, 0)
  );
}
