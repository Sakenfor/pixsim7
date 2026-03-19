"""
Primitive Projection Shadow-Mode Evaluation Script.

Runs the prompt parser with projection on/off against a labeled corpus
and computes quality metrics for the token_overlap_v1 matcher.

Usage:
    python scripts/tests/block_ops/primitive_projection/eval_primitive_projection.py [--threshold 0.45] [--verbose]

Produces:
    - Precision@1, coverage, false-positive rate by category
    - Top false positives and missed matches
    - Summary table printed to stdout
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

# Ensure repo-root imports (pixsim7 package) work when running as a direct script.
_HERE = Path(__file__).resolve()
for _parent in (_HERE, *_HERE.parents):
    if (_parent / "docs").is_dir() and (_parent / "pixsim7").is_dir():
        _repo_root = str(_parent)
        if _repo_root not in sys.path:
            sys.path.insert(0, _repo_root)
        break

# ---------------------------------------------------------------------------
# Imports from the projection module (no DB, no LLM)
# ---------------------------------------------------------------------------
from pixsim7.backend.main.services.prompt.parser.primitive_projection import (
    _get_primitive_index,
    enrich_candidates_with_primitive_projection,
    match_candidate_to_primitive,
    refresh_primitive_projection_cache,
)
from pixsim7.backend.main.services.prompt.parser.dsl_adapter import (
    parse_prompt_to_candidates,
)


CORPUS_PATH = Path(__file__).parent / "eval_corpus.json"
DEFAULT_REPORT_PATH = Path("docs/plans/prompt-primitive-projection-eval.md")


def _resolve_repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in (here, *here.parents):
        if (parent / "docs").is_dir() and (parent / "pixsim7").is_dir():
            return parent
    # Conservative fallback for unusual execution roots.
    return here.parents[3]

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class EvalEntry:
    id: str
    text: str
    category: str
    expected_block_prefix: Optional[str]
    expected_category: Optional[str]
    notes: str = ""


@dataclass
class EvalResult:
    entry: EvalEntry
    matched_block_id: Optional[str] = None
    matched_score: Optional[float] = None
    matched_category: Optional[str] = None
    matched_role: Optional[str] = None
    overlap_tokens: List[str] = field(default_factory=list)
    all_candidate_matches: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def has_match(self) -> bool:
        return self.matched_block_id is not None

    @property
    def expected_match(self) -> bool:
        return self.entry.expected_block_prefix is not None

    @property
    def is_true_positive(self) -> bool:
        """Match produced AND matches expected prefix."""
        if not self.has_match or not self.expected_match:
            return False
        return self.matched_block_id.startswith(self.entry.expected_block_prefix)

    @property
    def is_false_positive(self) -> bool:
        """Backward-compatible aggregate of wrong-positive + negative FP."""
        return self.is_wrong_positive or self.is_negative_false_positive

    @property
    def is_wrong_positive(self) -> bool:
        """Expected a match, but predicted a non-matching primitive."""
        if not self.has_match or not self.expected_match:
            return False
        return not self.matched_block_id.startswith(self.entry.expected_block_prefix)

    @property
    def is_negative_false_positive(self) -> bool:
        """No match expected, but matcher still produced a prediction."""
        return self.has_match and not self.expected_match

    @property
    def is_missed(self) -> bool:
        """Expected match but none produced."""
        return self.expected_match and not self.has_match

    @property
    def is_true_negative(self) -> bool:
        """No match expected and none produced."""
        return not self.expected_match and not self.has_match


# ---------------------------------------------------------------------------
# Corpus loading
# ---------------------------------------------------------------------------

def load_corpus(path: Path) -> List[EvalEntry]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    entries = []
    for item in data.get("corpus", []):
        entries.append(EvalEntry(
            id=item["id"],
            text=item["text"],
            category=item["category"],
            expected_block_prefix=item.get("expected_block_prefix"),
            expected_category=item.get("expected_category"),
            notes=item.get("notes", ""),
        ))
    return entries


# ---------------------------------------------------------------------------
# Evaluation core
# ---------------------------------------------------------------------------

async def evaluate_entry(
    entry: EvalEntry,
    *,
    threshold: float,
    primitive_index: Sequence[Dict[str, Any]],
) -> EvalResult:
    """Run parser + projection for one corpus entry."""
    result_obj = EvalResult(entry=entry)

    # Run parser with projection ON
    parsed = await parse_prompt_to_candidates(
        entry.text,
        parser_config={"primitive_projection_mode": "shadow"},
    )
    candidates = parsed.get("candidates", [])

    # Also do manual matching against the index for comparison
    for candidate in candidates:
        pm = (candidate.get("metadata") or {}).get("primitive_match")
        if pm and pm.get("score", 0) >= threshold:
            result_obj.all_candidate_matches.append({
                "candidate_text": candidate.get("text", ""),
                "candidate_role": candidate.get("role"),
                "block_id": pm.get("block_id"),
                "score": pm.get("score", 0),
                "category": pm.get("category"),
                "role": pm.get("role"),
                "overlap_tokens": pm.get("overlap_tokens", []),
            })

    # Pick best match across all candidates (highest score)
    if result_obj.all_candidate_matches:
        best = max(result_obj.all_candidate_matches, key=lambda m: m["score"])
        result_obj.matched_block_id = best["block_id"]
        result_obj.matched_score = best["score"]
        result_obj.matched_category = best["category"]
        result_obj.matched_role = best["role"]
        result_obj.overlap_tokens = best["overlap_tokens"]

    return result_obj


async def run_evaluation(
    corpus: List[EvalEntry],
    *,
    threshold: float,
) -> List[EvalResult]:
    """Evaluate all corpus entries."""
    refresh_primitive_projection_cache()
    primitive_index = _get_primitive_index()

    print(f"Primitive index: {len(primitive_index)} entries")
    print(f"Corpus: {len(corpus)} entries")
    print(f"Threshold: {threshold}")
    print()

    results = []
    for entry in corpus:
        result = await evaluate_entry(
            entry,
            threshold=threshold,
            primitive_index=primitive_index,
        )
        results.append(result)
    return results


# ---------------------------------------------------------------------------
# Metrics computation
# ---------------------------------------------------------------------------

@dataclass
class CategoryMetrics:
    total: int = 0
    expected_positives: int = 0
    expected_negatives: int = 0
    true_positives: int = 0
    wrong_positives: int = 0
    negative_false_positives: int = 0
    missed: int = 0
    true_negatives: int = 0

    @property
    def false_positives(self) -> int:
        """All precision-impacting false positives (legacy aggregate)."""
        return self.wrong_positives + self.negative_false_positives

    @property
    def precision_at_1(self) -> float:
        total_positives = self.true_positives + self.false_positives
        if total_positives == 0:
            return 1.0
        return self.true_positives / total_positives

    @property
    def coverage(self) -> float:
        if self.expected_positives == 0:
            return 1.0
        return self.true_positives / self.expected_positives

    @property
    def false_positive_rate(self) -> float:
        denom = self.negative_false_positives + self.true_negatives
        if denom == 0:
            return 0.0
        return self.negative_false_positives / denom


def compute_metrics(results: List[EvalResult]) -> Dict[str, CategoryMetrics]:
    by_category: Dict[str, CategoryMetrics] = defaultdict(CategoryMetrics)

    for r in results:
        cat = r.entry.category
        m = by_category[cat]
        m.total += 1
        if r.expected_match:
            m.expected_positives += 1
        else:
            m.expected_negatives += 1
        if r.is_true_positive:
            m.true_positives += 1
        elif r.is_wrong_positive:
            m.wrong_positives += 1
        elif r.is_negative_false_positive:
            m.negative_false_positives += 1
        elif r.is_missed:
            m.missed += 1
        elif r.is_true_negative:
            m.true_negatives += 1

    # Overall
    overall = CategoryMetrics()
    for m in by_category.values():
        overall.total += m.total
        overall.expected_positives += m.expected_positives
        overall.expected_negatives += m.expected_negatives
        overall.true_positives += m.true_positives
        overall.wrong_positives += m.wrong_positives
        overall.negative_false_positives += m.negative_false_positives
        overall.missed += m.missed
        overall.true_negatives += m.true_negatives
    by_category["OVERALL"] = overall

    return dict(by_category)


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def print_metrics_table(metrics: Dict[str, CategoryMetrics]) -> str:
    lines = []
    header = (
        f"{'Category':<20} {'Total':>5} {'TP':>4} {'FP-':>4} {'Wrong':>5} "
        f"{'Miss':>4} {'TN':>4} {'P@1':>6} {'Cover':>6} {'FPR':>6}"
    )
    lines.append(header)
    lines.append("-" * len(header))

    order = sorted(k for k in metrics if k != "OVERALL")
    order.append("OVERALL")

    for cat in order:
        m = metrics[cat]
        lines.append(
            f"{cat:<20} {m.total:>5} {m.true_positives:>4} {m.negative_false_positives:>4} "
            f"{m.wrong_positives:>5} {m.missed:>4} {m.true_negatives:>4} "
            f"{m.precision_at_1:>6.1%} {m.coverage:>6.1%} {m.false_positive_rate:>6.1%}"
        )

    text = "\n".join(lines)
    print(text)
    return text


def collect_false_positives(results: List[EvalResult], *, limit: int = 20) -> List[EvalResult]:
    fps = [r for r in results if r.is_false_positive]
    fps.sort(key=lambda r: -(r.matched_score or 0))
    return fps[:limit]


def collect_missed(results: List[EvalResult], *, limit: int = 20) -> List[EvalResult]:
    missed = [r for r in results if r.is_missed]
    return missed[:limit]


def print_detail_list(label: str, items: List[EvalResult]) -> str:
    lines = [f"\n{'=' * 60}", f"{label} ({len(items)} shown)", "=" * 60]
    for r in items:
        lines.append(f"  [{r.entry.id}] \"{r.entry.text}\"")
        lines.append(f"    category={r.entry.category}, expected={r.entry.expected_block_prefix}")
        if r.has_match:
            lines.append(f"    GOT: {r.matched_block_id} (score={r.matched_score:.3f}, overlap={r.overlap_tokens})")
        else:
            lines.append(f"    GOT: <no match>")
        if r.entry.notes:
            lines.append(f"    note: {r.entry.notes}")
        lines.append("")
    text = "\n".join(lines)
    print(text)
    return text


def print_index_summary(primitive_index: Sequence[Dict[str, Any]]) -> str:
    lines = ["\nPrimitive Index Summary:", "-" * 40]
    by_cat: Dict[str, int] = defaultdict(int)
    by_pack: Dict[str, int] = defaultdict(int)
    for entry in primitive_index:
        cat = entry.get("category") or "unknown"
        pack = entry.get("package_name") or "unknown"
        by_cat[cat] += 1
        by_pack[pack] += 1

    lines.append(f"  Total blocks indexed: {len(primitive_index)}")
    lines.append(f"  By category:")
    for cat in sorted(by_cat):
        lines.append(f"    {cat}: {by_cat[cat]}")
    lines.append(f"  By pack:")
    for pack in sorted(by_pack):
        lines.append(f"    {pack}: {by_pack[pack]}")

    text = "\n".join(lines)
    print(text)
    return text


# ---------------------------------------------------------------------------
# Threshold sweep
# ---------------------------------------------------------------------------

def sweep_thresholds(
    results_at_default: List[EvalResult],
    corpus: List[EvalEntry],
    primitive_index: Sequence[Dict[str, Any]],
) -> str:
    """Quick threshold sweep using already-captured match scores."""
    # Collect all scores from all candidate matches across all results
    all_scores: List[Dict[str, Any]] = []
    for r in results_at_default:
        for m in r.all_candidate_matches:
            all_scores.append({
                "entry_id": r.entry.id,
                "expected": r.entry.expected_block_prefix,
                "block_id": m["block_id"],
                "score": m["score"],
            })

    thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]
    lines = ["\nThreshold Sweep:", "-" * 80]
    header = f"{'Threshold':>10} {'Matches':>8} {'TP':>5} {'FP-':>5} {'Wrong':>6} {'P@1':>7} {'FPR':>7}"
    lines.append(header)
    lines.append("-" * len(header))

    for thresh in thresholds:
        tp = fp_neg = wrong = total_matches = 0
        for r in results_at_default:
            # Recompute best match at this threshold
            valid = [m for m in r.all_candidate_matches if m["score"] >= thresh]
            if not valid:
                continue
            best = max(valid, key=lambda m: m["score"])
            total_matches += 1
            if r.entry.expected_block_prefix and best["block_id"].startswith(r.entry.expected_block_prefix):
                tp += 1
            elif r.entry.expected_block_prefix:
                wrong += 1
            else:
                fp_neg += 1

        p1 = tp / max(tp + fp_neg + wrong, 1)
        # Standard FPR over expected negatives only.
        neg_entries = sum(1 for r in results_at_default if not r.expected_match)
        tn = max(neg_entries - fp_neg, 0)
        fpr = fp_neg / max(fp_neg + tn, 1)
        lines.append(
            f"{thresh:>10.2f} {total_matches:>8} {tp:>5} {fp_neg:>5} {wrong:>6} {p1:>7.1%} {fpr:>7.1%}"
        )

    text = "\n".join(lines)
    print(text)
    return text


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def async_main(args: argparse.Namespace) -> None:
    corpus_path = Path(args.corpus).resolve()
    corpus = load_corpus(corpus_path)
    print(f"Loaded {len(corpus)} corpus entries from {corpus_path}")

    # Count by category
    cat_counts: Dict[str, int] = defaultdict(int)
    for e in corpus:
        cat_counts[e.category] += 1
    for cat in sorted(cat_counts):
        print(f"  {cat}: {cat_counts[cat]}")
    print()

    results = await run_evaluation(corpus, threshold=args.threshold)

    # Print index summary
    refresh_primitive_projection_cache()
    idx = _get_primitive_index()
    idx_summary = print_index_summary(idx)

    # Metrics
    metrics = compute_metrics(results)
    print()
    metrics_text = print_metrics_table(metrics)

    # Detail lists
    fps = collect_false_positives(results, limit=20)
    fp_text = print_detail_list("Top False Positives", fps)

    missed = collect_missed(results, limit=20)
    missed_text = print_detail_list("Top Missed Matches", missed)

    # Threshold sweep (reuses captured data, no re-run)
    sweep_text = sweep_thresholds(results, corpus, idx)

    if args.verbose:
        # Print all results
        print("\n" + "=" * 60)
        print("ALL RESULTS")
        print("=" * 60)
        for r in results:
            status = "TP" if r.is_true_positive else "FP" if r.is_false_positive else "MISS" if r.is_missed else "TN"
            match_str = f"{r.matched_block_id} ({r.matched_score:.3f})" if r.has_match else "<none>"
            print(f"  [{status:4}] {r.entry.id}: \"{r.entry.text[:60]}\" -> {match_str}")

    # Generate markdown report
    report_rel = Path(args.report) if args.report else DEFAULT_REPORT_PATH
    report_path = (_resolve_repo_root() / report_rel).resolve()
    generate_report(report_path, metrics, fps, missed, results, idx, args.threshold, sweep_text, idx_summary)
    print(f"\nReport written to: {report_path}")


def generate_report(
    path: Path,
    metrics: Dict[str, CategoryMetrics],
    false_positives: List[EvalResult],
    missed: List[EvalResult],
    all_results: List[EvalResult],
    primitive_index: Sequence[Dict[str, Any]],
    threshold: float,
    sweep_text: str,
    idx_summary: str,
) -> None:
    """Generate the evaluation report markdown file."""
    lines: List[str] = []
    lines.append("# Primitive Projection Shadow-Mode Evaluation Report")
    lines.append("")
    lines.append("## Overview")
    lines.append("")
    lines.append(f"- **Date**: Auto-generated by `eval_primitive_projection.py`")
    lines.append(f"- **Corpus size**: {len(all_results)} prompts")
    lines.append(f"- **Index size**: {len(primitive_index)} blocks")
    lines.append(f"- **Current threshold**: {threshold}")
    lines.append(f"- **Strategy**: `token_overlap_v1`")
    lines.append("")

    # Index summary
    lines.append("## Primitive Index")
    lines.append("")
    lines.append("```")
    lines.append(idx_summary.strip())
    lines.append("```")
    lines.append("")

    # Metrics table
    lines.append("## Metrics Table")
    lines.append("")
    lines.append("| Category | Total | TP | FP- | Wrong | Miss | TN | P@1 | Coverage | FPR |")
    lines.append("|----------|------:|---:|----:|------:|-----:|---:|----:|---------:|----:|")
    order = sorted(k for k in metrics if k != "OVERALL")
    order.append("OVERALL")
    for cat in order:
        m = metrics[cat]
        lines.append(
            f"| {cat} | {m.total} | {m.true_positives} | {m.negative_false_positives} | "
            f"{m.wrong_positives} | {m.missed} | {m.true_negatives} | "
            f"{m.precision_at_1:.1%} | {m.coverage:.1%} | {m.false_positive_rate:.1%} |"
        )
    lines.append("")

    # Threshold sweep
    lines.append("## Threshold Sweep")
    lines.append("")
    lines.append("```")
    lines.append(sweep_text.strip())
    lines.append("```")
    lines.append("")

    # False positives
    lines.append("## Top 20 False Positives")
    lines.append("")
    if not false_positives:
        lines.append("_None detected._")
    else:
        lines.append("| # | ID | Prompt | Got | Score | Overlap | Expected |")
        lines.append("|---|-----|--------|-----|------:|---------|----------|")
        for i, r in enumerate(false_positives, 1):
            prompt = r.entry.text[:50].replace("|", "\\|")
            exp = r.entry.expected_block_prefix or "_none_"
            overlap = ", ".join(r.overlap_tokens[:5])
            lines.append(
                f"| {i} | {r.entry.id} | {prompt} | {r.matched_block_id} | "
                f"{r.matched_score:.3f} | {overlap} | {exp} |"
            )
    lines.append("")

    # Missed matches
    lines.append("## Top 20 Missed Matches")
    lines.append("")
    if not missed:
        lines.append("_None detected._")
    else:
        lines.append("| # | ID | Prompt | Expected | Category | Notes |")
        lines.append("|---|-----|--------|----------|----------|-------|")
        for i, r in enumerate(missed, 1):
            prompt = r.entry.text[:50].replace("|", "\\|")
            lines.append(
                f"| {i} | {r.entry.id} | {prompt} | {r.entry.expected_block_prefix} | "
                f"{r.entry.category} | {r.entry.notes} |"
            )
    lines.append("")

    # Recommendations
    overall = metrics.get("OVERALL", CategoryMetrics())
    lines.append("## Recommendation")
    lines.append("")

    if overall.false_positive_rate > 0.15:
        recommendation = "stay shadow"
        reason = f"FPR ({overall.false_positive_rate:.1%}) too high for promotion. Tune scoring first."
    elif overall.precision_at_1 < 0.70:
        recommendation = "tune threshold"
        reason = f"P@1 ({overall.precision_at_1:.1%}) below 70% target. Adjust threshold or scoring weights."
    elif overall.precision_at_1 >= 0.85 and overall.false_positive_rate <= 0.05:
        recommendation = "promote to soft influence"
        reason = f"P@1 ({overall.precision_at_1:.1%}) and FPR ({overall.false_positive_rate:.1%}) meet promotion criteria."
    else:
        recommendation = "tune threshold"
        reason = f"P@1={overall.precision_at_1:.1%}, FPR={overall.false_positive_rate:.1%}. Close but needs tuning."

    lines.append(f"**Decision: `{recommendation}`**")
    lines.append("")
    lines.append(f"**Rationale**: {reason}")
    lines.append("")

    lines.append("### Promotion Criteria")
    lines.append("")
    lines.append("| Criterion | Target | Current | Status |")
    lines.append("|-----------|--------|---------|--------|")
    p1_status = "PASS" if overall.precision_at_1 >= 0.85 else "FAIL"
    cov_status = "PASS" if overall.coverage >= 0.60 else "FAIL"
    fpr_status = "PASS" if overall.false_positive_rate <= 0.05 else "FAIL"
    lines.append(f"| Precision@1 | >= 85% | {overall.precision_at_1:.1%} | {p1_status} |")
    lines.append(f"| Coverage | >= 60% | {overall.coverage:.1%} | {cov_status} |")
    lines.append(f"| FPR | <= 5% | {overall.false_positive_rate:.1%} | {fpr_status} |")
    lines.append("")

    # Code patch suggestions
    lines.append("### Suggested Scoring Tweaks (do NOT apply yet)")
    lines.append("")
    lines.append("```python")
    lines.append("# 1. Add disambiguation penalty for single-token overlaps on common words")
    lines.append("#    In _score_entry(), after computing overlap_all:")
    lines.append("#    if len(overlap_all) == 1 and overlap_all[0] in _LOW_SIGNAL_OVERLAP_TOKENS:")
    lines.append("#        return None  # Reject single low-signal matches")
    lines.append("")
    lines.append("# 2. Add context-length normalization penalty")
    lines.append("#    Long prompts with incidental word matches score too high.")
    lines.append("#    Penalize when probe_tokens >> overlap:")
    lines.append("#    coverage_ratio = len(overlap_all) / max(len(probe_tokens), 1)")
    lines.append("#    if coverage_ratio < 0.15 and len(probe_tokens) > 8:")
    lines.append("#        score *= 0.6  # Dampen low-coverage matches in long prompts")
    lines.append("")
    lines.append("# 3. Add false-friend stop tokens to _CANDIDATE_STOP_TOKENS")
    lines.append("#    Consider adding: 'slowly', 'quickly', 'gently', 'smoothly'")
    lines.append("#    These are adverbs that overlap with motion speed params but carry")
    lines.append("#    no discriminative signal for primitive identity.")
    lines.append("")
    lines.append("# 4. Raise threshold from 0.45 to ~0.50 if FPR > 10%")
    lines.append("#    threshold = 0.50  # in match_candidate_to_primitive()")
    lines.append("```")
    lines.append("")

    lines.append("---")
    lines.append("_Generated by `scripts/tests/block_ops/primitive_projection/eval_primitive_projection.py`_")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate primitive projection quality")
    parser.add_argument("--threshold", type=float, default=0.45, help="Score threshold (default: 0.45)")
    parser.add_argument("--verbose", action="store_true", help="Print all individual results")
    parser.add_argument(
        "--corpus",
        type=str,
        default=str(CORPUS_PATH),
        help="Path to corpus JSON (default: eval_corpus.json).",
    )
    parser.add_argument(
        "--report",
        type=str,
        default=str(DEFAULT_REPORT_PATH),
        help="Path (repo-relative) to generated markdown report.",
    )
    args = parser.parse_args()
    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()
