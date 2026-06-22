"""Unit tests for the prompt-family-candidate clustering core.

Covers the pure, DB-free logic (`cluster_candidates` + lexical helpers) — the
SQL k-NN stage is exercised separately against pgvector. Plan
`prompt-family-candidates`, checkpoint `clustering-service`.
"""
from __future__ import annotations

from uuid import UUID, uuid4

from pixsim7.backend.main.services.prompt.family_candidates import (
    LABEL_TEMPLATE_CLUSTER,
    LABEL_TWEAK_FAMILY,
    CandidateMember,
    cluster_candidates,
    induce_template_from_texts,
    _jaccard,
    _token_set,
)


def _member(
    *,
    succ: int = 0,
    gens: int = 0,
    family_id: UUID | None = None,
    text: str = "a prompt",
) -> CandidateMember:
    return CandidateMember(
        version_id=uuid4(),
        prompt_text=text,
        successful_assets=succ,
        generation_count=gens,
        family_id=family_id,
    )


def _versions(members: list[CandidateMember]) -> dict[UUID, CandidateMember]:
    return {m.version_id: m for m in members}


# ── jaccard / tokenization ───────────────────────────────────────────────────


def test_token_set_strips_punctuation_and_lowercases():
    assert _token_set("Red, APPLE!  on a table") == {"red", "apple", "on", "a", "table"}


def test_jaccard_identical_and_disjoint():
    a = _token_set("the quick brown fox")
    assert _jaccard(a, a) == 1.0
    assert _jaccard(_token_set("alpha beta"), _token_set("gamma delta")) == 0.0


def test_jaccard_minor_tweak_scores_high():
    base = _token_set("a great dane enters from behind her on its hind legs")
    tweak = _token_set("a great dane enters from behind her on its hind legs slowly")
    # One word added → high overlap; this is the "minor tweak" the lexical gate
    # is meant to keep.
    assert _jaccard(base, tweak) >= 0.85


# ── clustering core ──────────────────────────────────────────────────────────


def test_two_components_form_two_candidates():
    a, b, c, d = (_member(text=f"prompt {i}") for i in range(4))
    versions = _versions([a, b, c, d])
    edges = [(a.version_id, b.version_id), (c.version_id, d.version_id)]

    out = cluster_candidates(versions, edges)

    assert len(out) == 2
    assert {cand.size for cand in out} == {2}


def test_transitive_edges_merge_into_one_cluster():
    a, b, c = (_member() for _ in range(3))
    versions = _versions([a, b, c])
    # a-b and b-c → one component of 3 (union-find transitivity).
    out = cluster_candidates(versions, [(a.version_id, b.version_id), (b.version_id, c.version_id)])
    assert len(out) == 1
    assert out[0].size == 3


def test_singletons_and_below_min_size_excluded():
    a, b, lonely = _member(), _member(), _member()
    versions = _versions([a, b, lonely])
    # lonely has no edges; a-b is a pair.
    out = cluster_candidates(versions, [(a.version_id, b.version_id)], min_size=3)
    assert out == []  # the only component has size 2 < min_size


def test_representative_is_most_successful():
    weak = _member(succ=1, text="weak")
    strong = _member(succ=50, text="strong")
    versions = _versions([weak, strong])

    out = cluster_candidates(versions, [(weak.version_id, strong.version_id)])

    assert out[0].representative.version_id == strong.version_id
    # members are representative-first.
    assert out[0].members[0].version_id == strong.version_id


def test_totals_and_existing_families_aggregated():
    fam = uuid4()
    m1 = _member(succ=3, gens=4, family_id=fam)
    m2 = _member(succ=7, gens=9, family_id=fam)
    m3 = _member(succ=1, gens=2, family_id=None)
    versions = _versions([m1, m2, m3])
    edges = [(m1.version_id, m2.version_id), (m2.version_id, m3.version_id)]

    cand = cluster_candidates(versions, edges)[0]

    assert cand.total_successful_assets == 11
    assert cand.total_generation_count == 15
    assert cand.existing_families == ((fam, 2),)  # two members already in `fam`


def test_ranked_by_groupable_success_desc():
    big1, big2 = _member(succ=100), _member(succ=100)
    small1, small2 = _member(succ=1), _member(succ=1)
    versions = _versions([big1, big2, small1, small2])
    edges = [(big1.version_id, big2.version_id), (small1.version_id, small2.version_id)]

    out = cluster_candidates(versions, edges)

    assert out[0].total_successful_assets == 200
    assert out[1].total_successful_assets == 2


def test_size_label_threshold():
    members = [_member() for _ in range(6)]
    versions = _versions(members)
    # chain them into one component of 6
    ids = [m.version_id for m in members]
    edges = [(ids[i], ids[i + 1]) for i in range(len(ids) - 1)]

    small = cluster_candidates(versions, edges, large_cluster_size=30)
    assert small[0].label == LABEL_TWEAK_FAMILY

    big = cluster_candidates(versions, edges, large_cluster_size=5)
    assert big[0].label == LABEL_TEMPLATE_CLUSTER


def test_max_clusters_trims_lowest_ranked():
    pairs = []
    members = []
    for succ in (5, 4, 3, 2, 1):
        x, y = _member(succ=succ), _member(succ=succ)
        members += [x, y]
        pairs.append((x.version_id, y.version_id))
    out = cluster_candidates(_versions(members), pairs, max_clusters=2)
    assert len(out) == 2
    assert [c.total_successful_assets for c in out] == [10, 8]  # top two by success


def test_suggested_title_nonempty():
    m1 = _member(text="A photorealistic creature standing in a misty forest at dawn")
    m2 = _member(text="A photorealistic creature standing in a misty forest at dusk")
    cand = cluster_candidates(_versions([m1, m2]), [(m1.version_id, m2.version_id)])[0]
    assert cand.suggested_title.strip()


# ── template induction ───────────────────────────────────────────────────────


def test_induce_template_needs_two_members():
    assert induce_template_from_texts(["only one"]) is None
    assert induce_template_from_texts([]) is None


def test_induce_template_identical_is_all_skeleton():
    t = induce_template_from_texts(["the quick brown fox", "the quick brown fox"])
    assert t is not None
    assert t.stable_pct == 100
    assert t.slot_count == 0
    assert [s.kind for s in t.segments] == ["text"]


def test_induce_template_finds_variable_slot():
    # Stable skeleton "a <X> cat sitting on a mat" with the adjective varying.
    texts = [
        "a red cat sitting on a mat",
        "a blue cat sitting on a mat",
        "a green cat sitting on a mat",
    ]
    t = induce_template_from_texts(texts, stable_ratio=0.6)
    assert t is not None
    assert t.slot_count == 1
    slot = next(s.slot for s in t.segments if s.kind == "slot")
    # the varying adjective is captured as the slot's values
    assert {"red", "blue", "green"} & set(slot.values)
    # surrounding words are stable skeleton
    text_runs = " ".join(s.text for s in t.segments if s.kind == "text")
    assert "cat sitting on a mat" in text_runs


def test_induce_template_caps_variants():
    texts = [f"prefix word{i} suffix" for i in range(15)]
    t = induce_template_from_texts(texts, max_variants=5)
    assert t is not None
    slot = next(s.slot for s in t.segments if s.kind == "slot")
    assert len(slot.values) == 5
    assert slot.total >= 15
