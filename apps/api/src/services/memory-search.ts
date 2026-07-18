const RRF_K = 60;

export interface RankedCandidate {
  id: string;
  rank: number;
}

export interface FusedRank {
  id: string;
  score: number;
  lexicalRank: number | null;
  vectorRank: number | null;
}

export function fuseSearchRanks(
  lexical: RankedCandidate[],
  vector: RankedCandidate[],
  limit: number,
): FusedRank[] {
  const fused = new Map<string, FusedRank>();

  for (const candidate of lexical) {
    fused.set(candidate.id, {
      id: candidate.id,
      score: 1 / (RRF_K + candidate.rank),
      lexicalRank: candidate.rank,
      vectorRank: null,
    });
  }

  for (const candidate of vector) {
    const current = fused.get(candidate.id);
    if (current) {
      current.vectorRank = candidate.rank;
      current.score += 1 / (RRF_K + candidate.rank);
    } else {
      fused.set(candidate.id, {
        id: candidate.id,
        score: 1 / (RRF_K + candidate.rank),
        lexicalRank: null,
        vectorRank: candidate.rank,
      });
    }
  }

  return [...fused.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.lexicalRank ?? Number.MAX_SAFE_INTEGER) - (b.lexicalRank ?? Number.MAX_SAFE_INTEGER) ||
        (a.vectorRank ?? Number.MAX_SAFE_INTEGER) - (b.vectorRank ?? Number.MAX_SAFE_INTEGER) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, limit));
}
