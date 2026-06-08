"""
pixsim7.detection — detection capability (the "verb"): images → zones.

Sibling of pixsim7.backend. Detection code never imports from backend; backend
binds the concrete `DetectionService` implementation at startup via the locator.

Output zones use percentage-based coordinates (0–100 of image dimensions) so
the result projects directly onto the frontend's NpcBodyZone overlay shape
without per-call image-dim translation.

Phase 1 (current): backend binds a `DaemonDetectionService` whose detect()
delegates to a self-contained subprocess (SAM / GroundingDINO / YOLO-World /
whatever the user wires in). The subprocess speaks newline-delimited JSON on
stdin/stdout — the same protocol shape as the embedding daemon.

Phase 2 door open: swap the bound implementation for an HTTP client to a
dedicated inference service. No caller code changes — same protocol.
"""
