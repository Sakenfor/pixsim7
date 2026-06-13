#!/usr/bin/env python3
"""
Tokenizer parity fixture generator.

Records the AUTHORITATIVE Python tokenizer output
(pixsim7/backend/main/services/prompt/parser/tokenizer.py) over the shared
corpus into a fixtures JSON. The TS parity checker
(tools/codegen/check-tokenizer-parity.ts) then asserts the ported TS
tokenizer reproduces these fixtures byte-for-byte.

Together with the TS checker this forms the Python<->TS drift guard for the
prompt mini-language structure layer (plan prompt-variable-placeholders,
checkpoint cp-structure-decouple).

Usage:
    python scripts/gen_tokenizer_parity_fixtures.py            # (re)write fixtures
    python scripts/gen_tokenizer_parity_fixtures.py --check    # fail if fixtures are stale (CI)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
PARSER_DIR = PROJECT_ROOT / "pixsim7" / "backend" / "main" / "services" / "prompt" / "parser"
CORPUS_PATH = PROJECT_ROOT / "packages" / "core" / "prompt" / "src" / "__tests__" / "tokenizer.parity.corpus.json"
FIXTURES_PATH = PROJECT_ROOT / "packages" / "core" / "prompt" / "src" / "__tests__" / "tokenizer.parity.fixtures.json"

# tokenizer.py is dependency-free and loads grammar_rules.json relative to its
# own path, so importing it by directory is safe and self-contained.
if str(PARSER_DIR) not in sys.path:
    sys.path.insert(0, str(PARSER_DIR))

import tokenizer  # noqa: E402  (path injected above)


def build_fixtures() -> str:
    corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    cases = corpus["cases"]
    fixtures = {
        "generated_from": "pixsim7/backend/main/services/prompt/parser/tokenizer.py",
        "corpus": "tokenizer.parity.corpus.json",
        "cases": [
            {"id": case["id"], "text": case["text"], "output": tokenizer.tokenize(case["text"])}
            for case in cases
        ],
    }
    # Trailing newline + 2-space indent to match the repo's JSON artifacts and
    # keep git diffs stable. ensure_ascii=False so unicode stays readable.
    return json.dumps(fixtures, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if committed fixtures are stale")
    args = parser.parse_args()

    generated = build_fixtures()

    if args.check:
        current = FIXTURES_PATH.read_text(encoding="utf-8") if FIXTURES_PATH.exists() else ""
        if current != generated:
            print(
                f"[tokenizer-parity] DRIFT: {FIXTURES_PATH.relative_to(PROJECT_ROOT)} is stale.\n"
                "  Run: python scripts/gen_tokenizer_parity_fixtures.py",
                file=sys.stderr,
            )
            return 1
        print(f"[tokenizer-parity] fixtures up to date ({FIXTURES_PATH.relative_to(PROJECT_ROOT)})")
        return 0

    # newline="\n": keep LF on every platform (Windows text mode would emit
    # CRLF otherwise) so the committed bytes are deterministic and CI-stable.
    FIXTURES_PATH.write_text(generated, encoding="utf-8", newline="\n")
    n = len(json.loads(generated)["cases"])
    print(f"[tokenizer-parity] wrote {n} cases -> {FIXTURES_PATH.relative_to(PROJECT_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
