# Parser, Vocabulary, and Ontology: Authority Analysis

## Purpose

This document maps out how prompt parsing, vocabulary matching, role classification, and tag derivation relate to each other in the current codebase. The goal is to identify where authority over keyword data lives, where it is duplicated, and what a clean single-source-of-truth architecture would look like.

---

## The Systems Involved

### 1. Vocabulary Registry (`shared/ontology/vocabularies/`)

The vocabulary registry is a YAML-driven system that loads structured items from core files and plugin packs. Each vocab type (moods, locations, spatial, poses, etc.) has its own YAML file. Each item within those files has an ID, a label, and often a list of keywords. For example, `mood:tender` in `moods.yaml` has keywords `[tender, gentle, soft, caring]`, and `location:forest` in `locations.yaml` has keywords `[forest, woods, woodland]`.

The registry builds a keyword index at load time. This index maps individual keywords to the vocab item IDs they belong to. For example, the keyword `"tender"` maps to `"mood:tender"`, and `"forest"` maps to `"location:forest"`. The registry exposes a `match_keywords(text)` method that scans text against this index and returns the list of matched item IDs (called ontology IDs throughout the codebase).

The registry also loads prompt role definitions from `prompt_roles.yaml` and composition role definitions from `roles.yaml`. Prompt roles define the parser-facing categories (character, action, mood, setting, romance, camera). Composition roles define the layout-facing categories used by the composition engine (main_character, effect, environment, style_reference). Each prompt role has an optional `composition_role` field that maps between these two namespaces — for example, the `character` prompt role maps to `role:main_character`, and `mood` maps to `role:style_reference`.

The vocabulary registry is plugin-extensible. Plugins can add new vocab items, new vocab types, and override existing items through a layered registry system.

### 2. Ontology Module (`services/prompt/parser/ontology.py`)

This Python module contains hardcoded baseline keyword lists for each prompt role. For example, the `character` role has keywords like `["werewolf", "vampire", "woman", "man", "warrior", "knight"]`, the `mood` role has `["afraid", "anxious", "happy", "tender", "gentle"]`, and so on. It also contains a separate `ACTION_VERBS` list with base forms and conjugations of common verbs like `["enter", "walk", "kiss", "look", "say"]`.

The module has a `sync_from_vocabularies()` function that, when called at startup, pulls keywords from the vocabulary registry's YAML items and appends them to the hardcoded lists. Specifically, it takes keywords from moods and adds them to the mood role list, keywords from locations and adds them to the setting role list, keywords from spatial items and adds them to the camera role list, and keywords from poses and adds them to the action role list.

The keyword lists in this module are mutable globals. After `sync_from_vocabularies()` runs, `ROLE_KEYWORDS` contains the merged result of the hardcoded baseline plus whatever the vocabulary YAML files contributed.

### 3. Prompt Role Registry (`services/prompt/role_registry.py`)

This is a runtime registry that assembles prompt role definitions from multiple sources. When it initializes, it first tries to load `PromptRoleDef` items from the vocabulary registry (the `prompt_roles.yaml` file). If those exist, it merges their metadata (label, description, priority, composition_role) with the keywords from `ontology.py`'s `ROLE_KEYWORDS` global. If no vocab prompt roles are found, it falls back to creating roles purely from the `ROLE_KEYWORDS` dict with hardcoded priorities and descriptions from Python constants.

The registry also supports runtime extension through semantic pack hints. When a semantic pack is active, its `parser_hints` dict (mapping role names to keyword lists) gets merged into the registry, adding new keywords to existing roles or creating entirely new roles.

The parser reads its keyword lists from this registry, not directly from `ontology.py` or the vocabulary YAML files.

### 4. Simple Prompt Parser (`services/prompt/parser/simple.py`)

The parser takes a prompt string, splits it into sentences, and classifies each sentence into a prompt role. For each sentence, it iterates over all roles and their keyword lists, matching keywords in the text using stemming (so "walking" matches "walk") and negation detection (so "not walking" does NOT match "walk"). Each role gets a score based on how many of its keywords matched. The role with the highest score wins.

The parser also resolves ontology IDs. After our recent change, this happens by looking up matched keywords in a keyword-to-ontology-ID index built from the vocabulary registry. Previously, this was a separate call to `match_keywords()` on the vocabulary registry that re-scanned the text independently without stemming or negation.

The parser produces, for each sentence: the winning role, a confidence score, the list of matched keywords, scores for all roles, and a list of ontology IDs.

### 5. DSL Adapter (`services/prompt/parser/dsl_adapter.py`)

The adapter takes the parser's output and normalizes it into the candidate schema used by the rest of the system. It also derives tags from the candidates. Tags come from three sources: role-based tags (like `has:character`, `has:mood`), sub-tags derived from matched keywords using `_TAG_KEYWORD_RULES` (like `tone:soft`, `camera:pov`), and ontology-based tags derived from the ontology IDs in the candidate metadata (like `mood:tender`, `location:forest`).

### 6. Composition Roles (`roles.yaml` in vocabulary system)

These are the roles that the downstream composition engine uses for layout, layering, and rendering decisions. They include things like `role:main_character`, `role:supporting_character`, `role:environment`, `role:effect`, `role:style_reference`. Each has properties like color, default layer, influence type, and slot bindings.

Prompt roles map to composition roles through the `composition_role` field in `prompt_roles.yaml`. This is how the parser's classification eventually feeds into the composition pipeline.

---

## Where Keywords Come From: The Current Reality

This is the core of the problem. When the parser classifies a sentence, it uses keyword lists that were assembled from multiple sources through multiple merge operations. Here is the full chain for how the keyword list for, say, the `mood` role is built:

**Source A: ontology.py baseline.** The `_BASELINE_ROLE_KEYWORDS` dict in `ontology.py` has a hardcoded list for `mood` containing words like `afraid`, `anxious`, `nervous`, `happy`, `joyful`, `tender`, `gentle`, `passionate`, `angry`, `sad`, `tense`, `relaxed`, `soft`, `intense`, `harsh`, `rough`, `violent`.

**Source B: vocabulary YAML items.** The `moods.yaml` file in the starter pack defines individual mood items, each with their own keyword lists. For example, `mood:tender` has `[tender, gentle, soft, caring]`, `mood:passionate` has `[passionate, intense, heated, fervent]`, `mood:fearful` has `[fearful, scared, afraid, frightened]`. These keywords partially overlap with Source A.

**Merge step 1: sync_from_vocabularies().** When this runs at startup, it iterates all mood items from the vocabulary registry, extracts their keywords, and appends any that are not already present to `ROLE_KEYWORDS["mood"]`. After this step, `ROLE_KEYWORDS["mood"]` contains the baseline list plus any new keywords from YAML that were not in the baseline (like `caring`, `heated`, `fervent`, `frightened`).

**Source C: prompt_roles.yaml.** The vocab `PromptRoleDef` for `mood` could theoretically have a `keywords` field, but currently it does not — the keywords field is empty for all core prompt roles in the starter pack.

**Merge step 2: PromptRoleRegistry._register_builtin_roles().** This method loads prompt role definitions from the vocabulary registry AND the `ROLE_KEYWORDS` global from `ontology.py`. It calls `self._merge_keywords(ROLE_KEYWORDS.get(role_id, []), getattr(role, "keywords", []))` — merging the already-sync'd `ROLE_KEYWORDS` global with any keywords from the vocab `PromptRoleDef` (currently empty). So in practice this is just reading the result of merge step 1.

**Source D: semantic pack hints (runtime).** When semantic packs are active, their `parser_hints` are applied to the PromptRoleRegistry, adding even more keywords. For example, a fantasy pack might add `["lich", "wraith", "specter"]` to the character role.

The end result is that the parser's keyword list for `mood` is: hardcoded Python baseline + YAML mood item keywords (via sync) + YAML prompt role keywords (currently empty) + runtime semantic pack hints. Nobody can look at one place and see the full keyword list.

---

## Specific Problems

### Problem 1: Dual authority over keywords

The hardcoded Python baseline in `ontology.py` and the YAML vocabulary items both define keywords for the same concepts. The word `"afraid"` appears in both `ontology.py`'s mood baseline and `moods.yaml`'s `mood:fearful` item. The word `"tender"` appears in both `ontology.py`'s mood baseline and `moods.yaml`'s `mood:tender` item. There is no single place that authoritatively declares "these are the keywords for mood classification."

If someone wants to add a new mood keyword, should they add it to `ontology.py`? To `moods.yaml`? To `prompt_roles.yaml`? All three could work, and all three have been used at different times for different keywords. This makes the system unpredictable for contributors.

### Problem 2: sync_from_vocabularies() is a redundant middle layer

This function exists to copy keywords from vocabulary YAML items into the `ROLE_KEYWORDS` mutable global. But `PromptRoleRegistry` already reads from both sources directly during `_register_builtin_roles()`. The sync function was likely necessary before `PromptRoleRegistry` existed, when the parser read directly from `ROLE_KEYWORDS`. Now it's a redundant copy step that makes the data flow harder to trace.

It also has a structural limitation: it only syncs keywords from moods, locations, spatial, and poses. If a new vocab type is added (say, `clothing` or `weather`), someone would need to remember to add another loop to `sync_from_vocabularies()` for it to affect the parser. The vocabulary registry's keyword index is already type-agnostic and handles this automatically.

### Problem 3: ACTION_VERBS has no YAML representation

The `ACTION_VERBS` list is a pure Python constant in `ontology.py`. It contains about 70 verb forms. There is no way for a plugin or semantic pack to extend this list through YAML. The hint system only extends role keywords, not the action verb list. If someone creates a fantasy pack and wants verbs like "conjure" or "enchant" to be recognized as action verbs, they cannot do so through the vocabulary system.

### Problem 4: prompt_roles.yaml defines structure but not substance

The `prompt_roles.yaml` file in the starter pack defines each prompt role's label, description, priority, and composition_role mapping. But it does not define keywords. This means a prompt role's identity is split: its structural properties (what it's called, how important it is, what composition role it maps to) live in YAML, but its behavioral properties (what keywords trigger it) live in Python.

This split means you cannot define a fully functional new prompt role purely through YAML. You can add a new entry to `prompt_roles.yaml` with a label and priority, but without adding keywords to `ontology.py` or providing them through semantic pack hints, the parser will never classify anything into that role.

### Problem 5: The keyword-to-ontology bridge is asymmetric

The vocabulary registry's keyword index maps keywords to specific vocab item IDs (like `"tender"` to `"mood:tender"`). But the parser's role keyword lists are flat — they know that `"tender"` is a mood keyword but not which specific mood item it belongs to.

We recently bridged this by having the parser look up ontology IDs from its matched keywords using `get_keyword_to_ids()`. But this only works for keywords that exist in BOTH the role keyword list AND the vocab item keyword list. If a keyword exists only in `ontology.py`'s baseline (not in any YAML item), it will match for role classification but produce no ontology ID. If a keyword exists only in a YAML item but was not sync'd to the role keywords, it will have an entry in the keyword-to-ID index but will never be matched by the parser.

### Problem 6: Sub-tag rules are a separate hardcoded authority

The `_TAG_KEYWORD_RULES` dict in `dsl_adapter.py` maps keywords to sub-tags like `tone:soft` and `camera:pov`. These rules are informed by the vocabulary data (the keywords in the rules correspond to keywords in mood and spatial vocab items) but are maintained separately. If someone adds a new mood item to YAML with keywords that semantically indicate "soft tone", the sub-tag rules will not automatically pick it up.

The vocabulary items already have structured metadata that could drive this. Mood items have a `category` field (`positive`, `negative`, `romantic`, `action`, `neutral`) and a `tension_range`. Spatial items have a `category` field (`camera_view`, `camera_framing`, `body_orientation`, `depth`). This metadata could be used to derive sub-tags programmatically rather than maintaining a separate mapping.

---

## What the Clean Architecture Would Look Like

The core principle: YAML vocabularies should be the single source of truth for all keyword data. Python code should consume this data, not duplicate it.

### Keywords move to YAML

The hardcoded `_BASELINE_ROLE_KEYWORDS` in `ontology.py` would move to `prompt_roles.yaml`. Each prompt role definition would gain a `keywords` field containing the role-level keywords that are currently hardcoded. For example:

```yaml
mood:
  label: "Mood"
  priority: 50
  composition_role: role:style_reference
  keywords: [afraid, anxious, nervous, happy, joyful, tender, gentle, passionate, angry, sad, tense, relaxed, soft, intense, harsh, rough, violent]
```

The vocabulary registry would then be the single place where all keywords — both role-level and item-level — are defined and maintained.

### ACTION_VERBS moves to YAML

Action verbs would become either a field on the `action` prompt role definition or a new lightweight vocab type. Semantic packs and plugins could then extend the verb list through the standard vocab extension mechanism.

### sync_from_vocabularies() is removed

With keywords living in YAML and the PromptRoleRegistry reading from the vocabulary registry, there is no need for a sync step that copies YAML data into Python globals. The `ontology.py` module either becomes a thin compatibility shim or is removed entirely.

### PromptRoleRegistry reads only from VocabularyRegistry

Instead of merging `ROLE_KEYWORDS` (from Python) with vocab prompt role keywords (from YAML), the registry would read everything from the vocabulary registry. The merge logic simplifies to: vocab prompt role keywords + vocab item keywords (aggregated by role mapping) + runtime semantic pack hints.

The aggregation of vocab item keywords by role could work through the `composition_role` mapping or through a new `prompt_role` field on vocab items. For example, all mood items' keywords would automatically contribute to the `mood` prompt role's keyword list because mood items are in the moods vocab type and the moods vocab type maps to the mood prompt role.

### Sub-tag rules derive from vocab metadata

Instead of maintaining `_TAG_KEYWORD_RULES` as a hardcoded dict, the tag derivation system would query vocab item metadata. For example, when a candidate has `mood:tender` in its ontology IDs, the system looks up `mood:tender`'s category (`romantic`) and tension range (`[3, 7]`) and derives that this is a "soft" tone. When it has `mood:passionate`, the higher tension range (`[6, 10]`) indicates "intense" tone. For camera sub-tags, the spatial item's category directly provides the classification (`camera_view`, `camera_framing`, etc.).

This would mean that adding a new mood item to YAML with appropriate category and tension range would automatically affect both role classification AND sub-tag derivation, with no Python code changes needed.

### The parser does a single matching pass

With the keyword-to-ontology bridge in place (which we have already implemented), the parser performs one matching pass with stemming and negation, and from that single pass derives: the winning role, confidence scores for all roles, the list of matched keywords, the ontology IDs (resolved from matched keywords via the vocab index), and sub-tags (resolved from ontology IDs via vocab item metadata or from matched keywords via tag rules).

---

## Current Data Flow Summary

When a user types a prompt and it gets parsed, the following happens in sequence:

1. The SimplePromptParser is instantiated. During initialization, it gets its keyword lists from PromptRoleRegistry, which assembled them from ontology.py's ROLE_KEYWORDS (which may have been enriched by sync_from_vocabularies from YAML items) merged with prompt_roles.yaml keywords (currently empty) and any semantic pack hints. It also gets a keyword-to-ontology-ID lookup from the vocabulary registry.

2. The parser splits the prompt into sentences and classifies each sentence by matching keywords with stemming and negation. For each matched keyword, it also resolves ontology IDs using the keyword-to-ID lookup.

3. The DSL adapter takes the parser output and produces normalized candidates. It derives tags from the candidates: role-based tags from the winning role, sub-tags from matched keywords using the TAG_KEYWORD_RULES dict, and ontology-based tags from the ontology IDs.

4. The candidates and tags are returned to the caller (typically the prompt inspector UI or the generation pipeline), where the prompt role can be mapped to a composition role using the prompt_roles.yaml composition_role field, and the composition engine uses the composition role for layout decisions.

---

## What Was Recently Changed

Two rounds of changes were made to reduce the redundancy between the three matching systems:

**Round 1:** The hardcoded inline keyword checks in the DSL adapter's tag derivation function were replaced with a data-driven `_TAG_KEYWORD_RULES` dict that reads from the parser's `matched_keywords` output. Missing keywords were added to the ontology baseline so they enter the parser pipeline. This means sub-tags now benefit from stemming and negation detection.

**Round 2:** The parser's separate call to the vocabulary registry's `match_keywords()` was eliminated. Instead, the parser now builds a keyword-to-ontology-ID lookup at init time (using a new `get_keyword_to_ids()` method on the vocabulary registry) and resolves ontology IDs from the keywords it already matched during its role classification pass. This means ontology matching now inherits stemming and negation from the parser, fixing bugs where negated terms (like "not tender") still produced ontology IDs (like `mood:tender`).

These changes collapsed three independent matching passes (parser role classification, vocab ontology matching, tag keyword checking) into a single pass with two lookups. But the underlying authority problem — keywords defined in multiple places — remains.
